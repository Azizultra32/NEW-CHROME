import { defineConfig } from '@playwright/test';

const headed = process.env.HEADED === 'true';

export default defineConfig({
  testDir: './TESTS/e2e',
  timeout: 60_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 1 : 0,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    actionTimeout: 0,
    trace: process.env.CI ? 'retain-on-failure' : 'off',
    video: 'off',
    screenshot: 'only-on-failure',
    headless: !headed,
    viewport: { width: 1280, height: 1024 }
  },
  projects: [
    {
      name: process.env.PLAYWRIGHT_CHANNEL ? process.env.PLAYWRIGHT_CHANNEL : 'chrome',
      use: {
        channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome'
      }
    }
  ]
});
