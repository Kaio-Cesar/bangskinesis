export interface BangQuery {
  /** Trigger, lowercased, without `!` */
  trigger: string;
  /** Remaining search terms (may be empty) */
  terms: string;
}

const isBangToken = (t: string | undefined): t is string =>
  !!t && t.length > 1 && t[0] === '!' && t[1] !== '!';

/**
 * Find a bang in a query. Like DuckDuckGo, the bang may be the first
 * (`!dev react`) or the last (`react !dev`) token.
 */
export function extractBang(query: string): BangQuery | null {
  const tokens = query.trim().split(/\s+/);
  if (isBangToken(tokens[0])) {
    return { trigger: tokens[0].slice(1).toLowerCase(), terms: tokens.slice(1).join(' ') };
  }
  const last = tokens.at(-1);
  if (tokens.length > 1 && isBangToken(last)) {
    return { trigger: last.slice(1).toLowerCase(), terms: tokens.slice(0, -1).join(' ') };
  }
  return null;
}
