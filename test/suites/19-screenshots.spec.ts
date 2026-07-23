import { test, expect, type Page } from '@playwright/test';

test.use({ video: 'on' });

const BASE = process.env.SERVER || 'http://localhost:4173';

async function gotoAndRun(page: Page, id: string, run?: (page: Page) => Promise<void>) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`#cm-section-${id}`, { timeout: 15000 });
  await page.evaluate((sid) => {
    document.getElementById(`cm-section-${sid}`)?.scrollIntoView({ behavior: 'auto', block: 'start' });
  }, id);
  await page.waitForTimeout(1000);
  if (run) await run(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `test/screenshots/section-${id}.png`, type: 'png', fullPage: false });
}

test.describe('capture per-section screenshots', () => {
  test('shot-overview', async ({ page }) => {
    await gotoAndRun(page, 'overview');
  });
  test('shot-keys', async ({ page }) => {
    await gotoAndRun(page, 'keys');
  });
  test('shot-record', async ({ page }) => {
    await gotoAndRun(page, 'record', async (p) => {
      await p.getByTestId('cm-field-list-aes').click();
      await p.waitForTimeout(300);
    });
  });
  test('shot-recordtypes', async ({ page }) => {
    await gotoAndRun(page, 'recordtypes');
  });
  test('shot-slotpacking', async ({ page }) => {
    await gotoAndRun(page, 'slotpacking', async (p) => {
      await p.getByTestId('cm-pack-budget').scrollIntoViewIfNeeded();
      await p.waitForTimeout(300);
    });
  });
  test('shot-encryption', async ({ page }) => {
    await gotoAndRun(page, 'encryption', async (p) => {
      await p.getByTestId('cm-enc-run').click();
      await expect(p.getByTestId('cm-enc-done')).toBeVisible({ timeout: 15000 });
      await p.waitForTimeout(500);
    });
  });
  test('shot-decryption', async ({ page }) => {
    await gotoAndRun(page, 'decryption', async (p) => {
      await p.getByTestId('cm-dec-run').click();
      await expect(p.getByTestId('cm-dec-result')).toBeVisible({ timeout: 20000 });
      await p.waitForTimeout(1000);
    });
  });
  test('shot-security', async ({ page }) => {
    await gotoAndRun(page, 'security', async (p) => {
      await p.getByTestId('cm-tamper-run').click();
      await expect(p.getByTestId('cm-tamper-sig-status')).toBeVisible({ timeout: 15000 });
      await p.getByTestId('cm-wrong-reader-run').click();
      await expect(p.getByTestId('cm-wrong-reader-result')).toBeVisible({ timeout: 15000 });
      await p.waitForTimeout(300);
    });
  });
  test('shot-whyhybrid', async ({ page }) => {
    await gotoAndRun(page, 'whyhybrid');
  });
  test('shot-gotchas', async ({ page }) => {
    await gotoAndRun(page, 'gotchas', async (p) => {
      await p.getByTestId('cm-gotcha-run').click();
      await expect(p.getByTestId('cm-gotcha-result')).toBeVisible({ timeout: 10000 });
      await p.waitForTimeout(300);
    });
  });
  test('shot-nodevsbrowser', async ({ page }) => {
    await gotoAndRun(page, 'nodevsbrowser');
  });
  test('shot-bundle', async ({ page }) => {
    
    await gotoAndRun(page, 'bundle', async (p) => {
      await expect(p.getByTestId('cm-slot-grid')).toBeVisible({ timeout: 20000 });
      await p.waitForTimeout(2000);
    });
  });
  test('shot-xorpir', async ({ page }) => {
    await gotoAndRun(page, 'xorpir', async (p) => {
      await p.getByTestId('cm-xorpir-run').click();
      await p.waitForTimeout(5000);
    });
  });
  test('shot-playground', async ({ page }) => {
    await gotoAndRun(page, 'playground', async (p) => {
      await p.getByTestId('cm-fetch-btn').click();
      await expect(p.getByTestId('cm-records')).toBeVisible({ timeout: 45000 });
      await p.waitForTimeout(500);
    });
  });
});
