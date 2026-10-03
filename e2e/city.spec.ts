import { expect, test } from '@playwright/test';

for (const width of [1280, 1440]) test(`all city labels remain separated inside a ${width}px viewport at every zoom extreme`, async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width, height: 720 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Enter Uditus/ })).toBeVisible();
  await page.getByLabel('Motion', { exact: false }).selectOption('reduced');
  for (const business of ['campus', 'Uditus', 'Etsy Studio', 'Aster Ledger', 'Armis Syndicate HQ']) {
    if (business !== 'campus') {
      await page.getByRole('button', { name: 'Campus', exact: true }).click();
      await page.getByRole('button', { name: new RegExp(`Enter ${business}`) }).click();
    }
    for (const zoom of ['fit', 'min', 'max']) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${business} page must not overflow horizontally`).toBe(true);
      await page.getByRole('button', { name: 'Reset view', exact: true }).click();
      if (zoom !== 'fit') for (let i = 0; i < (zoom === 'min' ? 3 : 8); i++) await page.getByRole('button', { name: zoom === 'min' ? 'Zoom out' : 'Zoom in', exact: true }).click();
      await expect.poll(async () => page.locator('.scene').evaluate((scene) => {
        const bounds = scene.getBoundingClientRect();
        const labels = Array.from(scene.querySelectorAll<HTMLElement>('[data-ax]'));
        if (labels.some((el) => getComputedStyle(el).visibility !== 'visible')) return false;
        const rects = labels.map((el) => el.firstElementChild!.getBoundingClientRect());
        return rects.every((r, i) => r.left >= bounds.left && r.top >= bounds.top && r.right <= bounds.right && r.bottom <= bounds.bottom && rects.slice(i + 1).every((b) => r.right <= b.left || r.left >= b.right || r.bottom <= b.top || r.top >= b.bottom));
      }), { message: `${business} labels at ${zoom} zoom` }).toBe(true);
    }
  }
});
