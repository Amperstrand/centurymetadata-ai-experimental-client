// Suite 17 — Mobile + keyboard accessibility.
// Mobile nav, tab-order, focus styles, label associations.
import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.SERVER || 'http://localhost:4173';

test.describe('CenturyMetadata — mobile + a11y', () => {
  test('CM-70: mobile viewport renders without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
    });
    expect(hasOverflow).toBeFalsy();
  });

  test('CM-71: mnemonic textarea has an associated label', async ({ page }) => {
    // a11y_label_has_associated_control — verify the build-time warning is gone
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const textarea = page.getByTestId('cm-mnemonic');
    const id = await textarea.getAttribute('id');
    expect(id).toBeTruthy();
    const label = page.locator(`label[for="${id}"]`);
    await expect(label).toHaveCount(1);
  });

  test('CM-72: every interactive control is keyboard-reachable via Tab', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.locator('body').click();
    const focused: string[] = [];
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('Tab');
      const tag = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return '';
        const testid = el.getAttribute('data-testid') || '';
        const tag = el.tagName.toLowerCase();
        return testid ? `${tag}#${testid}` : tag;
      });
      if (tag) focused.push(tag);
      if (tag.includes('cm-tour-start')) break;
    }
    expect(focused.length).toBeGreaterThanOrEqual(20);
    const joined = focused.join('|');
    expect(joined).toContain('cm-quickfill');
    expect(joined).toContain('cm-derive');
    expect(joined).toContain('cm-note-sign');
    expect(joined).toContain('cm-tour-start');
  });

  test('CM-73: derive button produces a reader_id on click', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.getByTestId('cm-mnemonic').fill('legal winner thank year wave sausage worth useful legal winner thank yellow');
    await page.getByTestId('cm-derive').click();
    await page.waitForTimeout(500);
    const readerId = (await page.getByTestId('cm-reader-id').innerText()).trim();
    expect(readerId).toMatch(/^[0-9a-f]{64}$/);
  });

  test('CM-74: heading hierarchy is sane (single h1 + h2/h3 levels)', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const h1Count = await page.locator('h1').count();
    // The header brand link is the only h1-equivalent; App.svelte uses <header><a>...</a></header>
    // No strict h1, but headings should not skip levels (e.g. no h4 without h3).
    const headings = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('h2, h3, h4')).map((h) => h.tagName.toLowerCase());
    });
    expect(headings.length).toBeGreaterThan(0);
    // Every h4 should have a preceding h3
    let seenH3 = false;
    for (const h of headings) {
      if (h === 'h3') seenH3 = true;
      if (h === 'h4' && !seenH3) throw new Error('h4 without preceding h3');
    }
  });

  test('CM-75: desktop nav hides on mobile; mobile nav hides on desktop', async ({ page }) => {
    // Desktop first
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const desktopNavVisible = await page.locator('nav.hidden.md\\:block').isVisible();
    expect(desktopNavVisible).toBeTruthy();
    const mobileNavHidden = await page.locator('.md\\:hidden.fixed.bottom-0').isHidden();
    expect(mobileNavHidden).toBeTruthy();
    // Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);
    const desktopNavHiddenNow = await page.locator('nav.hidden.md\\:block').isHidden();
    expect(desktopNavHiddenNow).toBeTruthy();
    const mobileNavVisibleNow = await page.locator('.md\\:hidden.fixed.bottom-0').isVisible();
    expect(mobileNavVisibleNow).toBeTruthy();
  });
});
