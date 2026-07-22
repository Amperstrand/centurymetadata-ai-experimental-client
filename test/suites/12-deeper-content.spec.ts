import { test, expect, type Page } from '@playwright/test';

test.use({ video: 'on', screenshot: 'on' });

const BASE = process.env.SERVER || 'http://localhost:4173';

async function toSection(page: Page, id: string) {
  await page.goto(`${BASE}#/centurymetadata`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.locator(`[data-testid="cm-nav-${id}"]`).click();
  await page.waitForTimeout(400);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `test/screenshots/${name}.png`, type: 'png' });
}

test.describe('CenturyMetadata — deeper content', () => {
  test('CM-10: guided tour starts and advances', async ({ page }) => {
    await page.goto(`${BASE}#/centurymetadata`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.getByTestId('cm-tour-start').click();
    await expect(page.getByTestId('cm-tour-banner')).toBeVisible();
    expect(await page.getByTestId('cm-tour-banner').innerText()).toContain('1/');
    await page.getByTestId('cm-tour-next').click();
    expect(await page.getByTestId('cm-tour-banner').innerText()).toContain('2/');
    await shot(page, '12-cm-tour');
  });

  test('CM-11: live bridge — Nostr npub renders + note signs validly', async ({ page }) => {
    await page.goto(`${BASE}#/centurymetadata`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    // NostrIdentity renders in the overview section; npub is shown.
    await expect(page.getByText('npub').first()).toBeVisible({ timeout: 10000 });
    // Sign a note and verify the id is valid.
    await page.getByTestId('cm-note-sign').click();
    await expect(page.getByTestId('cm-note-result')).toBeVisible({ timeout: 10000 });
    const result = await page.getByTestId('cm-note-result').innerText();
    expect(result.toLowerCase()).toContain('valid');
    await shot(page, '12-cm-bridge');
  });

  test('CM-12: browser-crypto gotcha — gunzip bug reproduces (0 vs >0 bytes)', async ({ page }) => {
    await toSection(page, 'gotchas');
    await page.getByTestId('cm-gotcha-run').click();
    await expect(page.getByTestId('cm-gotcha-result')).toBeVisible({ timeout: 10000 });
    const txt = await page.getByTestId('cm-gotcha-result').innerText();
    expect(txt).toContain('0 bytes');      // the bug: gunzipSync returns empty
    expect(txt).toMatch(/\d{2,} bytes/);   // the fix: inflateSync recovers the data
    await shot(page, '12-cm-gotcha');
  });
});
