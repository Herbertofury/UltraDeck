import { defineConfig } from 'wxt';

const hosts = [
  'https://www.tumblr.com/*',
  'https://www.patreon.com/*',
  'https://x.com/*',
  'https://twitter.com/*',
  'https://www.tiktok.com/*',
  'https://tiktok.com/*',
  'https://*.tiktok.com/*',
];

export default defineConfig({
  manifest: ({ browser }) => ({
    name: 'UltraDeck',
    description: 'Lossless multi-column retained feeds for Tumblr, Patreon, X, and TikTok with challenge-safe loading and native-backed interactions.',
    version: '8.6.0',
    permissions: ['storage', 'activeTab'],
    host_permissions: hosts,
    web_accessible_resources: [{ resources: ['*-main-world.js'], matches: hosts }],
    options_ui: { page: 'options.html', open_in_tab: true },
    ...(browser === 'firefox'
      ? { browser_specific_settings: { gecko: { id: 'ultradeck-tumblr@bert.local', strict_min_version: '128.0' } } }
      : {}),
  }),
});
