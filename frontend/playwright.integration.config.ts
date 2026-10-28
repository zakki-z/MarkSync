import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/integration',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8080', trace: 'retain-on-failure' },
});
