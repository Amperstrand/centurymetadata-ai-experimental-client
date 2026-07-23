// Suite 14 — Navigation + guided tour.
// Covers the sticky section nav (desktop), mobile pill nav, and the
// end-to-end tour through all 14 sections.
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from '../helpers';

const ALL_SECTION_IDS = [
  'overview', 'keys', 'record', 'recordtypes', 'slotpacking', 'encryption', 'decryption',
  'security', 'whyhybrid', 'gotchas', 'nodevsbrowser', 'bundle', 'xorpir', 'playground', 'explorer',
];

async function isInViewport(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight;
    return rect.top < vh && rect.bottom > 0;
  }, selector);
}

test.describe('CenturyMetadata — navigation + tour', () => {
  test('CM-30: all 15 desktop nav buttons are present', async ({ page }) => {
    await waitForApp(page);
    for (const id of ALL_SECTION_IDS) {
      await expect(page.getByTestId(`cm-nav-${id}`)).toBeVisible();
    }
  });

  test('CM-31: clicking each nav button brings its section into view', async ({ page }) => {
    test.setTimeout(60000);
    await waitForApp(page);
    let failures: string[] = [];
    for (const id of ALL_SECTION_IDS) {
      await page.getByTestId(`cm-nav-${id}`).click();
      await page.waitForTimeout(1000);
      const visible = await isInViewport(page, `#cm-section-${id}`);
      if (!visible) failures.push(id);
    }
    expect(failures).toEqual([]);
  });

  test('CM-32: nav click updates active state to the clicked section', async ({ page }) => {
    await waitForApp(page);
    await page.getByTestId('cm-nav-record').click();
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollBy(0, 1));
    await page.waitForTimeout(1500);
    const states = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button[data-testid^="cm-nav-"]'));
      return buttons.map((b) => ({
        id: b.getAttribute('data-testid'),
        active: (b.getAttribute('class') || '').includes('border-[#f78166]'),
      }));
    });
    const activeOnes = states.filter((s) => s.active);
    expect(activeOnes.length).toBe(1);
    expect(activeOnes[0].id).toBe('cm-nav-record');
  });

  test('CM-33: tour starts at section 1 and advances through all 15', async ({ page }) => {
    await waitForApp(page);
    // Start
    await page.getByTestId('cm-tour-start').click();
    await expect(page.getByTestId('cm-tour-banner')).toBeVisible();
    let banner = await page.getByTestId('cm-tour-banner').innerText();
    expect(banner).toContain('1/15');
    // Prev is disabled on first
    await expect(page.getByTestId('cm-tour-prev')).toBeDisabled();
    // Walk forward through every section
    for (let i = 2; i <= 15; i++) {
      // On the last step the next button label flips to "Done"
      const nextBtn = page.getByTestId('cm-tour-next');
      await nextBtn.click();
      await page.waitForTimeout(500);
      banner = await page.getByTestId('cm-tour-banner').innerText();
      expect(banner).toContain(`${i}/15`);
    }
    // Now the button reads Done; clicking ends the tour
    await expect(page.getByTestId('cm-tour-next')).toContainText('Done');
    await page.getByTestId('cm-tour-next').click();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('cm-tour-banner')).toHaveCount(0);
    // Start button reappears
    await expect(page.getByTestId('cm-tour-start')).toBeVisible();
  });

  test('CM-34: tour prev button moves backwards', async ({ page }) => {
    await waitForApp(page);
    await page.getByTestId('cm-tour-start').click();
    await page.getByTestId('cm-tour-next').click();
    await page.waitForTimeout(400);
    let banner = await page.getByTestId('cm-tour-banner').innerText();
    expect(banner).toContain('2/15');
    await page.getByTestId('cm-tour-prev').click();
    await page.waitForTimeout(400);
    banner = await page.getByTestId('cm-tour-banner').innerText();
    expect(banner).toContain('1/15');
    await expect(page.getByTestId('cm-tour-prev')).toBeDisabled();
  });

  test('CM-35: tour × close dismisses the banner', async ({ page }) => {
    await waitForApp(page);
    await page.getByTestId('cm-tour-start').click();
    await expect(page.getByTestId('cm-tour-banner')).toBeVisible();
    // The × button is the unlabeled close button next to banner
    await page.locator('[data-testid="cm-tour-banner"] button:has-text("✕")').click();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('cm-tour-banner')).toHaveCount(0);
    await expect(page.getByTestId('cm-tour-start')).toBeVisible();
  });

  test('CM-36: mobile viewport shows the bottom pill nav', async ({ page }) => {
    // Force mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await waitForApp(page);
    // The mobile nav container
    const mobileNav = page.locator('.md\\:hidden.fixed.bottom-0');
    await expect(mobileNav).toBeVisible();
    // It has 11 buttons (one per section, icon + number)
    const pillCount = await mobileNav.locator('button').count();
    expect(pillCount).toBe(15);
  });

  test('CM-37: mobile nav pill scrolls to its section', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await waitForApp(page);
    const mobileNav = page.locator('.md\\:hidden.fixed.bottom-0');
    const playgroundPill = mobileNav.locator('button').nth(13);
    await playgroundPill.click();
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollBy(0, 10));
    await page.waitForTimeout(1000);
    expect(await isInViewport(page, '#cm-section-playground')).toBeTruthy();
  });
});
