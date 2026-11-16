import { GOOGLE_TLDS } from './google-domains';
import type { Browser } from 'wxt/browser';

/**
 * Search engines whose result pages we intercept. When the query parameter
 * contains a bang as its first or last token, the navigation is redirected
 * (before any request reaches the engine) to our redirect page.
 *
 * DuckDuckGo and Kagi are deliberately absent: they handle bangs natively.
 */
export interface Engine {
  id: string;
  name: string;
  /** RE2 fragment matching scheme + host + path up to `?` (anchored by caller) */
  urlPrefix: string;
  /** Query parameter carrying the search terms */
  param: string;
  /** Host match patterns needed for the redirect permission */
  hosts: string[];
}

export const ENGINES: Engine[] = [
  {
    id: 'google',
    name: 'Google',
    // Generic TLD pattern keeps the RE2 program small (Chrome caps regex rule
    // memory); host_permissions restrict it to real Google domains anyway.
    urlPrefix: String.raw`https://(?:www\.)?google\.(?:com?\.)?[a-z]{2,3}/search`,
    param: 'q',
    hosts: GOOGLE_TLDS.map((t) => `*://*.google.${t}/*`),
  },
  { id: 'bing', name: 'Bing', urlPrefix: String.raw`https://(?:www\.|cn\.)?bing\.com/search`, param: 'q', hosts: ['*://*.bing.com/*'] },
  { id: 'brave', name: 'Brave Search', urlPrefix: String.raw`https://search\.brave\.com/search`, param: 'q', hosts: ['*://search.brave.com/*'] },
  { id: 'ecosia', name: 'Ecosia', urlPrefix: String.raw`https://www\.ecosia\.org/search`, param: 'q', hosts: ['*://www.ecosia.org/*'] },
  { id: 'yahoo', name: 'Yahoo', urlPrefix: String.raw`https://(?:[a-z]+\.)?search\.yahoo\.com/search`, param: 'p', hosts: ['*://*.search.yahoo.com/*'] },
  { id: 'startpage', name: 'Startpage', urlPrefix: String.raw`https://(?:www\.)?startpage\.com/(?:sp/|do/)?search`, param: 'query', hosts: ['*://*.startpage.com/*'] },
  { id: 'qwant', name: 'Qwant', urlPrefix: String.raw`https://www\.qwant\.com/`, param: 'q', hosts: ['*://www.qwant.com/*'] },
  { id: 'yandex', name: 'Yandex', urlPrefix: String.raw`https://(?:www\.)?yandex\.(?:com|ru)/search/`, param: 'text', hosts: ['*://*.yandex.com/*', '*://*.yandex.ru/*'] },
];

/** Marker appended when an unknown bang is sent back to the engine, to avoid a loop. */
export const BYPASS_PARAM = 'bk';

const BANG = '(?:!|%21)';
const TOKEN_END = '[^&#+%]';
/**
 * Matches the query param when its value starts with `!x…` or ends with
 * ` !x…` (space encoded as `+` or `%20`). `!!` is excluded so literal
 * double-bangs never trigger.
 */
export function engineRegex(e: Engine): string {
  const first = `${BANG}[^&#+%!]`;
  const last = `[^&#]*(?:\\+|%20)${BANG}[^&#+%!]${TOKEN_END}*(?:[&#]|$)`;
  // Trailing `.*` makes the match span the whole URL: `\0` in the
  // regexSubstitution is the matched text, and Firefox (unlike Chrome)
  // drops anything outside the match.
  return `^${e.urlPrefix}\\?(?:[^#]*&)?${e.param}=(?:${first}|${last}).*`;
}

const RULE_ID_ALLOW = 1;
const RULE_ID_BASE = 100;

/** Build the dynamic DNR rules for the enabled engines. */
export function buildRules(
  redirectUrl: string,
  enabled: (e: Engine) => boolean,
): Browser.declarativeNetRequest.Rule[] {
  const rules: Browser.declarativeNetRequest.Rule[] = [
    {
      id: RULE_ID_ALLOW,
      priority: 2,
      action: { type: 'allow' },
      condition: {
        regexFilter: `[?&]${BYPASS_PARAM}=0(?:[&#]|$)`,
        resourceTypes: ['main_frame'],
      },
    },
  ];
  ENGINES.forEach((e, i) => {
    if (!enabled(e)) return;
    rules.push({
      id: RULE_ID_BASE + i,
      priority: 1,
      action: { type: 'redirect', redirect: { regexSubstitution: `${redirectUrl}#\\0` } },
      condition: { regexFilter: engineRegex(e), resourceTypes: ['main_frame'] },
    });
  });
  return rules;
}

export const ALL_ENGINE_HOSTS = ENGINES.flatMap((e) => e.hosts);
