import { test, expect } from '@playwright/test';
import { toSection, base } from '../helpers';

const BASE = base();

test.describe('CenturyMetadata — crypto correctness', () => {
  test('CM-40: custom mnemonic derives a different reader_id than the default', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    // Capture the default (abandon×12) reader_id from the dedicated "Your identity" card
    const grabReaderId = async () => {
      return page.locator('#cm-section-keys').evaluate((root) => {
        const divs = Array.from(root.querySelectorAll('div'));
        const hex64 = divs.find((d) => /^[0-9a-f]{64}$/.test(d.textContent?.trim() || ''));
        return hex64?.textContent?.trim() || '';
      });
    };
    const defaultReaderId = await grabReaderId();

    // Enter a different mnemonic
    await page.getByTestId('cm-mnemonic').fill('legal winner thank year wave sausage worth useful legal winner thank yellow');
    await page.getByTestId('cm-derive').click();
    await page.waitForTimeout(500);

    const newReaderId = await grabReaderId();
    expect(defaultReaderId).toMatch(/^[0-9a-f]{64}$/);
    expect(newReaderId).toMatch(/^[0-9a-f]{64}$/);
    expect(newReaderId).not.toBe(defaultReaderId);
  });

  test('CM-41: invalid mnemonic produces a visible error', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await page.getByTestId('cm-mnemonic').fill('this is not a valid mnemonic phrase');
    await page.getByTestId('cm-derive').click();
    await page.waitForTimeout(300);
    // deriveError paragraph renders red text
    const err = page.locator('#cm-section-keys p.text-\\[\\#f85149\\]');
    await expect(err).toBeVisible();
    expect((await err.innerText()).length).toBeGreaterThan(5);
  });

  test('CM-42: empty mnemonic produces a visible error', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await page.getByTestId('cm-mnemonic').fill('');
    await page.getByTestId('cm-derive').click();
    await page.waitForTimeout(300);
    const err = page.locator('#cm-section-keys p.text-\\[\\#f85149\\]');
    await expect(err).toBeVisible();
  });

  test('CM-43: quickfill button restores the abandon×12 mnemonic', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await page.getByTestId('cm-mnemonic').fill('different text');
    await page.getByTestId('cm-quickfill').click();
    await page.waitForTimeout(300);
    const val = await page.getByTestId('cm-mnemonic').inputValue();
    expect(val).toContain('abandon');
    expect(val).toMatch(/about$/);
  });

  test('CM-44: record-anatomy — every field click shows the right detail', async ({ page }) => {
    await toSection(page, 'record');
    const cases: Array<{ id: string; expect: string }> = [
      { id: 'sig', expect: 'Schnorr' },
      { id: 'writer', expect: 'compressed secp256k1' },
      { id: 'reader', expect: 'reader_secp_pubkey' },
      { id: 'gen', expect: 'big-endian' },
      { id: 'mlkem', expect: 'ML-KEM-1024' },
      { id: 'aes', expect: 'AES-256-CTR' },
    ];
    for (const c of cases) {
      await page.getByTestId(`cm-field-list-${c.id}`).click();
      await page.waitForTimeout(200);
      const detail = await page.getByTestId('cm-field-detail').innerText();
      expect(detail).toContain(c.expect);
    }
  });

  test('CM-45: record-anatomy — proportional bar has exactly 6 field buttons', async ({ page }) => {
    await toSection(page, 'record');
    // The proportional bar is the .h-12 flex container with buttons inside
    const barButtons = page.locator('#cm-section-record .h-12 button');
    await expect(barButtons).toHaveCount(6);
  });

  test('CM-46: encryption — run button progresses through 6 steps and reveals AES key', async ({ page }) => {
    await toSection(page, 'encryption');
    await page.getByTestId('cm-enc-title').fill('cm-test-title');
    await page.getByTestId('cm-enc-content').fill('cm-test-content');
    await page.getByTestId('cm-enc-run').click();
    await expect(page.getByTestId('cm-enc-done')).toBeVisible({ timeout: 15000 });
    // After completion, every step box should show the ✅ checkmark
    const checkedCount = await page.locator('#cm-section-encryption span.text-lg:has-text("✅")').count();
    expect(checkedCount).toBe(6);
    // AES key value rendered
    const aesKeyLine = await page.locator('#cm-section-encryption').getByText(/AES key =/).innerText();
    expect(aesKeyLine).toMatch(/[0-9a-f]{16,}/);
  });

  test('CM-47: decryption — recovers the exact title and content the user typed', async ({ page }) => {
    await toSection(page, 'decryption');
    const title = `title-${Date.now()}`;
    const content = `content-${Math.random().toString(36).slice(2)}`;
    await page.getByTestId('cm-dec-title').fill(title);
    await page.getByTestId('cm-dec-content').fill(content);
    await page.getByTestId('cm-dec-run').click();
    await expect(page.getByTestId('cm-dec-result')).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1000);
    const fields = await page.getByTestId('cm-dec-fields').innerText();
    expect(fields).toContain(title);
    expect(fields).toContain(content);
    const checkedCount = await page.locator('#cm-section-decryption span.text-lg:has-text("✅")').count();
    expect(checkedCount).toBe(6);
  });

  test('CM-48: decryption — signature valid for an honest encode', async ({ page }) => {
    await toSection(page, 'decryption');
    await page.getByTestId('cm-dec-run').click();
    await expect(page.getByTestId('cm-dec-result')).toBeVisible({ timeout: 20000 });
    const step1 = await page.getByTestId('cm-dec-step-1').innerText();
    expect(step1.toLowerCase()).toContain('valid');
    // Specifically the green VALID text
    await expect(page.locator('#cm-section-decryption').getByText(/VALID/)).toBeVisible();
  });

  test('CM-49: tamper demo reports INVALID signature, content still readable', async ({ page }) => {
    await toSection(page, 'security');
    await page.getByTestId('cm-tamper-run').click();
    await expect(page.getByTestId('cm-tamper-sig-status')).toBeVisible({ timeout: 15000 });
    const sig = await page.getByTestId('cm-tamper-sig-status').innerText();
    expect(sig).toContain('INVALID');
    const decrypt = await page.getByTestId('cm-tamper-decrypt-status').innerText();
    // The signature was tampered, not the content, so content still decodes
    expect(decrypt.toLowerCase()).toContain('untampered');
  });

  test('CM-50: wrong-reader demo reports a MISMATCH and explains why', async ({ page }) => {
    await toSection(page, 'security');
    await page.getByTestId('cm-wrong-reader-run').click();
    await expect(page.getByTestId('cm-wrong-reader-result')).toBeVisible({ timeout: 15000 });
    const txt = await page.getByTestId('cm-wrong-reader-result').innerText();
    expect(txt).toContain('MISMATCH');
    expect(txt).toContain('reader_id'); // names the field
    // Both reader_ids printed for comparison
    const hexMatches = txt.match(/[0-9a-f]{32}…/g);
    expect(hexMatches?.length).toBeGreaterThanOrEqual(2);
  });

  test('CM-51: gotcha — gunzip returns 0 bytes (bug), inflate returns the original', async ({ page }) => {
    await toSection(page, 'gotchas');
    await page.getByTestId('cm-gotcha-run').click();
    await expect(page.getByTestId('cm-gotcha-result')).toBeVisible({ timeout: 10000 });
    const txt = await page.getByTestId('cm-gotcha-result').innerText();
    expect(txt).toContain('0 bytes'); // the bug
    expect(txt).toMatch(/\d{2,} bytes/); // the fix
    expect(txt).toContain('title'); // recovered text
    expect(txt).toContain('content');
  });

  test('CM-52: Nostr bridge — npub renders and signed note verifies', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    // NostrIdentity is in the overview section
    const overview = page.locator('#cm-section-overview');
    await expect(overview.getByText('npub', { exact: true })).toBeVisible();
    await expect(overview.getByText('Nostr identity', { exact: true })).toBeVisible();
    await expect(overview.getByText('centurymetadata identity', { exact: true })).toBeVisible();
    const npubValue = await overview.evaluate((root) => {
      const labels = Array.from(root.querySelectorAll('div'));
      const npubLabel = labels.find((d) => d.textContent?.trim() === 'npub');
      if (!npubLabel) return '';
      const valueDiv = npubLabel.nextElementSibling as HTMLElement | null;
      return valueDiv?.textContent?.trim() || '';
    });
    expect(npubValue.length).toBeGreaterThan(20);
    expect(npubValue).toMatch(/npub1|^[0-9a-f]+/);
    // Sign and verify
    await page.getByTestId('cm-note-sign').click();
    await expect(page.getByTestId('cm-note-result')).toBeVisible({ timeout: 10000 });
    const result = await page.getByTestId('cm-note-result').innerText();
    expect(result.toLowerCase()).toContain('valid');
    expect(result).toMatch(/yes/);
  });
});
