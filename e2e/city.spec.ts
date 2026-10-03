import { expect, test } from '@playwright/test';

test('workstation job objects open the corresponding job by pointer and keyboard',async({page})=> {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await page.getByLabel('Motion',{exact:false}).selectOption('reduced');
  await page.getByRole('button',{name:/Enter Uditus/}).click();
  const job=page.getByRole('button',{name:/Open job:/}).first();
  await expect(job).toBeAttached();
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  const title=(await job.getAttribute('aria-label'))!.replace('Open job: ','');
  // The DOM control supplies keyboard access; pointer hits the painted folio.
  const at=await job.evaluate(el=> {
    const anchor=el.parentElement!.getBoundingClientRect();
    return {x:anchor.x,y:anchor.y-6};
  });
  await page.mouse.click(at.x,at.y);
  await expect(page.getByRole('complementary',{name:'Details'}).getByRole('heading',{level:2})).toHaveText(title);
  await page.keyboard.press('Escape');
  await job.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary',{name:'Details'}).getByRole('heading',{level:2})).toHaveText(title);
  await page.getByLabel('Data source',{exact:true}).selectOption('live');
  await expect(page.getByRole('button',{name:/Open job:/})).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const width of [1280, 1440]) test(`all city labels remain separated inside a ${width}px viewport at every zoom extreme`, async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width, height: 720 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Enter Uditus/ })).toBeVisible();
  await page.getByLabel('Motion', { exact: false }).selectOption('reduced');
  for (const business of ['campus', 'Uditus', 'Etsy Studio', 'Aster Ledger', 'Hermes HQ']) {
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
        const anchors = Array.from(scene.querySelectorAll<HTMLElement>('[data-ax]'));
        const labels=anchors.filter(el=>getComputedStyle(el).visibility==='visible');
        // At campus close zoom, offscreen anchors must disappear instead of floating
        // over unrelated buildings. At fit/min all identities remain visible.
        const zoom = Number(scene.closest('.stage')?.querySelector('.zoom')?.textContent?.match(/\d+/)?.[0]??100);
        if(scene.getAttribute('data-cutaway-business')!==''||zoom<=110) {
          if(labels.length!==anchors.length)return false;
        }
        const rects = labels.map((el) => el.firstElementChild!.getBoundingClientRect());
        return rects.every((r, i) => r.left >= bounds.left && r.top >= bounds.top && r.right <= bounds.right && r.bottom <= bounds.bottom && rects.slice(i + 1).every((b) => r.right <= b.left || r.left >= b.right || r.bottom <= b.top || r.top >= b.bottom));
      }), { message: `${business} labels at ${zoom} zoom` }).toBe(true);
    }
  }
});
