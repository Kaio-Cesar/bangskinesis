/**
 * Target of the DNR redirect: `redirect.html#<original search URL>`.
 * Resolves the bang from the cache and replaces this page (so it never
 * appears in history). Unknown bangs bounce back to the engine with a
 * bypass marker that a higher-priority DNR "allow" rule exempts.
 */
import { browser } from 'wxt/browser';
import type { Bang } from '@/lib/bangs';
import { loadSnapshot } from '@/lib/data';
import { BYPASS_PARAM, ENGINES, engineRegex } from '@/lib/engines';
import { extractBang } from '@/lib/query';
import { getBang, getMeta } from '@/lib/store';
import { buildUrl } from '@/lib/url';
import type { Message } from '../background';

/** Look the trigger up in this context's IndexedDB cache. */
async function lookupLocal(trigger: string): Promise<Bang | undefined> {
  const bang = await getBang(trigger);
  if (bang || (await getMeta())) return bang;
  // Empty cache (first run, or each new Chrome incognito session): answer from
  // the bundled snapshot right away and let the background fill the cache, so
  // the redirect doesn't wait for ~13k IndexedDB writes.
  browser.runtime.sendMessage({ type: 'seed' } satisfies Message).catch(() => {});
  return (await loadSnapshot()).get(trigger);
}

async function lookup(trigger: string): Promise<Bang | undefined> {
  try {
    return await lookupLocal(trigger);
  } catch {
    // Firefox private windows deny extension pages IndexedDB; the background
    // runs in the normal context and can answer from its cache instead.
    const bang = await browser.runtime.sendMessage({ type: 'resolve', trigger } satisfies Message);
    return (bang as Bang | null) ?? undefined;
  }
}

async function resolve(original: URL): Promise<string | null> {
  const href = original.href;
  const engine = ENGINES.find((e) => new RegExp(engineRegex(e), 'i').test(href));
  const query = engine && original.searchParams.get(engine.param);
  const parsed = query && extractBang(query);
  if (!parsed) return null;
  const bang = await lookup(parsed.trigger);
  return bang ? buildUrl(bang, parsed.terms) : null;
}

function bypass(original: URL): string {
  original.searchParams.set(BYPASS_PARAM, '0');
  return original.href;
}

const raw = location.hash.slice(1);
let original: URL | null = null;
try {
  original = new URL(raw);
} catch {}

if (original && /^https?:$/.test(original.protocol)) {
  const o = original;
  void resolve(o)
    .catch((err) => {
      console.error('BangsKinesis: bang lookup failed', err);
      return null;
    })
    .then((target) => location.replace(target ?? bypass(o)));
}
