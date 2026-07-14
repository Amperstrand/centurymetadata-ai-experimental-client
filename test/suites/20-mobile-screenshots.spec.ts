import { test, expect, type Page } from '@playwright/test';
import { waitForApp, toSection, base } from '../helpers';

const BASE = base();

test.use({ viewport: { width: 375, height: 667 } });

async function mobileShot(page: Page, id: string, run?: (page: Page) => Promise<void>) {
  await waitForApp(page);
  await page.evaluate((sid) => {
    document.getElementById(`cm-section-${sid}`)?.scrollIntoView({ behavior: 'auto', block: 'start' });
  }, id);
  await page.waitForFunction((sid) => {
    const el = document.getElementById(`cm-section-${sid}`);
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.top < window.innerHeight;
  }, id, { timeout: 10000 });
  if (run) await run(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `test/screenshots/mobile-${id}.png`, type: 'png', fullPage: false });
}

test.describe('mobile screenshots (375px)', () => {
  test('mobile-overview', async ({ page }) => { await mobileShot(page, 'overview'); });
  test('mobile-keys', async ({ page }) => { await mobileShot(page, 'keys'); });
  test('mobile-record', async ({ page }) => {
    await mobileShot(page, 'record', async (p) => {
      await p.getByTestId('cm-field-list-aes').click();
      await p.waitForTimeout(300);
    });
  });
  test('mobile-recordtypes', async ({ page }) => { await mobileShot(page, 'recordtypes'); });
  test('mobile-slotpacking', async ({ page }) => { await mobileShot(page, 'slotpacking'); });
  test('mobile-encryption', async ({ page }) => {
    await mobileShot(page, 'encryption', async (p) => {
      await p.getByTestId('cm-enc-run').click();
      await expect(p.getByTestId('cm-enc-done')).toBeVisible({ timeout: 15000 });
      await p.waitForTimeout(300);
    });
  });
  test('mobile-decryption', async ({ page }) => {
    await mobileShot(page, 'decryption', async (p) => {
      await p.getByTestId('cm-dec-run').click();
      await expect(p.getByTestId('cm-dec-result')).toBeVisible({ timeout: 20000 });
      await p.waitForTimeout(500);
    });
  });
  test('mobile-security', async ({ page }) => {
    await mobileShot(page, 'security', async (p) => {
      await p.getByTestId('cm-tamper-run').click();
      await expect(p.getByTestId('cm-tamper-sig-status')).toBeVisible({ timeout: 15000 });
    });
  });
  test('mobile-whyhybrid', async ({ page }) => { await mobileShot(page, 'whyhybrid'); });
  test('mobile-gotchas', async ({ page }) => {
    await mobileShot(page, 'gotchas', async (p) => {
      await p.getByTestId('cm-gotcha-run').click();
      await expect(p.getByTestId('cm-gotcha-result')).toBeVisible({ timeout: 10000 });
    });
  });
  test('mobile-nodevsbrowser', async ({ page }) => { await mobileShot(page, 'nodevsbrowser'); });
  test('mobile-bundle', async ({ page }) => {
    await mobileShot(page, 'bundle', async (p) => {
      await expect(p.getByTestId('cm-slot-grid')).toBeVisible({ timeout: 20000 });
      await p.waitForTimeout(1500);
    });
  });
  test('mobile-xorpir', async ({ page }) => {
    await mobileShot(page, 'xorpir', async (p) => {
      await p.getByTestId('cm-xorpir-run').click();
      await p.waitForTimeout(4000);
    });
  });
  test('mobile-playground', async ({ page }) => { await mobileShot(page, 'playground'); });
});
