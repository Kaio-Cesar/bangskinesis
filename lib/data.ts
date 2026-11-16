import { browser } from 'wxt/browser';
import { BANGS_URL, indexBangs, parseBangs, type Bang, type RawBang } from './bangs';
import { getAllBangs, getMeta, replaceAll, setMeta, type Meta } from './store';

const DAY = 24 * 60 * 60 * 1000;

/** First run: seed the cache from the snapshot bundled with the extension. */
export async function ensureSeeded(): Promise<void> {
  if (await getMeta()) return;
  const res = await fetch(browser.runtime.getURL('/bangs.snapshot.json'));
  const list = (await res.json()) as RawBang[];
  await replaceAll(indexBangs(list), { etag: null, updatedAt: Date.now(), checkedAt: 0, source: 'snapshot' });
  invalidateIndex();
}

export type RefreshResult = { status: 'updated' | 'unchanged' | 'skipped'; meta?: Meta } | { status: 'error'; error: string };

/**
 * Conditionally re-download bangs.json (ETag). Skips if checked within the
 * last day unless `force`.
 */
let inflight: Promise<RefreshResult> | undefined;

export function refresh(force = false): Promise<RefreshResult> {
  inflight ??= doRefresh(force).finally(() => (inflight = undefined));
  return inflight;
}

async function doRefresh(force: boolean): Promise<RefreshResult> {
  try {
    await ensureSeeded();
    const meta = (await getMeta())!;
    if (!force && Date.now() - meta.checkedAt < DAY) return { status: 'skipped', meta };

    const headers: HeadersInit = meta.etag ? { 'If-None-Match': meta.etag } : {};
    // `no-store` bypasses the HTTP cache so our own If-None-Match reaches the
    // server and a 304 is surfaced (with `no-cache` the browser revalidates
    // itself and hands us a 200 with the full body).
    const res = await fetch(BANGS_URL, { headers, cache: 'no-store' });
    if (res.status === 304) {
      const next = { ...meta, checkedAt: Date.now() };
      await setMeta(next);
      return { status: 'unchanged', meta: next };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const map = indexBangs(parseBangs(await res.text()));
    const now = Date.now();
    await replaceAll(map, { etag: res.headers.get('etag'), updatedAt: now, checkedAt: now, source: 'remote' });
    invalidateIndex();
    return { status: 'updated', meta: await getMeta() };
  } catch (err) {
    return { status: 'error', error: String(err) };
  }
}

/** In-memory index for omnibox prefix suggestions. */
export interface BangIndex {
  map: Map<string, Bang>;
  /** Triggers sorted lexicographically, for prefix search */
  sorted: string[];
}

let index: Promise<BangIndex> | undefined;

export function invalidateIndex() {
  index = undefined;
}

export function getIndex(): Promise<BangIndex> {
  index ??= (async () => {
    await ensureSeeded();
    const map = await getAllBangs();
    return { map, sorted: [...map.keys()].sort() };
  })().catch((err) => {
    index = undefined;
    throw err;
  });
  return index;
}

/** Up to `limit` triggers starting with `prefix`, shortest first. */
export function prefixSearch({ sorted }: BangIndex, prefix: string, limit: number): string[] {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid]! < prefix) lo = mid + 1;
    else hi = mid;
  }
  const out: string[] = [];
  for (let i = lo; i < sorted.length && sorted[i]!.startsWith(prefix) && out.length < 200; i++) out.push(sorted[i]!);
  return out.sort((a, b) => a.length - b.length || a.localeCompare(b)).slice(0, limit);
}
