import {test,expect} from '@playwright/test';
test('real-source evidence panels keep unavailable business data independent of HQ',async({page})=>{
 await page.goto('/');
 await expect(page.getByText('Runtime evidence',{exact:true})).toBeVisible({timeout:5000});
 await page.getByText('Runtime evidence',{exact:true}).click();
 await expect(page.getByText('No explicitly bound setup evidence journal',{exact:true})).toBeVisible();
 await expect(page.getByText('No authorized Uditus project environment bound',{exact:true})).toBeVisible();
 await expect(page.getByText('LIVE · NOT CONNECTED',{exact:true})).toBeVisible();
});
