import type { Page, Locator } from '@playwright/test';

const BASE = process.env.SERVER || 'http://localhost:4173';

export async function waitForApp(page: Page): Promise<void> {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="cm-tour-start"]', { timeout: 15000 });
}

export async function toSection(page: Page, id: string): Promise<void> {
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
}

export async function waitForKeys(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="cm-reader-id"]');
    return el && /^[0-9a-f]{64}$/.test(el.textContent?.trim() || '');
  }, { timeout: 10000 });
}

export function base(): string {
  return BASE;
}
