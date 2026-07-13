import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/suites',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/report.json' }],
    ['html', { open: 'never', outputFolder: 'test/report' }],
  ],
  timeout: 30000,
  expect: { timeout: 10000 },
  use: {
    baseURL: process.env.SERVER || 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});
