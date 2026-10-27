import { defineConfig, devices } from '@playwright/test';
import base from './playwright.auth.config';

const servers = Array.isArray(base.webServer) ? base.webServer : [];
// Run via test:manager:e2e after npm run build. The same launcher scrubs env,
// provisions temporary SQLite/storage and never inherits real 1C settings.
export default defineConfig({
  ...base,
  testMatch: ['manager*.spec.ts'],
  outputDir: 'test-results/manager-production',
  reporter: [
    ['list'],
    [
      'html',
      { outputFolder: 'playwright-report/manager-production', open: 'never' },
    ],
  ],
  use: { ...base.use, locale: 'ru-RU', timezoneId: 'Europe/Moscow' },
  webServer: [
    servers[0],
    {
      ...servers[1],
      command: 'node tests/support/run-manager-production.mjs',
    },
  ],
  projects: [
    {
      name: 'production-chromium-360',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 360, height: 800 },
      },
    },
    {
      name: 'production-chromium-1600',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1600, height: 1000 },
      },
    },
    {
      name: 'production-webkit-390',
      use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
    },
  ],
});
