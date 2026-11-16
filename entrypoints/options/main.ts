import { browser } from 'wxt/browser';
import { bangDomain } from '@/lib/bangs';
import { ensureSeeded, type RefreshResult } from '@/lib/data';
import { ALL_ENGINE_HOSTS, ENGINES } from '@/lib/engines';
import { extractBang } from '@/lib/query';
import { DISABLED_ENGINES_KEY, getDisabledEngines } from '@/lib/rules';
import { getBang, getMeta } from '@/lib/store';
import { buildUrl } from '@/lib/url';
import type { Message } from '../background';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const send = <T>(msg: Message) => browser.runtime.sendMessage(msg) as Promise<T>;

// --- Try box --------------------------------------------------------------
const tryInput = $<HTMLInputElement>('try');
let tryToken = 0;
tryInput.addEventListener('input', async () => {
  const token = ++tryToken;
  const parsed = extractBang(tryInput.value);
  const bang = parsed && (await getBang(parsed.trigger));
  if (token !== tryToken) return;

  const result = $('try-result');
  const pill = $('try-pill');
  const link = $<HTMLAnchorElement>('try-url');
  result.hidden = !parsed;
  if (!parsed) return;

  pill.replaceChildren();
  pill.classList.toggle('unknown', !bang);
  if (bang) {
    pill.textContent = bang.s;
    pill.title = bangDomain(bang);
    link.href = link.textContent = buildUrl(bang, parsed.terms);
  } else {
    pill.textContent = `!${parsed.trigger}`;
    link.removeAttribute('href');
    link.textContent = 'Unknown bang. The search goes to your default engine unchanged.';
  }
});

// --- Collection status ------------------------------------------------------
const fmtTime = (ms: number) => (ms ? new Date(ms).toLocaleString() : 'never');

async function renderMeta() {
  await ensureSeeded();
  const meta = await getMeta();
  const rows: [string, string][] = meta
    ? [
        ['Bangs', meta.count.toLocaleString() + ' triggers'],
        ['Source', meta.source === 'remote' ? 'Downloaded' : 'Bundled snapshot'],
        ['Updated', fmtTime(meta.updatedAt)],
        ['Last checked', fmtTime(meta.checkedAt)],
      ]
    : [['Bangs', 'not loaded']];
  $('meta').replaceChildren(
    ...rows.flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = k;
      dd.textContent = v;
      return [dt, dd];
    }),
  );
}

const refreshBtn = $<HTMLButtonElement>('refresh');
refreshBtn.addEventListener('click', async () => {
  refreshBtn.disabled = true;
  $('refresh-status').textContent = 'Checking…';
  const res = await send<RefreshResult>({ type: 'refresh' });
  $('refresh-status').textContent =
    res.status === 'updated' ? 'Updated.' : res.status === 'unchanged' ? 'Already up to date.' : res.status === 'error' ? `Failed: ${res.error}` : '';
  refreshBtn.disabled = false;
  await renderMeta();
});

// --- Engines ----------------------------------------------------------------
async function renderEngines() {
  const disabled = new Set(await getDisabledEngines());
  $('engines').replaceChildren(
    ...ENGINES.map((e) => {
      const li = document.createElement('li');
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !disabled.has(e.id);
      box.addEventListener('change', async () => {
        const now = new Set(await getDisabledEngines());
        if (box.checked) now.delete(e.id);
        else now.add(e.id);
        await browser.storage.local.set({ [DISABLED_ENGINES_KEY]: [...now] });
        await send({ type: 'rules' });
      });
      label.append(box, e.name);
      li.append(label);
      return li;
    }),
  );
}

async function checkPermissions() {
  const has = await browser.permissions.contains({ origins: ALL_ENGINE_HOSTS });
  $('perm-warning').hidden = has;
}
$('grant').addEventListener('click', async () => {
  await browser.permissions.request({ origins: ALL_ENGINE_HOSTS });
  await checkPermissions();
});

void renderMeta();
void renderEngines();
void checkPermissions();
