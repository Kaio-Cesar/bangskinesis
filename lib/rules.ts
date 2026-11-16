import { browser } from 'wxt/browser';
import { buildRules } from './engines';

export const DISABLED_ENGINES_KEY = 'disabledEngines';

export async function getDisabledEngines(): Promise<string[]> {
  const got = await browser.storage.local.get(DISABLED_ENGINES_KEY);
  return (got[DISABLED_ENGINES_KEY] as string[] | undefined) ?? [];
}

/** (Re)register the dynamic DNR redirect rules for the enabled engines. */
export async function registerRules(): Promise<void> {
  const disabled = new Set(await getDisabledEngines());
  const redirectUrl = browser.runtime.getURL('/redirect.html');
  const rules = buildRules(redirectUrl, (e) => !disabled.has(e.id));
  const existing = await browser.declarativeNetRequest.getDynamicRules();
  await browser.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: rules,
  });
}
