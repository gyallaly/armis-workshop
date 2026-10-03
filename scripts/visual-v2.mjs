import { chromium } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
const output=process.argv[2]??'screenshots/v2/round-1';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:process.env.PW_CHANNEL??'msedge'});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>localStorage.setItem('armis-workshop.prefs.v1',JSON.stringify({source:'demo',scenario:'steady',speed:1,motion:'reduced',taskFlow:true,minimap:true,tab:'activity'})));
await page.goto('http://127.0.0.1:5173/');
await page.getByRole('button',{name:/Enter Hermes HQ/}).waitFor();
await page.waitForTimeout(1500);
const pause=page.getByRole('button',{name:'Pause',exact:true});if(await pause.count()) await pause.click();
await page.screenshot({path:output+'/campus-1440.png'});
for(const [id,name] of [['hermes-hq','Hermes HQ'],['uditus','Uditus'],['etsy-studio','Etsy Studio'],['aster-ledger','Aster Ledger']]) {
  await page.getByRole('button',{name:new RegExp('Enter '+name)}).click();
  await page.waitForTimeout(900);
  await page.screenshot({path:output+'/'+id+'-1440.png'});
  await page.getByRole('button',{name:'Campus',exact:true}).click();
  await page.waitForTimeout(600);
}
const station=page.getByRole('button',{name:/Open power station/i});
if(await station.count()) {
  await station.first().click();await page.waitForTimeout(400);await page.screenshot({path:output+'/power-station.png'});
  for(const section of ['Allocations','Machine','Efficiency']) {
    await page.getByRole('button',{name:section,exact:true}).click();await page.waitForTimeout(200);await page.screenshot({path:output+'/power-'+section.toLowerCase()+'.png'});
  }
}
const chat=page.getByRole('button',{name:/Talk to Hermes/});
if(await chat.count()) {await chat.click();await page.getByLabel('Message Hermes').fill('Explain what is happening in this city.');await page.locator('.hermes-chat').getByRole('button',{name:'Send',exact:true}).click();await page.waitForTimeout(150);await page.screenshot({path:output+'/hermes-chat.png'});await chat.click();}
const guide=page.getByRole('button',{name:/Guide|What.*means/i});
if(await guide.count()) {await guide.first().click();await page.waitForTimeout(300);await page.screenshot({path:output+'/guide.png'});}
await page.setViewportSize({width:1280,height:720});
await page.getByRole('button',{name:'Campus',exact:true}).click();
await page.getByRole('button',{name:'Reset view',exact:true}).click();await page.waitForTimeout(600);
await page.screenshot({path:output+'/campus-1280.png'});
await page.getByRole('button',{name:/Enter Hermes HQ/}).click();await page.waitForTimeout(600);
await page.screenshot({path:output+'/hq-1280.png'});
const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,world:document.querySelector('.scene')?.getAttribute('data-world-view'),cutaway:document.querySelector('.scene')?.getAttribute('data-cutaway-business')}));
await writeFile(output+'/results.json',JSON.stringify({errors,metrics},null,2));
console.log(JSON.stringify({errors,metrics,output}));
await browser.close();
