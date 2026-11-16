import { describe, expect, test } from 'bun:test';
import { bangDomain, indexBangs, parseBangs, parseLenientJson, type RawBang } from '../lib/bangs';
import { extractBang } from '../lib/query';
import { buildUrl } from '../lib/url';
import { buildRules, engineRegex, ENGINES } from '../lib/engines';

describe('parseLenientJson', () => {
  test('strips comments and trailing commas outside strings', () => {
    const text = `// header
// more
[
 { "s": "A, // not a comment", "ts": [ "a", "b", ], "u": "https://x/?q={searchTerms}" },
 /* block */ { "s": "B", "ts": [ "c" ], "u": "u,]" },
]`;
    expect(parseLenientJson(text)).toEqual([
      { s: 'A, // not a comment', ts: ['a', 'b'], u: 'https://x/?q={searchTerms}' },
      { s: 'B', ts: ['c'], u: 'u,]' },
    ]);
  });

  test('handles escaped quotes', () => {
    expect(parseLenientJson('["a\\"b", ]')).toEqual(['a"b']);
  });
});

describe('indexBangs', () => {
  const list: RawBang[] = [
    { s: 'DevDocs', ts: ['dd', 'dev', 'DevDocs'], u: 'https://devdocs.io/#q={searchTerms}' },
    { s: 'Other', ts: ['dev'], u: 'https://other/{searchTerms}', f: 1 },
  ];
  test('maps every trigger, lowercased, first wins', () => {
    const map = indexBangs(list);
    expect(map.get('devdocs')?.s).toBe('DevDocs');
    expect(map.get('dev')?.s).toBe('DevDocs');
    expect(map.size).toBe(3);
  });
  test('domain', () => {
    expect(bangDomain(list[0]!)).toBe('devdocs.io');
  });
});

describe('extractBang', () => {
  test.each([
    ['!dev react hooks', { trigger: 'dev', terms: 'react hooks' }],
    ['react hooks !DEV', { trigger: 'dev', terms: 'react hooks' }],
    ['  !yt  ', { trigger: 'yt', terms: '' }],
    ['!g', { trigger: 'g', terms: '' }],
  ])('%p', (q, expected) => expect(extractBang(q)).toEqual(expected));

  test.each(['react', 'a !b c', '!', '!!dev x', 'x !', 'foo!bar'])('no bang in %p', (q) => {
    expect(extractBang(q)).toBeNull();
  });
});

describe('buildUrl', () => {
  const dd = { s: 'DevDocs', u: 'https://devdocs.io/#q={searchTerms}' };
  const yt = { s: 'YouTube', u: 'https://www.youtube.com/results?search_query={searchTerms}' };
  test('fragment placeholder uses %20', () => {
    expect(buildUrl(dd, 'react hooks')).toBe('https://devdocs.io/#q=react%20hooks');
  });
  test('query placeholder uses +', () => {
    expect(buildUrl(yt, 'a b&c')).toBe('https://www.youtube.com/results?search_query=a+b%26c');
  });
  test('empty terms open site root', () => {
    expect(buildUrl(yt, '')).toBe('https://www.youtube.com/');
    expect(buildUrl(dd, '  ')).toBe('https://devdocs.io/');
  });
  test('f=1 (base path only): raw placeholder', () => {
    const wb = { s: 'Wayback', u: 'https://web.archive.org/web/*/{searchTerms}', f: 1 };
    expect(buildUrl(wb, 'https://a.com/b?c=d')).toBe('https://web.archive.org/web/*/https://a.com/b?c=d');
    expect(buildUrl(wb, '')).toBe('https://web.archive.org/');
  });
  test('f=5 encodes with %20', () => {
    const ciu = { s: 'caniuse', u: 'https://caniuse.com/?search={searchTerms}', f: 5 };
    expect(buildUrl(ciu, 'css grid')).toBe('https://caniuse.com/?search=css%20grid');
  });
  test('f=14 encodes spaces as + and does not open base path', () => {
    const hn = { s: 'HN', u: 'https://hn.algolia.com/?q={searchTerms}', f: 14 };
    expect(buildUrl(hn, 'rust lang')).toBe('https://hn.algolia.com/?q=rust+lang');
    expect(buildUrl(hn, '')).toBe('https://hn.algolia.com/?q=');
  });
});

describe('engine regexes', () => {
  const re = (id: string) => new RegExp(engineRegex(ENGINES.find((e) => e.id === id)!), 'i');
  const google = re('google');
  test.each([
    'https://www.google.com/search?q=%21dev+react&sourceid=chrome&ie=UTF-8',
    'https://www.google.com.br/search?q=!dev+react',
    'https://www.google.co.uk/search?client=firefox-b-d&q=react+%21dev',
    'https://www.google.com/search?q=react%20!dev&oq=x',
    'https://www.google.com/search?q=!yt',
  ])('google matches %p', (u) => expect(google.test(u)).toBe(true));

  test.each([
    'https://www.google.com/search?q=react',
    'https://www.google.com/search?q=hello%21+world',
    'https://www.google.com/search?q=a+!b+c',
    'https://www.google.com/search?q=!!dev',
    'https://www.google.com/search?oq=!dev&q=react',
    'https://www.google.com/maps?q=!dev',
  ])('google ignores %p', (u) => expect(google.test(u)).toBe(false));

  test('other engines', () => {
    expect(re('bing').test('https://www.bing.com/search?q=%21dev+react&form=QBLH')).toBe(true);
    expect(re('yahoo').test('https://search.yahoo.com/search?p=!gh+bun')).toBe(true);
    expect(re('startpage').test('https://www.startpage.com/sp/search?query=!w+x')).toBe(true);
    expect(re('yandex').test('https://yandex.com/search/?text=!w+x')).toBe(true);
    expect(re('qwant').test('https://www.qwant.com/?q=!w+x&t=web')).toBe(true);
  });

  test('rules', () => {
    const rules = buildRules('chrome-extension://abc/redirect.html', (e) => e.id !== 'bing');
    expect(rules[0]!.action.type).toBe('allow');
    expect(rules).toHaveLength(ENGINES.length);
    expect(rules[1]!.action.redirect?.regexSubstitution).toBe('chrome-extension://abc/redirect.html#\\0');
  });
});

describe('real snapshot', async () => {
  const file = Bun.file(new URL('../public/bangs.snapshot.json', import.meta.url));
  const exists = await file.exists();
  test.skipIf(!exists)('parses and resolves !dev', async () => {
    const map = indexBangs(parseBangs(await file.text()));
    expect(map.size).toBeGreaterThan(10000);
    expect(map.get('dev')?.s).toBe('DevDocs');
    expect(buildUrl(map.get('dev')!, 'react')).toBe('https://devdocs.io/#q=react');
    for (const [, b] of map) expect(b.u).toContain('{searchTerms}');
  });
});
