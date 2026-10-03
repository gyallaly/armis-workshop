import { expect,test } from '@playwright/test';

test('buildings reveal their first floor in the same world and dissolve their shell',async({page})=>{
  await page.goto('/');
  await page.getByLabel('Motion',{exact:false}).selectOption('full');
  const scene=page.locator('.scene');
  await expect(scene).toHaveAttribute('data-world-view','campus');
  await page.getByRole('button',{name:/Enter Hermes HQ/}).click();
  await expect(scene).toHaveAttribute('data-cutaway-business','hermes-hq');
  const progress=await scene.getAttribute('data-cutaway-progress');
  expect(Number(progress)).toBeLessThan(1);
  await expect(scene).toHaveAttribute('data-cutaway-progress','1');
  await expect(page.getByText('FLOOR 01',{exact:true})).toBeVisible();
  await expect(scene).toHaveAttribute('data-world-view','campus');
  await page.getByRole('button',{name:'Close building cutaway'}).click();
  await expect(scene).toHaveAttribute('data-cutaway-business','');
  await page.getByLabel('Motion',{exact:false}).selectOption('reduced');
  await page.getByRole('button',{name:/Enter Uditus/}).click();
  await expect(scene).toHaveAttribute('data-cutaway-progress','1');
  await expect(scene).toHaveAttribute('data-cutaway-business','uditus');
});

test('offshore power island focuses on selection and stays represented in the minimap',async({page})=>{
  await page.goto('/');
  await page.getByLabel('Motion',{exact:false}).selectOption('reduced');
  await page.getByRole('button',{name:'Open power station',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Power station',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Gemini reactor',exact:true}).click();
  await expect(page.getByRole('button',{name:'Gemini reactor',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByText('Not reported',{exact:true}).first()).toBeVisible();
  await page.getByRole('button',{name:'All reactors',exact:true}).click();
  await expect(page.locator('.scene')).toHaveAttribute('data-world-view','campus');
  await expect(page.getByRole('img',{name:'Minimap. Click to move the view.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Reset view',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Reset view',exact:true}).click();
  await expect(page.locator('.zoom')).toContainText('100');
});
