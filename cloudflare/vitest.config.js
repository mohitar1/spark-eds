import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          kvNamespaces: ['AUTH_TOKENS', 'SAVED_SEARCHES', 'RIGHTS_REQUESTS', 'RIGHTS_REQUEST_REVIEWS', 'RIGHTS_REQUEST_REMINDERS', 'MESSAGES'],
        },
      },
    },
  },
});
