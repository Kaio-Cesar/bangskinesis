/**
 * End-to-end check of the Chrome build: loads .output/chrome-mv3 into
 * Playwright's Chromium and verifies DNR interception + redirect page.
 *
 *   bun run build && bun run e2e
 *
 * Requires a Playwright Chromium (`bunx playwright-core install chromium`).
 */
import { chromium } from 'playwright-core';

declare const chrome: any;
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ext = resolve(import.meta.dir, '../.output/chrome-mv3');
const profile = mkdtempSync(join(tmpdir(), 'bangskinesis-e2e-'));

const ctx = await chromium.launchPersistentContext(profile, {
  headless: false,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--headless=new'],
});

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};

try {
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  console.log('extension id', id);

  // Wait until the install handler registered rules.
  for (let i = 0; i < 50; i++) {
    const n = await sw.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length);
    if (n > 1) break;
    await Bun.sleep(100);
  }
  const rules = await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
  check('dynamic rules registered', rules.length > 1, `${rules.length} rules`);

  const page = await ctx.newPage();
  // Don't actually load third-party sites: record the navigation, return a stub.
  const hits: string[] = [];
  await ctx.route(/^https:\/\/(?!services\.helium)/, (route) => {
    if (route.request().isNavigationRequest()) hits.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>stub' });
  });

  const cases: [string, (u: string) => boolean][] = [
    ['https://www.google.com/search?q=%21dev+react&sourceid=chrome&ie=UTF-8', (u) => u === 'https://devdocs.io/#q=react'],
    ['https://www.google.com.br/search?q=react+hooks+%21gh', (u) => u.startsWith('https://github.com/search?') && u.includes('react+hooks')],
    ['https://www.bing.com/search?q=!yt&form=QBLH', (u) => u === 'https://www.youtube.com/'],
    ['https://www.google.com/search?q=%21notabangxyz+foo', (u) => u.includes('google.com/search') && u.includes('bk=0')],
    ['https://www.google.com/search?q=plain+query', (u) => u === 'https://www.google.com/search?q=plain+query'],
  ];

  for (const [from, ok] of cases) {
    hits.length = 0;
    const t0 = performance.now();
    await page.goto(from, { waitUntil: 'commit' }).catch(() => {});
    await page.waitForURL((u) => !u.href.startsWith('chrome-extension:') && u.href !== from || ok(u.href), { timeout: 5000 }).catch(() => {});
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    const final = page.url();
    check(from, ok(final), `-> ${final} in ${Math.round(performance.now() - t0)}ms`);
    if (from.includes('%21dev')) check('engine never contacted', !hits.some((h) => h.includes('google.')), hits.join(', '));
  }

  // History must not contain the redirect page.
  const historyLen: number = await page.evaluate(() => window.history.length);
  check('redirect page kept out of history', historyLen <= cases.length + 1, `history.length=${historyLen}`);

  // Options page: status, try box, manual refresh.
  await ctx.unroute(/^https:\/\/(?!services\.helium)/);
  const opts = await ctx.newPage();
  await opts.goto(`chrome-extension://${id}/options.html`);
  await opts.locator('#meta dd').first().waitFor();
  const count = await opts.locator('#meta dd').first().textContent();
  check('options shows bang count', /\d{2},?\d{3} triggers/.test(count ?? ''), count ?? '');
  await opts.fill('#try', '!dev react hooks');
  await opts.locator('#try-pill').filter({ hasText: 'DevDocs' }).waitFor({ timeout: 3000 }).catch(() => {});
  check('try box resolves', (await opts.locator('#try-url').textContent()) === 'https://devdocs.io/#q=react%20hooks');
  // Wait for the install-time download to land, then a manual refresh must be a 304.
  for (let i = 0; i < 30 && !(await opts.locator('#meta').textContent())?.includes('Downloaded'); i++) {
    await Bun.sleep(500);
    await opts.reload();
    await opts.locator('#meta dd').first().waitFor();
  }
  check('install downloaded the remote collection', !!(await opts.locator('#meta').textContent())?.includes('Downloaded'));
  await opts.click('#refresh');
  await opts.locator('#refresh-status').filter({ hasText: /Updated|up to date|Failed/ }).waitFor({ timeout: 20000 });
  const status = await opts.locator('#refresh-status').textContent();
  // The install handler already downloaded the file, so this must be a 304.
  check('manual refresh is a conditional 304', status === 'Already up to date.', status ?? '');
  if (process.env.SCREENSHOT) await opts.screenshot({ path: process.env.SCREENSHOT, fullPage: true });
} finally {
  await ctx.close();
  rmSync(profile, { recursive: true, force: true });
}

process.exit(failures ? 1 : 0);
