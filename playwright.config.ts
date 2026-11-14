import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/suites',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // CI-only retries (2026-11-14): main has been red on server-dependent
  // tests (CM-65 write-fetch-back, CM-83 Pages Function proxy, mobile
  // decryption) when the wrangler pages dev server goes unstable
  // mid-run — the start-gate passes, then it degrades. Serial workers +
  // 2 retries absorb the degradation without masking deterministic
  // failures (trace: on-first-retry captures evidence either way).
  retries: process.env.CI ? 2 : 0,
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
