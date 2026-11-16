import { Flags, type Bang } from './bangs';

const PLACEHOLDER = '{searchTerms}';

/** Kagi's default when a bang has no explicit format flags. */
const DEFAULT_FLAGS = Flags.OPEN_BASE_PATH | Flags.URL_ENCODE_PLACEHOLDER | Flags.URL_ENCODE_SPACE_TO_PLUS;

/** Template URL with the placeholder neutralised, safe to feed to `new URL`. */
function parseTemplate(u: string): URL | null {
  try {
    return new URL(u.replaceAll(PLACEHOLDER, ''));
  } catch {
    return null;
  }
}

function encodeTerms(u: string, terms: string, flags: number, explicit: boolean): string {
  if (!(flags & Flags.URL_ENCODE_PLACEHOLDER)) return terms;
  const encoded = encodeURIComponent(terms);
  // With explicit flags, follow them. With defaults, only use `+` when the
  // placeholder sits in the query string (`+` means space only there);
  // in a path or #fragment a literal `+` would be taken verbatim.
  const idx = u.indexOf(PLACEHOLDER);
  const q = u.indexOf('?');
  const hash = u.indexOf('#');
  const inQuery = q !== -1 && idx > q && (hash === -1 || idx < hash);
  const plus = explicit ? !!(flags & Flags.URL_ENCODE_SPACE_TO_PLUS) : inQuery;
  return plus ? encoded.replaceAll('%20', '+') : encoded;
}

/** Build the destination URL for a bang and its search terms. */
export function buildUrl(bang: Bang, terms: string): string {
  const explicit = bang.f !== undefined;
  const flags = bang.f ?? DEFAULT_FLAGS;
  terms = terms.trim();

  // No terms: go to the site root (`!yt` -> youtube.com). OPEN_SNAP_DOMAIN is a
  // Kagi-only feature (site-restricted search) and has no meaning here.
  if (!terms && flags & Flags.OPEN_BASE_PATH) {
    const url = parseTemplate(bang.u);
    if (url) return url.origin + '/';
  }

  return bang.u.replaceAll(PLACEHOLDER, encodeTerms(bang.u, terms, flags, explicit));
}
