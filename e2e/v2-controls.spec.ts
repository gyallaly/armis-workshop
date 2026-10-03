import { expect, test } from '@playwright/test';

test('power allocation, company shutdown and Hermes chat are functional and explicitly simulated', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Power station', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Power station', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Allocations', exact: true }).click();
  const uditus = page.locator('.allocation-card').filter({ has: page.locator('.allocation-card__title strong', { hasText: /^Uditus$/ }) });
  await uditus.getByRole('button', { name: 'Shut down', exact: true }).click();
  await expect(uditus.locator('.v2-chip')).toHaveText('stopped');
  await expect(page.locator('.v2-receipts')).toContainText('effective');
  await expect(page.locator('.v2-receipts')).toContainText('deterministic simulation');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(uditus.locator('.v2-chip')).toHaveText('stopped');
  await expect(uditus).toContainText('0 working');
  await page.getByLabel('Scenario', { exact: true }).selectOption('codex-reset');
  await expect(uditus.locator('.v2-chip')).toHaveText('stopped');
  await expect(uditus).toContainText('0 working');
  await uditus.getByRole('button', { name: 'Resume company' }).click();
  await expect(uditus.locator('.v2-chip')).toHaveText('running');
  await uditus.getByLabel('Uditus token ceiling', { exact: true }).fill('0');
  await uditus.getByRole('button', { name: 'Apply allocation' }).click();
  await expect(uditus.getByLabel('Uditus token ceiling', { exact: true })).toHaveValue('0');
  await expect(uditus.getByLabel('Uditus spend ceiling', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /Talk to Hermes/ }).click();
  await page.getByLabel('Message Hermes').fill('What is happening?');
  await page.locator('.hermes-chat').getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('.hermes-chat__messages')).toContainText('Simulation report');
  await page.getByRole('button', { name: 'Stop all managed AI' }).click();
  await expect(page.getByLabel('Message Hermes')).toBeDisabled();
  await page.getByRole('button', { name: 'Resume all companies' }).click();
  await expect(page.getByLabel('Message Hermes')).toBeEnabled();
  await page.getByRole('button', { name: 'Guide', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What everything means' })).toBeVisible();
  await expect(page.locator('.guide')).toContainText('Red reactor fault');
});

test('live chat and owner operations remain unavailable without a verified Mini capability', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Data source', { exact: true }).selectOption('live');
  await page.getByRole('button', { name: /Talk to Hermes/ }).click();
  await expect(page.getByLabel('Message Hermes')).toBeDisabled();
  await page.getByRole('button', { name: 'Power station', exact: true }).click();
  await page.getByRole('button', { name: 'Allocations', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop all managed AI' })).toBeDisabled();
  await expect(page.locator('.allocation-card .v2-chip').first()).toHaveText('unverified');
});
