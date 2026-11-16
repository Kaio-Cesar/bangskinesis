import type { Bang } from './bangs';

/**
 * IndexedDB cache shared by the background, redirect and options pages
 * (same extension origin). Bangs are keyed by trigger so a lookup reads a
 * single record instead of deserialising the whole ~10k-entry collection.
 */
const DB_NAME = 'bangskinesis';
const DB_VERSION = 1;
const BANGS = 'bangs';
const META = 'meta';

export interface Meta {
  /** ETag of the remote file the cache was built from (null for the bundled snapshot) */
  etag: string | null;
  /** When the data was last written (ms epoch) */
  updatedAt: number;
  /** When the remote was last checked successfully, 304 included (ms epoch) */
  checkedAt: number;
  /** Number of triggers */
  count: number;
  source: 'snapshot' | 'remote';
}

let dbPromise: Promise<IDBDatabase> | undefined;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

export function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      open.result.createObjectStore(BANGS);
      open.result.createObjectStore(META);
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => {
      dbPromise = undefined;
      reject(open.error);
    };
  });
  return dbPromise;
}

export async function getBang(trigger: string): Promise<Bang | undefined> {
  const db = await openDb();
  return req(db.transaction(BANGS).objectStore(BANGS).get(trigger));
}

export async function getMeta(): Promise<Meta | undefined> {
  const db = await openDb();
  return req(db.transaction(META).objectStore(META).get('meta'));
}

export async function setMeta(meta: Meta): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(META, 'readwrite');
  tx.objectStore(META).put(meta, 'meta');
  await done(tx);
}

/** Load every trigger (used to build the in-memory omnibox index). */
export async function getAllBangs(): Promise<Map<string, Bang>> {
  const db = await openDb();
  const store = db.transaction(BANGS).objectStore(BANGS);
  const [keys, values] = await Promise.all([req(store.getAllKeys()), req(store.getAll())]);
  return new Map(keys.map((k, i) => [k as string, values[i] as Bang]));
}

/** Atomically replace the whole collection and its metadata. */
export async function replaceAll(map: Map<string, Bang>, meta: Omit<Meta, 'count'>): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([BANGS, META], 'readwrite');
  const bangs = tx.objectStore(BANGS);
  bangs.clear();
  for (const [k, v] of map) bangs.put(v, k);
  tx.objectStore(META).put({ ...meta, count: map.size }, 'meta');
  await done(tx);
}
