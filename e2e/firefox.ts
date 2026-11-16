/**
 * End-to-end check of the Firefox build over WebDriver BiDi (Firefox 138+):
 * launches a headless Firefox with a throwaway profile, installs
 * .output/firefox-mv3 as a temporary add-on and checks the redirects.
 *
 *   bun run build:firefox && bun run e2e:firefox
 *
 * PRIVATE=window  run the checks in a private window of a normal session
 * PRIVATE=always  permanent private browsing ("Never remember history")
 *
 * Set FIREFOX_BIN to override the Firefox executable path.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const bin =
  process.env.FIREFOX_BIN ??
  (process.platform === 'win32'
    ? 'C:/Program Files/Mozilla Firefox/firefox.exe'
    : process.platform === 'darwin'
      ? '/Applications/Firefox.app/Contents/MacOS/firefox'
      : 'firefox');
const ext = resolve(import.meta.dir, '../.output/firefox-mv3');
const profile = mkdtempSync(join(tmpdir(), 'bangskinesis-ff-'));
const PRIVATE_MODE = process.env.PRIVATE === 'always' ? 'always' : process.env.PRIVATE ? 'window' : undefined;
const PRIVATE = !!PRIVATE_MODE;
if (PRIVATE_MODE === 'always') await Bun.write(join(profile, 'user.js'), 'user_pref("browser.privatebrowsing.autostart", true);\n');
console.log(`mode: ${PRIVATE_MODE === 'window' ? 'private window' : PRIVATE_MODE === 'always' ? 'permanent private browsing' : 'normal'}`);
const port = 9300 + Math.floor(Math.random() * 500);

const proc = Bun.spawn([bin, '--headless', '--no-remote', '--profile', profile, `--remote-debugging-port=${port}`], {
  env: { ...process.env, ...(PRIVATE && { MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' }) },
  stdout: 'ignore',
  stderr: 'ignore',
});

let ws: WebSocket | undefined;
let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};

try {
  for (let i = 0; i < 100 && !ws; i++) {
    await Bun.sleep(200);
    ws = await new Promise<WebSocket | undefined>((res) => {
      const s = new WebSocket(`ws://127.0.0.1:${port}/session`);
      s.onopen = () => res(s);
      s.onerror = () => res(undefined);
    });
  }
  if (!ws) throw new Error('could not connect to Firefox BiDi');

  let nextId = 1;
  const pending = new Map<number, (m: any) => void>();
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    if (m.id && pending.has(m.id)) pending.get(m.id)!(m);
    if (m.method === 'log.entryAdded' && m.params.level === 'error' && m.params.text.includes('BangsKinesis'))
      console.log(`  console: ${m.params.text}`);
  };
  const send = (method: string, params: object = {}) =>
    new Promise<any>((res, rej) => {
      const id = nextId++;
      pending.set(id, (m) => (m.type === 'error' ? rej(new Error(`${method}: ${m.error} ${m.message}`)) : res(m.result)));
      ws!.send(JSON.stringify({ id, method, params }));
    });

  await send('session.new', { capabilities: {} });
  await send('session.subscribe', { events: ['log.entryAdded'] });
  const { extension } = await send('webExtension.install', { extensionData: { type: 'path', path: ext } });
  check('temporary add-on installed', !!extension, extension);

  if (PRIVATE) {
    // Same as about:addons → "Run in Private Windows: Allow" (needs system access).
    const { contexts } = await send('browsingContext.getTree', { 'moz:scope': 'chrome' });
    const { result } = await send('script.evaluate', {
      target: { context: contexts[0].context },
      awaitPromise: true,
      expression: `(async () => {
        const id = ${JSON.stringify(extension)};
        const { ExtensionPermissions } = ChromeUtils.importESModule('resource://gre/modules/ExtensionPermissions.sys.mjs');
        const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
        await ExtensionPermissions.add(id, { permissions: ['internal:privateBrowsingAllowed'], origins: [] });
        await (await AddonManager.getAddonByID(id)).reload();
        for (let i = 0; i < 50 && !WebExtensionPolicy.getByID(id)?.privateBrowsingAllowed; i++) await new Promise((r) => setTimeout(r, 100));
        return !!WebExtensionPolicy.getByID(id)?.privateBrowsingAllowed;
      })()`,
    });
    check('allowed in private windows', result.value === true);
  }
  await Bun.sleep(3000); // let onInstalled seed the cache and register rules

  let context: string;
  if (PRIVATE_MODE === 'window') {
    // Open a real private window next to the normal one and use its tab.
    const before = new Set((await send('browsingContext.getTree', { maxDepth: 0 })).contexts.map((c: any) => c.context));
    const { contexts } = await send('browsingContext.getTree', { 'moz:scope': 'chrome' });
    await send('script.evaluate', {
      target: { context: contexts[0].context },
      awaitPromise: false,
      expression: 'void OpenBrowserWindow({ private: true })',
    });
    let found: string | undefined;
    for (let i = 0; i < 50 && !found; i++) {
      await Bun.sleep(100);
      found = (await send('browsingContext.getTree', { maxDepth: 0 })).contexts.map((c: any) => c.context).find((c: string) => !before.has(c));
    }
    if (!found) throw new Error('private window did not open');
    context = found;
    const { result } = await send('script.evaluate', {
      target: { context: contexts[0].context },
      awaitPromise: false,
      expression: '[...Services.wm.getEnumerator("navigator:browser")].some((w) => PrivateBrowsingUtils.isWindowPrivate(w))',
    });
    check('private window opened', result.value === true);
  } else {
    context = (await send('browsingContext.create', { type: 'tab' })).context;
  }

  const cases: [string, (u: string) => boolean][] = [
    ['https://www.google.com/search?client=firefox-b-d&q=%21dev+react', (u) => u === 'https://devdocs.io/#q=react'],
    ['https://www.google.com/search?q=react+hooks+%21gh', (u) => u.startsWith('https://github.com/search?') && u.includes('react+hooks')],
    ['https://www.bing.com/search?q=!yt', (u) => u === 'https://www.youtube.com/'],
    ['https://www.google.com/search?q=%21notabangxyz+foo', (u) => u.includes('bk=0')],
  ];
  for (const [from, ok] of cases) {
    await send('browsingContext.navigate', { context, url: from, wait: 'none' }).catch(() => {});
    let url = '';
    for (let i = 0; i < 50; i++) {
      await Bun.sleep(100);
      // getTree errors while the tab shows the privileged moz-extension page.
      url = (await send('browsingContext.getTree', { root: context }).catch(() => null))?.contexts[0].url ?? url;
      if (ok(url)) break;
    }
    check(from, ok(url), `-> ${url}`);
  }
} catch (err) {
  check('run', false, String(err));
} finally {
  ws?.close();
  proc.kill();
  await proc.exited;
  await Bun.sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {}
}

process.exit(failures ? 1 : 0);
