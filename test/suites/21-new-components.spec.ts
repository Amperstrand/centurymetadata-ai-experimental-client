import { test, expect } from '@playwright/test';
import { waitForApp, toSection, base } from '../helpers';

test.use({ video: 'on' });

const BASE = base();

test.describe('CenturyMetadata — new component tests', () => {
  test('CM-90: record types — all 5 types selectable with valid examples', async ({ page }) => {
    await waitForApp(page);
    await toSection(page, 'recordtypes');
    const types = [
      'bitcoin-psbt',
      'bitcoin-transaction',
      'bitcoin-miniscript',
      'bitcoin-output-script-descriptor',
      'bitcoin-wallet-labels',
    ];
    for (const t of types) {
      await page.getByTestId(`cm-type-${t}`).click();
      await page.waitForTimeout(200);
      const status = await page.getByTestId('cm-type-status').innerText();
      expect(status).toContain('valid');
    }
  });

  test('CM-91: record types — invalid input shows invalid status', async ({ page }) => {
    await waitForApp(page);
    await toSection(page, 'recordtypes');
    await page.getByTestId('cm-type-bitcoin-output-script-descriptor').click();
    await page.getByTestId('cm-type-input').fill('not a valid descriptor');
    await page.waitForTimeout(200);
    const status = await page.getByTestId('cm-type-status').innerText();
    expect(status).toContain('invalid');
  });

  test('CM-92: record types — validator result details render', async ({ page }) => {
    await waitForApp(page);
    await toSection(page, 'recordtypes');
    await page.getByTestId('cm-type-bitcoin-psbt').click();
    const result = await page.getByTestId('cm-type-result').innerText();
    expect(result.length).toBeGreaterThan(10);
  });

  test('CM-93: slot packing — budget bar shows compressed size', async ({ page }) => {
    await waitForApp(page);
    await toSection(page, 'slotpacking');
    const budget = page.getByTestId('cm-pack-budget');
    await expect(budget).toBeVisible();
    const text = await budget.innerText();
    expect(text).toMatch(/\d+/);
    expect(text).toContain('6487');
  });

  test('CM-94: slot packing — add record updates budget', async ({ page }) => {
    await waitForApp(page);
    await toSection(page, 'slotpacking');
    const beforeText = await page.getByTestId('cm-pack-budget').innerText();
    const beforeMatch = beforeText.match(/(\d+)\s*\n?\s*raw bytes/);
    const beforeRaw = beforeMatch ? parseInt(beforeMatch[1]) : 0;
    await page.getByTestId('cm-pack-add').click();
    await page.waitForTimeout(300);
    const afterText = await page.getByTestId('cm-pack-budget').innerText();
    const afterMatch = afterText.match(/(\d+)\s*\n?\s*raw bytes/);
    const afterRaw = afterMatch ? parseInt(afterMatch[1]) : 0;
    expect(afterRaw).toBeGreaterThan(beforeRaw);
  });

  test('CM-95: slot packing — remove record updates budget', async ({ page }) => {
    await waitForApp(page);
    await toSection(page, 'slotpacking');
    const beforeText = await page.getByTestId('cm-pack-budget').innerText();
    const beforeMatch = beforeText.match(/(\d+)/);
    const beforeFirst = beforeMatch ? parseInt(beforeMatch[1]) : 0;
    await page.locator('[data-testid="cm-pack-record-0"] button:has-text("✕")').click();
    await page.waitForTimeout(300);
    const afterText = await page.getByTestId('cm-pack-budget').innerText();
    const afterMatch = afterText.match(/(\d+)/);
    const afterFirst = afterMatch ? parseInt(afterMatch[1]) : 0;
    expect(afterFirst).toBeLessThan(beforeFirst);
  });

  test('CM-96: XOR-PIR — run demo produces final result', async ({ page }) => {
    await waitForApp(page);
    await toSection(page, 'xorpir');
    await page.getByTestId('cm-xorpir-run').click();
    await expect(page.getByTestId('cm-xorpir-slots')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(4000);
    await expect(page.getByTestId('cm-xorpir-result')).toBeVisible({ timeout: 5000 });
    const result = await page.getByTestId('cm-xorpir-result').innerText();
    expect(result).toContain('XOR');
    expect(result).toContain('de ad be ef');
  });

  test('CM-97: XOR-PIR — masks shown after step 2', async ({ page }) => {
    await waitForApp(page);
    await toSection(page, 'xorpir');
    await page.getByTestId('cm-xorpir-run').click();
    await page.waitForTimeout(2000);
    await expect(page.getByTestId('cm-xorpir-mask-a')).toBeVisible();
    await expect(page.getByTestId('cm-xorpir-mask-b')).toBeVisible();
  });

  test('CM-98: public signature verification works without keys', async ({ page }) => {
    await waitForApp(page);
    await toSection(page, 'security');
    await page.getByTestId('cm-pubverify-run').click();
    await expect(page.getByTestId('cm-pubverify-result')).toBeVisible({ timeout: 15000 });
    const result = await page.getByTestId('cm-pubverify-result').innerText();
    expect(result).toContain('VALID');
  });

  test('CM-99: preamble text visible in record anatomy', async ({ page }) => {
    await waitForApp(page);
    await toSection(page, 'record');
    await page.locator('summary:has-text("Show full preamble")').click();
    await page.waitForTimeout(300);
    const preamble = page.getByTestId('cm-preamble');
    await expect(preamble).toBeVisible();
    const text = await preamble.innerText();
    expect(text).toContain('centurymetadata v1');
    expect(text).toContain('SIG[64]');
    expect(text).toContain('MLKEM_CT[1568]');
  });
});
