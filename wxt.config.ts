import { defineConfig } from 'wxt';
import { ALL_ENGINE_HOSTS } from './lib/engines';

export const GECKO_ID = 'bangskinesis@kcesar.dev';
export const REPO = 'Kaio-Cesar/bangskinesis';

export default defineConfig({
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'BangsKinesis',
    description: 'DuckDuckGo-style !bangs on any search engine, powered by the Helium bangs collection.',
    permissions: ['declarativeNetRequestWithHostAccess', 'storage', 'alarms', 'search'],
    host_permissions: [...ALL_ENGINE_HOSTS, 'https://services.helium.imput.net/*'],
    omnibox: { keyword: '!' },
    web_accessible_resources: [
      // Search-engine navigations are DNR-redirected here.
      { resources: ['redirect.html'], matches: ['<all_urls>'] },
    ],
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    // Chrome: in the default "spanning" mode, extension pages can't load in
    // incognito tabs, so the redirect page would never run there. Firefox
    // doesn't support "split" (and doesn't need it).
    ...(browser !== 'firefox' && { incognito: 'split' as const }),
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          // Permanent once signed by AMO: never change it.
          id: GECKO_ID,
          // Self-distributed (unlisted) builds update from the latest GitHub release.
          update_url: `https://github.com/${REPO}/releases/latest/download/updates.json`,
          // 140 (ESR) is the first release supporting data_collection_permissions.
          strict_min_version: '140.0',
          data_collection_permissions: { required: ['none'] },
        },
        gecko_android: { strict_min_version: '142.0' },
      },
    }),
  }),
});
