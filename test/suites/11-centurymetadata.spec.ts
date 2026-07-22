import { test, expect, type Page } from '@playwright/test';

test.use({ video: 'on', screenshot: 'on' });

// SERVER env selects the target (a Pages URL in CI/after deploy, vite preview locally).
const BASE = process.env.SERVER || 'http://localhost:4173';

async function toSection(page: Page, id: string) {
  await page.goto(`${BASE}#/centurymetadata`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.locator(`[data-testid="cm-nav-${id}"]`).click();
  await page.waitForTimeout(400);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `test/screenshots/${name}.png`, type: 'png' });
}

test.describe('CenturyMetadata — Explorer', () => {
  test('CM-01: page loads with banner + sticky nav', async ({ page }) => {
    await page.goto(`${BASE}#/centurymetadata`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await expect(page.getByText('EXPERIMENTAL').first()).toBeVisible();
    await expect(page.getByTestId('cm-nav-overview')).toBeVisible();
    await expect(page.getByTestId('cm-nav-playground')).toBeVisible();
    await shot(page, '11-cm-loaded');
  });

  test('CM-02: derive keys shows reader_id', async ({ page }) => {
    await page.goto(`${BASE}#/centurymetadata`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await page.getByTestId('cm-quickfill').click();
    await page.waitForTimeout(200);
    await page.getByTestId('cm-derive').click();
    await page.waitForTimeout(400);
    await expect(page.getByText(/reader_id/i).first()).toBeVisible();
    await shot(page, '11-cm-derived');
  });

  test('CM-03: record-anatomy field click opens detail', async ({ page }) => {
    await toSection(page, 'record');
    await page.getByTestId('cm-field-aes').click();
    await page.waitForTimeout(200);
    await expect(page.getByTestId('cm-field-detail')).toBeVisible();
    expect(await page.getByTestId('cm-field-detail').innerText()).toContain('AES');
    await shot(page, '11-cm-record-anatomy');
  });

  test('CM-04: encryption pipeline runs to completion', async ({ page }) => {
    await toSection(page, 'encryption');
    await page.getByTestId('cm-enc-run').click();
    await expect(page.getByTestId('cm-enc-done')).toBeVisible({ timeout: 15000 });
    await shot(page, '11-cm-encryption');
  });

  test('CM-05: decryption pipeline decodes the sample', async ({ page }) => {
    await toSection(page, 'decryption');
    await page.getByTestId('cm-dec-run').click();
    await expect(page.getByTestId('cm-dec-result')).toBeVisible({ timeout: 15000 });
    const fields = await page.getByTestId('cm-dec-fields').innerText();
    expect(fields.length).toBeGreaterThan(20);
    // sig-valid status lives in the step-1 box, not the cm-dec-result summary
    const step1 = await page.getByTestId('cm-dec-step-1').innerText();
    expect(step1.toLowerCase()).toContain('valid');
    await shot(page, '11-cm-decryption');
  });

  test('CM-06: tamper demo reports an INVALID signature', async ({ page }) => {
    await toSection(page, 'security');
    await page.getByTestId('cm-tamper-run').click();
    await expect(page.getByTestId('cm-tamper-sig-status')).toBeVisible({ timeout: 15000 });
    const sig = await page.getByTestId('cm-tamper-sig-status').innerText();
    expect(sig).toContain('INVALID');
    await shot(page, '11-cm-tamper');
  });

  test('CM-07: wrong-reader demo reports a reader_id mismatch', async ({ page }) => {
    await toSection(page, 'security');
    await page.getByTestId('cm-wrong-reader-run').click();
    await expect(page.getByTestId('cm-wrong-reader-result')).toBeVisible({ timeout: 15000 });
    const txt = await page.getByTestId('cm-wrong-reader-result').innerText();
    expect(txt).toContain('MISMATCH');
    await shot(page, '11-cm-wrong-reader');
  });

  test('CM-08: bundle section renders stats + grid (graceful if test API down)', async ({ page }) => {
    await toSection(page, 'bundle');
    await expect(page.getByTestId('cm-slot-grid')).toBeVisible({ timeout: 20000 });
    const cellCount = await page.locator('button[data-testid^="cm-slot-"]').count();
    expect(cellCount).toBe(1024);
    await shot(page, '11-cm-bundle');
  });

  test('CM-09: playground write + fetch round-trip', async ({ page }) => {
    test.setTimeout(90000);
    await toSection(page, 'playground');
    await page.getByTestId('cm-write-title').fill('split-client test');
    await page.getByTestId('cm-write-content').fill('auto-incremented gen');
    await page.getByTestId('cm-write-btn').click();
    await expect(page.getByTestId('cm-write-status')).toContainText(/Upload:/i, { timeout: 45000 });
    await page.waitForTimeout(2000);
    await page.getByTestId('cm-fetch-btn').click();
    await expect(page.getByTestId('cm-records')).toBeVisible({ timeout: 45000 });
    const recordCount = await page.locator('[data-testid^="cm-record-"]').count();
    expect(recordCount).toBeGreaterThanOrEqual(1);
    await shot(page, '11-cm-roundtrip');
  });
});
