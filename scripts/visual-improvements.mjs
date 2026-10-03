import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const output=process.argv[2] ?? 'screenshots/city-improvements';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge'});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5173/');
await page.getByRole('button',{name:/Enter Uditus/}).waitFor();
await page.getByLabel('Motion',{exact:false}).selectOption('reduced');
await page.getByRole('button',{name:'Pause',exact:true}).click();
await page.waitForTimeout(200);
await page.screenshot({path:output+'/campus.png'});
for(const [id,name] of [['hermes-hq','Hermes HQ'],['uditus','Uditus'],['etsy-studio','Etsy Studio'],['aster-ledger','Aster Ledger']]) {
  await page.getByRole('button',{name:new RegExp('Enter '+name)}).click();
  await page.waitForTimeout(700);
  await page.screenshot({path:output+'/'+id+'.png'});
  if(id==='uditus') {
    const jobs=page.getByRole('button',{name:/Open job:/});
    await jobs.first().waitFor({state:'attached'});
    await jobs.first().focus();
    await page.keyboard.press('Enter');
    console.log('Job selected:',await page.getByRole('complementary',{name:'Details'}).getByRole('heading',{level:2}).textContent());
    await page.keyboard.press('Escape');
  }
  if(id==='uditus') {
    await page.getByLabel('Data source',{exact:true}).selectOption('live');
    await page.waitForTimeout(600);
    await page.screenshot({path:output+'/full-lounge.png'});
    console.log('Disconnected job controls:',await page.getByRole('button',{name:/Open job:/}).count());
    await page.getByLabel('Data source',{exact:true}).selectOption('demo');
  }
  await page.getByRole('button',{name:'Campus',exact:true}).click();
}
await page.setViewportSize({width:1280,height:720});
await page.getByRole('button',{name:/Enter Hermes HQ/}).click();
await page.waitForTimeout(500);
await page.screenshot({path:output+'/hq-1280.png'});
console.log(JSON.stringify({errors,output}));
await browser.close();
