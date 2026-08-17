import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: ({ browser }) => ({
    name: 'UltraDeck',
    description: 'Lossless multi-column retained feeds for Tumblr, Patreon, X, and TikTok with native-backed interactions and TikTok playback recovery.',
    version: '8.5.0',
    permissions: ['storage', 'activeTab'],
    host_permissions: [
      'https://www.tumblr.com/*',
      'https://www.patreon.com/*',
      'https://x.com/*',
      'https://twitter.com/*',
      'https://www.tiktok.com/*',
      'https://tiktok.com/*',
      'https://*.tiktok.com/*',
    ],
    options_ui: { page: 'options.html', open_in_tab: true },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'ultradeck-tumblr@bert.local',
              strict_min_version: '128.0',
            },
          },
        }
      : {}),
  }),
});
