import { defineConfig } from 'wxt';
import { ALL_ENGINE_HOSTS } from './lib/engines';

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
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'bangskinesis@extension',
          strict_min_version: '128.0',
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
