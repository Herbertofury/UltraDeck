import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: ({ browser }) => ({
    name: 'UltraDeck',
    description: 'Lossless multi-column retained feeds for Tumblr, Patreon, and X with native-backed off-screen interactions.',
    version: '8.4.0',
    permissions: ['storage', 'activeTab'],
    host_permissions: [
      'https://www.tumblr.com/*',
      'https://www.patreon.com/*',
      'https://x.com/*',
      'https://twitter.com/*',
    ],
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
