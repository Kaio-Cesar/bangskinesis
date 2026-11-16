/** Remote collection maintained by the Helium browser (derived from Kagi's bangs). */
export const BANGS_URL = 'https://services.helium.imput.net/bangs.json';

/** Flag bits used by Helium's `f` field (see helium-services/svc/bangs/mkbangs.mjs). */
export const Flags = {
  OPEN_BASE_PATH: 1 << 0,
  OPEN_SNAP_DOMAIN: 1 << 1,
  URL_ENCODE_PLACEHOLDER: 1 << 2,
  URL_ENCODE_SPACE_TO_PLUS: 1 << 3,
} as const;

/** One entry as published in bangs.json. */
export interface RawBang {
  /** Site / display name */
  s: string;
  /** Triggers, without the leading `!` */
  ts: string[];
  /** Template URL containing `{searchTerms}` */
  u: string;
  /** Format flags bitmask; absent = Kagi defaults */
  f?: number;
  /** Category (e.g. "ai") */
  sc?: string;
}

/** What we store per trigger. */
export interface Bang {
  s: string;
  u: string;
  f?: number;
}

/**
 * bangs.json is "JSON with comments and trailing commas" (what Chromium's
 * JSONReader accepts). Strip `//` and block comments plus trailing commas,
 * outside of string literals, then JSON.parse.
 */
export function parseLenientJson(text: string): unknown {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '"') {
      const start = i++;
      while (i < n && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
      out += text.slice(start, ++i);
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
    } else if (c === ',') {
      let j = i + 1;
      while (j < n && /\s/.test(text.charAt(j))) j++;
      if (text[j] !== ']' && text[j] !== '}') out += c;
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return JSON.parse(out);
}

function isRawBang(v: unknown): v is RawBang {
  const b = v as RawBang;
  return (
    !!b &&
    typeof b.s === 'string' &&
    typeof b.u === 'string' &&
    Array.isArray(b.ts) &&
    b.ts.every((t) => typeof t === 'string')
  );
}

/** Parse bangs.json text into validated entries (invalid entries are dropped). */
export function parseBangs(text: string): RawBang[] {
  const data = parseLenientJson(text);
  if (!Array.isArray(data)) throw new Error('bangs.json: expected an array');
  const list = data.filter(isRawBang);
  if (list.length === 0) throw new Error('bangs.json: no valid entries');
  return list;
}

/** Flatten entries to trigger -> Bang. First occurrence of a trigger wins. */
export function indexBangs(list: RawBang[]): Map<string, Bang> {
  const map = new Map<string, Bang>();
  for (const { s, u, f, ts } of list) {
    const bang: Bang = f ? { s, u, f } : { s, u };
    for (const t of ts) {
      const key = t.toLowerCase();
      if (!map.has(key)) map.set(key, bang);
    }
  }
  return map;
}

/** Host shown in previews ("devdocs.io"). */
export function bangDomain(bang: Bang): string {
  try {
    return new URL(bang.u.replaceAll('{searchTerms}', 'x')).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
