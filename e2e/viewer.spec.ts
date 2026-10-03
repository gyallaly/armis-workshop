import { expect, type Page, test } from '@playwright/test';

async function open(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // Explicit test-only opt-in. The user-facing dashboard always opens in Live.
  await page.getByRole('combobox', { name: 'Data source' }).selectOption('demo');
  await expect(page.getByRole('button', { name: /Enter Uditus/ })).toBeVisible();
}

const panel = (page: Page) => page.getByRole('complementary', { name: 'Details' });

test('campus loads in demo mode with no secrets and all three buildings', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await expect(page.getByText('DEMO DATA')).toBeVisible();
  await expect(page.getByRole('button', { name: /Enter Armis Syndicate HQ/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Enter Etsy Studio/ })).toBeVisible();
  // Real Uditus lockup is used for its label; Etsy Studio is marked provisional.
  await expect(page.getByRole('img', { name: 'Uditus' }).first()).toHaveAttribute('src', /lockup-inline-white\.png/);
  await expect(page.getByRole('button', { name: /Enter Etsy Studio/ }).getByText('provisional')).toBeVisible();
  expect(errors).toEqual([]);
});

test('campus -> business -> worker -> back to campus', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /Enter Uditus/ }).click();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByText('Uditus')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Quality department' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Lounge department' })).toBeVisible();
  // roster lists the persistent identities
  const roster = panel(page).locator('.roster__btn');
  await expect(roster).toHaveCount(8);
  await roster.filter({ hasText: 'Reviewer' }).click();
  await expect(panel(page).getByRole('heading', { name: 'Reviewer' })).toBeVisible();
  await expect(panel(page).getByText('uditus.reviewer')).toBeVisible();
  await page.getByRole('button', { name: 'Campus' }).click();
  await expect(page.getByRole('button', { name: /Enter Uditus/ })).toBeVisible();
});

test('campus counts agree with the roster panel', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Pause' }).click();
  const label = await page.getByRole('button', { name: /Enter Uditus/ }).getAttribute('aria-label');
  const active = Number(/(\d+) active/.exec(label!)![1]);
  const roster = Number(/roster (\d+)/.exec(label!)![1]);
  await page.getByRole('button', { name: /Enter Uditus/ }).click();
  await expect(panel(page).locator('.roster__btn')).toHaveCount(roster);
  await expect(panel(page).locator('.roster__btn .state--active')).toHaveCount(active);
});

test('simulated redirect is acknowledged, then applied or rejected', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /Enter Uditus/ }).click();
  const working = panel(page).locator('.roster__btn', { has: page.locator('.state--active') }).first();
  await expect(working).toBeVisible();
  await working.click();
  await panel(page).getByRole('button', { name: 'Redirect task' }).click();
  const dialog = page.getByRole('dialog', { name: 'Redirect task' });
  await expect(dialog.getByText(/Simulated/)).toBeVisible();
  await dialog.getByLabel('Instruction').fill('Check keyboard navigation first.');
  await dialog.getByRole('button', { name: /Send simulated redirect/ }).click();
  await expect(dialog.locator('.rsteps li.is-done')).toHaveCount(1);
  await expect(dialog.locator('.rsteps li.is-done')).toHaveCount(2, { timeout: 8000 });
  await expect(dialog.locator('.rsteps li.is-done')).toHaveCount(3, { timeout: 10000 });
  await dialog.getByRole('button', { name: 'Done' }).click();
});

test('evidence viewer shows observable artifacts', async ({ page }) => {
  await open(page);
  await page.getByRole('tab', { name: 'Tasks' }).click();
  await panel(page).getByLabel('Status').selectOption('all');
  const withEvidence = panel(page).locator('.tasklist__row').first();
  await withEvidence.click();
  await expect(panel(page).getByRole('heading', { level: 2 })).toBeVisible();
  const btn = panel(page).getByRole('button', { name: 'View evidence' });
  if (await btn.isEnabled()) {
    await btn.click();
    const d = page.getByRole('dialog', { name: /Evidence/ });
    await expect(d.getByText(/no private model reasoning/i)).toBeVisible();
    await expect(d.locator('pre')).toBeVisible();
  }
});

test('capacity: codex out until reset, gemini remaining not reported, shared scope', async ({ page }) => {
  await open(page);
  await page.getByLabel('Scenario').selectOption('codex-reset');
  await page.getByRole('tab', { name: 'AI capacity' }).click();
  const codex = panel(page).getByRole('article', { name: 'Codex capacity' });
  await expect(codex.getByText('Unavailable')).toBeVisible();
  await expect(codex.getByText(/^in /)).toBeVisible();
  await expect(codex.getByText('Provider reported').first()).toBeVisible();
  const gem = panel(page).getByRole('article', { name: 'Gemini capacity' });
  await expect(gem.getByText('Not reported')).toBeVisible();
  await expect(gem.getByText('Locally measured').first()).toBeVisible();
  await expect(panel(page).getByText(/never split into per-worker allowances/)).toBeVisible();
});

test('lights go out when every provider is unavailable', async ({ page }) => {
  await open(page);
  await page.getByLabel('Scenario').selectOption('all-unavailable');
  await expect(page.getByText(/Lights out/)).toBeVisible();
  await page.getByLabel('Scenario').selectOption('steady');
  await expect(page.getByText(/Lights out/)).toHaveCount(0);
});

test('pause freezes the clock and reset replays', async ({ page }) => {
  await open(page);
  await page.getByLabel('Speed').selectOption('8');
  await page.getByRole('button', { name: 'Pause' }).click();
  const t1 = await page.locator('.clock strong').textContent();
  await page.waitForTimeout(1500);
  expect(await page.locator('.clock strong').textContent()).toBe(t1);
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('button', { name: /^Reset$/ }).click();
  await expect(page.locator('.clock strong')).toHaveText('17:30');
});

test('stream drop shows stale state, then reconnects', async ({ page }) => {
  await open(page);
  await page.getByLabel('Speed').selectOption('8');
  await page.getByRole('button', { name: /Drop stream/ }).click();
  await expect(page.getByText(/Stream interrupted/)).toBeVisible();
  await expect(page.getByText(/Stream interrupted/)).toHaveCount(0, { timeout: 10000 });
});

test('live mode is disconnected: unknown status, redirect disabled', async ({ page }) => {
  await page.route('**/api/events', route => route.abort());
  await open(page);
  await page.getByRole('combobox', { name: 'Data source' }).selectOption('live');
  await expect(page.getByText('LIVE · NOT CONNECTED')).toBeVisible();
  await expect(page.getByRole('button', { name: /Enter Uditus/ })).toHaveAccessibleName(/status unknown/);
  await page.getByRole('button', { name: /Enter Uditus/ }).click();
  await expect(panel(page).locator('.roster__btn')).toHaveCount(0);
  await expect(page.getByText('DEMO DATA')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Data source' }).selectOption('demo');
});

test('keyboard: scene is focusable and Escape returns to campus', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /Enter Etsy Studio/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('group', { name: 'Delivery department' })).toBeVisible();
  await page.getByRole('application').focus();
  await page.keyboard.press('+');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Enter Uditus/ })).toBeVisible();
});

test('reduced motion preference is honoured and persisted', async ({ page }) => {
  await open(page);
  await page.getByLabel('Motion').selectOption('reduced');
  await page.reload();
  await expect(page.getByLabel('Motion')).toHaveValue('reduced');
});

test('usable at 1280x720', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page);
  await expect(page.getByRole('button', { name: /Enter Uditus/ })).toBeInViewport();
  await expect(page.getByRole('tab', { name: 'Tasks' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeInViewport();
});

test('Aster Ledger: DEMO/PAPER labelled, paper book, venue board, news drawer, no order control', async ({ page }) => {
  await open(page);
  const label = page.getByRole('button', { name: /Enter Aster Ledger/ });
  await expect(label.getByText('DEMO / PAPER')).toBeVisible();
  await label.click();
  await expect(page.getByRole('group', { name: 'Delivery department' })).toBeVisible();
  const p = panel(page);
  await expect(p.getByText('DEMO · PAPER TRADING')).toBeVisible();
  await expect(p.getByText('Start bankroll')).toBeVisible();
  await expect(p.getByText('$20.00')).toBeVisible();
  await expect(p.getByText(/Operating costs/)).toBeVisible();
  await expect(p.getByRole('table', { name: /Venue comparison/ })).toBeVisible();
  await expect(p.getByText('Polymarket US').first()).toBeVisible();
  await expect(p.getByText(/breaks the hedge/).first()).toBeVisible();
  await expect(p.getByText(/Simulated exit/).first()).toBeVisible();
  // nothing on the page offers to place, buy or sell
  await expect(page.getByRole('button', { name: /place|bet|buy|sell|order/i })).toHaveCount(0);
  await p.getByRole('button', { name: /Open news & evidence drawer/ }).click();
  const d = page.getByRole('dialog', { name: 'News & evidence' });
  await expect(d.getByText(/published .* observed/).first()).toBeVisible();
  await expect(d.getByText('primary source').first()).toBeVisible();
});

test('Aster Ledger conflicting-sources scenario shows contradictions', async ({ page }) => {
  await open(page);
  await page.getByLabel('Scenario').selectOption('ledger-conflicting');
  await page.getByRole('button', { name: /Enter Aster Ledger/ }).click();
  await panel(page).getByRole('button', { name: /Open news & evidence drawer/ }).click();
  await expect(page.getByRole('dialog', { name: 'News & evidence' }).getByText(/Contradicts:/).first()).toBeVisible();
});
