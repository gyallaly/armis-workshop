import { expect, it } from 'vitest';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

it('cached real campus layers preserve pixels and bound per-frame static draw calls',async()=>{
  const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'error'});
  await server.listen();
  const address=server.httpServer!.address() as {port:number};
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage();
    await page.route('**/scene-probe.html',route=>route.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));
    await page.goto(`http://127.0.0.1:${address.port}/scene-probe.html`);
    const result=await page.evaluate(async()=>{
      // Vite serves the actual TypeScript modules; no generated replacement renderer.
      const campusModule='/src/scene/campus.ts',qualityModule='/src/scene/renderQuality.ts';
      // Vitest rewrites callback imports to SSR-only helpers. These fixed
      // imports must execute in Chromium against the actual Vite modules.
      const browserImport=(url:string)=>new Function('url','return import(url)')(url);
      const {buildCampus}=await browserImport(campusModule);
      const {cacheSceneLayers,prepareSceneContext}=await browserImport(qualityModule);
      const campus=buildCampus({});
      const results=[];
      for(const openId of [undefined,'uditus','etsy-studio','aster-ledger','hermes-hq']) {
        const layers=cacheSceneLayers(campus.width,campus.height,(ctx:CanvasRenderingContext2D,seam:(ctx:CanvasRenderingContext2D)=>void)=>campus.draw(ctx,openId,0,seam));
        for(const scale of [0.7,1,5]) {
          const canvases=[document.createElement('canvas'),document.createElement('canvas')];
          const infrastructure=(g:CanvasRenderingContext2D)=>{g.fillStyle='#476789';g.fillRect(50,150,800,300);};
          let calls=0;
          for(const [index,canvas] of canvases.entries()) {
            canvas.width=1280;canvas.height=720;const ctx=canvas.getContext('2d')!;prepareSceneContext(ctx);
            ctx.setTransform(scale,0,0,scale,640-550*scale,360-380*scale);
            if(index===0)campus.draw(ctx,openId,0,infrastructure);
            else {const draw=ctx.drawImage.bind(ctx);ctx.drawImage=((...args:Parameters<typeof ctx.drawImage>)=>{calls++;draw(...args);}) as typeof ctx.drawImage;layers.draw(ctx,infrastructure);}
          }
          const before=canvases[0]!.getContext('2d')!.getImageData(0,0,1280,720).data;
          const after=canvases[1]!.getContext('2d')!.getImageData(0,0,1280,720).data;
          let different=0,maxDelta=0,totalDelta=0;
          for(let i=0;i<before.length;i++){const delta=Math.abs(before[i]!-after[i]!);if(delta)different++;maxDelta=Math.max(maxDelta,delta);totalDelta+=delta;}
          results.push({view:openId??'campus',scale,calls,different,maxDelta,meanDelta:totalDelta/before.length});
        }
      }
      return results;
    });
    console.log('Real canvas cache comparison',JSON.stringify(result));
    expect(result).toHaveLength(15);
    for(const sample of result) {
      expect(sample.calls,`${sample.view} at ${sample.scale}`).toBe(2);
      // One additional high-quality resample can change edge antialiasing, not geometry.
      expect(sample.meanDelta,`${sample.view} at ${sample.scale}`).toBeLessThan(1);
    }
  }finally{await browser.close();await server.close();}
},60_000);
