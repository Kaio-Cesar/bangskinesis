/**
 * Build-time snapshot: fetch bangs.json and write a compact, plain-JSON copy
 * to public/ so a fresh install works immediately (and offline) before the
 * first background refresh. Keeps the previous snapshot if the fetch fails.
 */
import { BANGS_URL, parseBangs } from '../lib/bangs';

const out = new URL('../public/bangs.snapshot.json', import.meta.url);

try {
  const res = await fetch(BANGS_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const list = parseBangs(await res.text()).map(({ s, ts, u, f }) => (f ? { s, ts, u, f } : { s, ts, u }));
  await Bun.write(out, JSON.stringify(list));
  console.log(`bangs snapshot: ${list.length} entries -> public/bangs.snapshot.json`);
} catch (err) {
  if (await Bun.file(out).exists()) {
    console.warn(`bangs snapshot: fetch failed (${err}); keeping existing snapshot`);
  } else {
    console.error(`bangs snapshot: fetch failed and no snapshot exists: ${err}`);
    process.exit(1);
  }
}
