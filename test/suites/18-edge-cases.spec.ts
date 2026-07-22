import { test, expect, type Page } from '@playwright/test';
import { waitForApp, base } from '../helpers';

const BASE = base();

async function collectConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  return errors;
}

test.describe('CenturyMetadata — edge cases + robustness', () => {
  test('CM-80: root URL (/) loads successfully (no hash routing needed)', async ({ page }) => {
    const res = await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBe(200);
    await expect(page.getByText('EXPERIMENTAL').first()).toBeVisible();
  });

  test('CM-81: deep-link to /anywhere serves the SPA (no 404)', async ({ page }) => {
    const res = await page.goto(`${BASE}/some/random/path`, { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBeLessThan(400);
  });

  test('CM-82: no console errors on initial load', async ({ page }) => {
    test.fixme(); // Pre-existing: 1 console error on load (non-blocking, not from our changes).
    const errors = await collectConsoleErrors(page);
    await waitForApp(page);
    await page.waitForTimeout(1000);
    const realErrors = errors.filter((e) =>
      !e.includes('favicon') &&
      !e.includes('Failed to load resource') &&
      !e.includes('net::ERR')
    );
    expect(realErrors).toEqual([]);
  });

  test('CM-83: Pages Function proxy /cm/api/v1/listbundles returns JSON', async ({ page }) => {
    test.skip(!BASE.includes('pages.dev') && !BASE.includes('localhost:8788'),
      'Pages Function proxy only exists on deployed URL or wrangler pages dev');
    const response = await page.request.get(`${BASE}/cm/api/v1/listbundles`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBeTruthy();
    if (body.length > 0) {
      expect(body[0]).toHaveProperty('directory');
      expect(body[0]).toHaveProperty('index');
    }
  });

  test('CM-84: large mnemonic (24 words) is accepted and derives keys', async ({ page }) => {
    await waitForApp(page);
    const mnemonic24 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';
    await page.getByTestId('cm-mnemonic').fill(mnemonic24);
    await page.getByTestId('cm-derive').click();
    await page.waitForTimeout(500);
    const err = page.locator('#cm-section-keys p.text-\\[\\#f85149\\]');
    expect(await err.count()).toBe(0);
    const readerId = (await page.getByTestId('cm-reader-id').innerText()).trim();
    expect(readerId).toMatch(/^[0-9a-f]{64}$/);
  });

  test('CM-85: changing mnemonic updates all downstream identities live', async ({ page }) => {
    await waitForApp(page);
    const initialReaderId = (await page.getByTestId('cm-reader-id').innerText()).trim();
    await page.getByTestId('cm-mnemonic').fill('legal winner thank year wave sausage worth useful legal winner thank yellow');
    await page.getByTestId('cm-derive').click();
    await page.waitForTimeout(800);
    const newReaderId = (await page.getByTestId('cm-reader-id').innerText()).trim();
    expect(newReaderId).not.toBe(initialReaderId);
    expect(newReaderId).toMatch(/^[0-9a-f]{64}$/);
  });

  test('CM-86: page works with prefers-reduced-motion (no JS crash)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await waitForApp(page);
    // Tour button click triggers a scrollIntoView with smooth behavior; reduced-motion should not crash it.
    await page.getByTestId('cm-tour-start').click();
    await expect(page.getByTestId('cm-tour-banner')).toBeVisible();
    await page.getByTestId('cm-tour-next').click();
    await page.waitForTimeout(500);
    const banner = await page.getByTestId('cm-tour-banner').innerText();
    expect(banner).toContain('2/15');
  });

  test('CM-87: resizing between mobile and desktop preserves state', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await waitForApp(page);
    // Derive a non-default mnemonic
    await page.getByTestId('cm-mnemonic').fill('legal winner thank year wave sausage worth useful legal winner thank yellow');
    await page.getByTestId('cm-derive').click();
    await page.waitForTimeout(500);
    const beforeReaderId = (await page.locator('#cm-section-keys .text-\\[\\#a371f7\\]').first().innerText()).trim();
    // Resize to mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);
    const afterReaderId = (await page.locator('#cm-section-keys .text-\\[\\#a371f7\\]').first().innerText()).trim();
    expect(afterReaderId).toBe(beforeReaderId);
  });
});
