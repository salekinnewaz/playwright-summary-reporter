import { expect, test } from '@playwright/test';

test.describe('example suite', () => {
  test('renders a heading with page content', async ({ page }) => {
    await page.setContent('<h1>Hello from playwright-summary-reporter</h1>');

    await expect(page.locator('h1')).toHaveText('Hello from playwright-summary-reporter');
  });

  test('evaluates a simple assertion without network access', async ({ page }) => {
    await page.setContent('<p id="total">42</p>');

    const total = await page.locator('#total').textContent();

    expect(total).toBe('42');
  });

  test.skip('is skipped on purpose', async () => {
    // Intentionally skipped so the example run exercises the skipped counter.
  });
});
