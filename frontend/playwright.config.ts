import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: '**/integration/**',
  workers: 2,
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  webServer: [
    { command: 'node tests/fixtures/upstream.mjs', url: 'http://127.0.0.1:8100/health' },
    {
      command: 'bun run start --port 3100',
      url: 'http://localhost:3100/auth',
      env: { AUTH_SERVICE_URL: 'http://127.0.0.1:8100', APP_ORIGINS: 'http://localhost:3100' },
    },
  ],
});
