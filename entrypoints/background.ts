import { browser, type Browser } from 'wxt/browser';
import { bangDomain, type Bang } from '@/lib/bangs';
import { getIndex, prefixSearch, refresh } from '@/lib/data';
import { extractBang } from '@/lib/query';
import { registerRules } from '@/lib/rules';
import { buildUrl } from '@/lib/url';

const ALARM = 'refresh-bangs';

export type Message = { type: 'refresh' } | { type: 'rules' } | { type: 'seed' } | { type: 'resolve'; trigger: string };

function handle(msg: Message): Promise<unknown> | null {
  switch (msg.type) {
    case 'refresh':
      return refresh(true);
    case 'rules':
      return registerRules().then(() => ({ ok: true }));
    case 'seed':
      // Fill an empty cache (e.g. a new Chrome incognito session) in the background.
      return getIndex().then(() => ({ ok: true }));
    case 'resolve':
      // Lookup on behalf of pages without IndexedDB (Firefox private windows).
      return getIndex().then(({ map }) => map.get(msg.trigger) ?? null);
    default:
      return null;
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async () => {
    await registerRules();
    await browser.alarms.create(ALARM, { periodInMinutes: 6 * 60, delayInMinutes: 1 });
    await refresh(true);
  });

  browser.runtime.onStartup.addListener(() => void refresh());

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void refresh();
  });

  // sendResponse + `return true` (not a returned Promise) for older Chrome.
  browser.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
    const work = handle(msg);
    if (!work) return false;
    work.then(sendResponse, (err) => sendResponse({ status: 'error', error: String(err) }));
    return true;
  });

  setupOmnibox();
});

// --- Omnibox keyword mode -------------------------------------------------
// Type `!` then Space/Tab: the browser shows its keyword chip, and the
// suggestions preview which site the bang resolves to (closest thing to
// Helium's in-omnibox pill an extension can do).

const FIREFOX = import.meta.env.FIREFOX;

/** Chrome renders a small XML dialect in descriptions; Firefox shows plain text. */
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const fmt = {
  match: (s: string) => (FIREFOX ? s : `<match>${xml(s)}</match>`),
  dim: (s: string) => (FIREFOX ? s : `<dim>${xml(s)}</dim>`),
  url: (s: string) => (FIREFOX ? s : `<url>${xml(s)}</url>`),
  text: (s: string) => (FIREFOX ? s : xml(s)),
};

function parseInput(text: string) {
  const trimmed = text.trimStart();
  const [first = '', ...rest] = trimmed.split(/\s+/);
  return { trigger: first.replace(/^!/, '').toLowerCase(), terms: rest.join(' '), typingTrigger: !/\s/.test(trimmed) };
}

function describe(bang: Bang, terms: string) {
  const domain = bangDomain(bang);
  return terms.trim()
    ? `${fmt.match(bang.s)} ${fmt.dim('—')} ${fmt.text('search')} ${fmt.url(domain)} ${fmt.text('for')} ${fmt.match(terms.trim())}`
    : `${fmt.match(bang.s)} ${fmt.dim('—')} ${fmt.text('open')} ${fmt.url(domain)}`;
}

function setupOmnibox() {
  browser.omnibox.setDefaultSuggestion({ description: fmt.text('Type a bang, e.g. "dev react" or "yt lofi"') });

  browser.omnibox.onInputChanged.addListener(async (text, suggest) => {
    const { map, ...idx } = await getIndex();
    const { trigger, terms, typingTrigger } = parseInput(text);
    const exact = map.get(trigger);

    browser.omnibox.setDefaultSuggestion({
      description: exact
        ? describe(exact, terms)
        : trigger
          ? `${fmt.text('Unknown bang')} ${fmt.match('!' + trigger)} ${fmt.dim('— Enter searches with your default engine')}`
          : fmt.text('Type a bang, e.g. "dev react" or "yt lofi"'),
    });

    if (!trigger || !typingTrigger) return suggest([]);
    const seen = new Set<Bang>(exact ? [exact] : []);
    const suggestions: Browser.omnibox.SuggestResult[] = [];
    for (const t of prefixSearch({ map, ...idx }, trigger, 30)) {
      const bang = map.get(t)!;
      if (seen.has(bang)) continue;
      seen.add(bang);
      suggestions.push({
        content: `${t} `,
        description: `${fmt.match('!' + t)} ${fmt.text(bang.s)} ${fmt.dim('— ' + bangDomain(bang))}`,
      });
      if (suggestions.length === 8) break;
    }
    suggest(suggestions);
  });

  browser.omnibox.onInputEntered.addListener(async (text, disposition) => {
    const { map } = await getIndex();
    const { trigger, terms } = parseInput(text);
    // Also accept "react !dev" inside keyword mode.
    const parsed = map.has(trigger) ? { trigger, terms } : extractBang(text);
    const bang = parsed && map.get(parsed.trigger);

    if (!bang) {
      const where = disposition === 'currentTab' ? 'CURRENT_TAB' : 'NEW_TAB';
      return browser.search.query({ text, disposition: where });
    }
    const url = buildUrl(bang, parsed.terms);
    if (disposition === 'currentTab') return browser.tabs.update({ url });
    return browser.tabs.create({ url, active: disposition === 'newForegroundTab' });
  });
}
