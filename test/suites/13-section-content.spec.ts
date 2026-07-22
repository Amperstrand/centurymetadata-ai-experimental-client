import { test, expect } from '@playwright/test';
import { waitForApp, toSection, base } from '../helpers';

const BASE = base();

test.describe('CenturyMetadata — section content', () => {
  test('CM-20: all 15 sections render their heading', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const headings: Record<string, string> = {
      overview: 'The Big Picture',
      keys: 'Keys & Identity',
      record: 'Record Anatomy',
      recordtypes: 'Bitcoin Record Types',
      slotpacking: 'Slot Packing',
      encryption: 'How Encryption Works',
      decryption: 'How Decryption Works',
      security: 'Security Demos',
      whyhybrid: 'Why Hybrid Crypto',
      gotchas: 'Browser Crypto Gotchas',
      nodevsbrowser: 'Node vs Browser',
      bundle: 'The Bundle System',
      xorpir: 'XOR Privacy Retrieval',
      playground: 'Try It Yourself',
      explorer: 'Network Explorer',
    };
    for (const [id, text] of Object.entries(headings)) {
      await expect(page.locator(`#cm-section-${id}`)).toContainText(text, { timeout: 10000 });
    }
  });

  test('CM-21: overview shows the BIP-39 → two ecosystems diagram', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const overview = page.locator('#cm-section-overview');
    await expect(overview).toContainText('BIP-39 SEED PHRASE');
    await expect(overview).toContainText('NIP-06 PATH');
    await expect(overview).toContainText(/CM [""]D1TA[""] PATH/);
    await expect(overview).toContainText('ENCRYPTED RECORD');
    await expect(overview).toContainText('XOR-MASKED BUNDLE');
    // The three concept cards
    await expect(overview.getByText('Hybrid Encryption').first()).toBeVisible();
    await expect(overview.getByText('Privacy in Numbers').first()).toBeVisible();
    await expect(overview.getByText('Century-Scale').first()).toBeVisible();
  });

  test('CM-22: Why Hybrid section explains both failure scenarios', async ({ page }) => {
    await toSection(page, 'whyhybrid');
    const sec = page.locator('#cm-section-whyhybrid');
    await expect(sec).toContainText('Shor\'s algorithm');
    await expect(sec).toContainText('ML-KEM-1024');
    await expect(sec).toContainText('If a quantum computer breaks ECDH');
    await expect(sec).toContainText('If ML-KEM turns out flawed');
    await expect(sec).toContainText('100-year');
  });

  test('CM-23: Node vs Browser renders both API-translation tables', async ({ page }) => {
    await toSection(page, 'nodevsbrowser');
    const sec = page.locator('#cm-section-nodevsbrowser');
    // ECDH table content
    await expect(sec).toContainText('sharedPoint.x');
    await expect(sec).toContainText('libsecp');
    // AES table content
    await expect(sec).toContainText("createCipheriv('aes-256-ctr'");
    await expect(sec).toContainText("crypto.subtle.importKey('raw'");
    await expect(sec).toContainText('AES-CTR');
    // Both tables render as <table>
    const tableCount = await sec.locator('table').count();
    expect(tableCount).toBe(2);
    // Each table has 3 data rows
    for (const t of await sec.locator('table').all()) {
      const rowCount = await t.locator('tbody tr').count();
      expect(rowCount).toBe(3);
    }
  });

  test('CM-24: Bundle section describes the XOR bitmask mechanism', async ({ page }) => {
    await toSection(page, 'bundle');
    const sec = page.locator('#cm-section-bundle');
    await expect(sec).toContainText('bitmask');
    await expect(sec).toContainText('XORs');
    await expect(sec).toContainText('privacy in numbers', { ignoreCase: true });
    await expect(sec).toContainText('8 MB');
    await expect(sec).toContainText('1024');
  });

  test('CM-25: keys section derives default identity on load', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const keys = page.locator('#cm-section-keys');
    // Default mnemonic is abandon×12 → identity is auto-derived onMount
    await expect(keys).toContainText('reader_id');
    await expect(keys).toContainText('writer_pubkey');
    await expect(keys.getByText(/reader_secp_pubkey/).first()).toBeVisible();
    await expect(keys.getByText(/mlkem_pubkey/).first()).toBeVisible();
    const readerId = await keys.evaluate((root) => {
      const divs = Array.from(root.querySelectorAll('div'));
      const hex64 = divs.find((d) => /^[0-9a-f]{64}$/.test(d.textContent?.trim() || ''));
      return hex64?.textContent?.trim() || '';
    });
    expect(readerId).toMatch(/^[0-9a-f]{64}$/);
  });

  test('CM-26: BIP-32 derivation tree shows both NIP-06 and D1TA paths', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const tree = page.locator('#cm-section-keys').getByText('BIP-32 Derivation Tree');
    await expect(tree).toBeVisible();
    const pre = tree.locator('..').locator('pre');
    const text = await pre.innerText();
    expect(text).toContain("m/44'/1237'/0'/0/0");
    expect(text).toContain("m/0x44315441'/0'");
    expect(text).toContain("/0'  Writer keypair");
    expect(text).toContain("/1'  Reader secp256k1");
    expect(text).toContain("/2'  Writer ML-KEM seed");
    expect(text).toContain("/3'  Reader ML-KEM seed");
  });

  test('CM-27: EXPERIMENTAL banner is visible at top', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const banner = page.locator('h2:text("⚠ EXPERIMENTAL — LEARNING TOOL")');
    await expect(banner).toBeVisible();
    // Banner mentions centurymetadata + Rusty Russell
    const bannerText = await banner.locator('..').innerText();
    expect(bannerText).toContain('centurymetadata');
    expect(bannerText).toContain('Rusty Russell');
    expect(bannerText.toLowerCase()).toContain('test api');
  });
});
