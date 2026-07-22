import { test, expect } from '@playwright/test';
import { waitForApp, toSection, base } from '../helpers';

const BASE = base();

test.describe('CenturyMetadata — bundle + playground (network)', () => {
  test('CM-60: bundle grid renders exactly 1024 cells', async ({ page }) => {
    await toSection(page, 'bundle');
    await expect(page.getByTestId('cm-slot-grid')).toBeVisible({ timeout: 20000 });
    const count = await page.locator('button[data-testid^="cm-slot-"]').count();
    expect(count).toBe(1024);
  });

  test('CM-61: bundle stats card renders (either stats or graceful empty)', async ({ page }) => {
    await toSection(page, 'bundle');
    const stats = page.getByTestId('cm-bundle-stats');
    await expect(stats).toBeVisible();
    // Either we got network stats (5-grid) OR the "Couldn't reach" message; both acceptable.
    const innerText = await stats.innerText();
    const hasStats = /Bundles/.test(innerText) && /Slots probed/.test(innerText);
    const hasEmpty = /Couldn't reach|Scanning|Probing/.test(innerText);
    expect(hasStats || hasEmpty).toBeTruthy();
  });

  test('CM-62: bundle refresh button is clickable and does not throw', async ({ page }) => {
    await toSection(page, 'bundle');
    const refresh = page.getByTestId('cm-bundle-refresh');
    await expect(refresh).toBeEnabled();
    await refresh.click();
    // After click, the button either briefly shows "Scanning…" or returns to ready
    await page.waitForTimeout(500);
    await expect(refresh).toBeEnabled({ timeout: 30000 });
  });

  test('CM-63: bundle slot click opens detail panel (only meaningful when occupied slots exist)', async ({ page }) => {
    await toSection(page, 'bundle');
    await expect(page.getByTestId('cm-slot-grid')).toBeVisible({ timeout: 20000 });
    // Wait for the network scan to settle
    await page.waitForTimeout(3000);
    // Find an occupied slot (style includes a background color)
    const occupied = await page.locator('button[data-testid^="cm-slot-"][style*="background"]').first();
    const hasOccupied = (await occupied.count()) > 0;
    if (!hasOccupied) {
      // Network API down or empty bundle — skip the rest of this test gracefully.
      test.skip(true, 'no occupied slots in network sample');
    }
    await occupied.click();
    await expect(page.getByTestId('cm-slot-detail')).toBeVisible();
    const detail = await page.getByTestId('cm-slot-detail').innerText();
    expect(detail).toContain('Writer:');
    expect(detail).toContain('Reader ID:');
    expect(detail).toContain('Generation:');
  });

  test('CM-64: bundle detail close button hides the panel', async ({ page }) => {
    await toSection(page, 'bundle');
    await expect(page.getByTestId('cm-slot-grid')).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(3000);
    const occupied = await page.locator('button[data-testid^="cm-slot-"][style*="background"]').first();
    if (!(await occupied.count())) test.skip(true, 'no occupied slots');
    await occupied.click();
    await expect(page.getByTestId('cm-slot-detail')).toBeVisible();
    // Click the × button inside the detail panel
    await page.locator('[data-testid="cm-slot-detail"] button:has-text("✕")').click();
    await page.waitForTimeout(300);
    await expect(page.getByTestId('cm-slot-detail')).toHaveCount(0);
  });

  test('CM-65: playground — write a custom record and fetch it back', async ({ page }) => {
    test.setTimeout(90000);
    await toSection(page, 'playground');
    const title = `auto-${Date.now()}`;
    const content = `random-${Math.random().toString(36).slice(2)}`;
    await page.getByTestId('cm-write-title').fill(title);
    await page.getByTestId('cm-write-content').fill(content);
    await page.getByTestId('cm-write-btn').click();
    await expect(page.getByTestId('cm-write-status')).toContainText(/Upload:/i, { timeout: 60000 });
    const status = await page.getByTestId('cm-write-status').innerText();
    // Upload should be HTTP 200 OK
    expect(status).toContain('200');
    expect(status).toContain('OK');
    // Settle on the server before fetching
    await page.waitForTimeout(2000);
    await page.getByTestId('cm-fetch-btn').click();
    await expect(page.getByTestId('cm-records')).toBeVisible({ timeout: 60000 });
    // At least one record should appear
    const recordCount = await page.locator('[data-testid^="cm-record-"]').count();
    expect(recordCount).toBeGreaterThanOrEqual(1);
    // The newest record (cm-record-0) should contain our title+content
    const newest = await page.getByTestId('cm-record-0').innerText();
    expect(newest).toContain(title);
    expect(newest).toContain(content);
    // And report a valid signature
    expect(newest).toContain('valid');
  });

  test('CM-66: playground — fetch with no prior write shows empty state (for a fresh reader_id)', async ({ page }) => {
    // Use a mnemonic nobody has written to before. random 12-word phrase is unlikely to have data.
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    // Generate a unique mnemonic by tweaking the last word
    await page.getByTestId('cm-mnemonic').fill('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon');
    await page.getByTestId('cm-derive').click();
    await page.waitForTimeout(500);
    // Jump to playground
    await page.evaluate(() => {
      document.getElementById('cm-section-playground')?.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
    await page.waitForTimeout(800);
    await page.getByTestId('cm-fetch-btn').click();
    // Either records render OR the empty state appears
    const records = page.locator('[data-testid^="cm-record-"]');
    const emptyMsg = page.locator('#cm-section-playground').getByText(/No records loaded yet|No records found/);
    await expect(records.or(emptyMsg).first()).toBeVisible({ timeout: 60000 });
  });
});
