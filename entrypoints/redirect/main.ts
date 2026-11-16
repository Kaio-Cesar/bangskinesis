/**
 * Target of the DNR redirect: `redirect.html#<original search URL>`.
 * Resolves the bang from the cache and replaces this page (so it never
 * appears in history). Unknown bangs bounce back to the engine with a
 * bypass marker that a higher-priority DNR "allow" rule exempts.
 */
import { BYPASS_PARAM, ENGINES, engineRegex } from '@/lib/engines';
import { extractBang } from '@/lib/query';
import { getBang } from '@/lib/store';
import { buildUrl } from '@/lib/url';
import { ensureSeeded } from '@/lib/data';

async function resolve(original: URL): Promise<string | null> {
  const href = original.href;
  const engine = ENGINES.find((e) => new RegExp(engineRegex(e), 'i').test(href));
  const query = engine && original.searchParams.get(engine.param);
  const parsed = query && extractBang(query);
  if (!parsed) return null;
  let bang = await getBang(parsed.trigger);
  if (!bang) {
    // Cache might not be seeded yet on a very first run.
    await ensureSeeded();
    bang = await getBang(parsed.trigger);
  }
  return bang ? buildUrl(bang, parsed.terms) : null;
}

function bypass(original: URL): string {
  original.searchParams.set(BYPASS_PARAM, '0');
  return original.href;
}

const raw = location.hash.slice(1);
let original: URL | null = null;
try {
  original = new URL(raw);
} catch {}

if (original && /^https?:$/.test(original.protocol)) {
  const o = original;
  void resolve(o)
    .catch(() => null)
    .then((target) => location.replace(target ?? bypass(o)));
}
