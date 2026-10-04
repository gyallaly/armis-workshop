import { describe, expect, it, vi } from 'vitest';
import { cacheSceneLayers, prepareSceneContext, registerTexture } from '../src/scene/renderQuality';

function context(canvas: {width:number;height:number}) {
  return { canvas, drawImage:vi.fn(), clearRect:vi.fn(), setTransform:vi.fn(), imageSmoothingEnabled:false, imageSmoothingQuality:'low' } as unknown as CanvasRenderingContext2D;
}

describe('static scene replay',()=>{
  it('composites static layers once, retaining the infrastructure seam at texture resolution',()=>{
    const contexts:CanvasRenderingContext2D[]=[];
    const create=()=>{const canvas={width:0,height:0,getContext:()=>ctx} as unknown as HTMLCanvasElement;const ctx=context(canvas);contexts.push(ctx);return canvas;};
    const render=vi.fn((ctx:CanvasRenderingContext2D,seam:(ctx:CanvasRenderingContext2D)=>void)=>{
      ctx.drawImage({} as HTMLCanvasElement,0,0);seam(ctx);
      for(let i=0;i<430;i++)ctx.drawImage({} as HTMLCanvasElement,i,0);
    });
    const layers=cacheSceneLayers(1100,760,render,create);
    expect(render).toHaveBeenCalledTimes(1);
    expect(contexts.every(ctx=>ctx.canvas.width===3300&&ctx.canvas.height===2280)).toBe(true);
    expect(contexts[0]!.clearRect).toHaveBeenCalledWith(0,0,3300,2280);
    const target=context({width:1280,height:720});const draw=target.drawImage;prepareSceneContext(target);
    const order:string[]=[];vi.mocked(draw).mockImplementation(()=>{order.push('static');});
    for(let i=0;i<10;i++)layers.draw(target,()=>order.push('infrastructure'));
    expect(render).toHaveBeenCalledTimes(1);
    expect(draw).toHaveBeenCalledTimes(20);
    expect(order).toEqual(Array.from({length:10},()=>['static','infrastructure','static']).flat());
    expect(vi.mocked(draw).mock.calls.every(call=>call[3]===1100&&call[4]===760)).toBe(true);
  });
  it('does not renormalize explicit sprite crops or image destination sizes',()=>{
    const target=context({width:1280,height:720}),canvas={width:300,height:150} as HTMLCanvasElement;
    const draw=target.drawImage;registerTexture(canvas,100,50);prepareSceneContext(target);prepareSceneContext(target);
    target.drawImage(canvas,10,20);target.drawImage(canvas,10,20,25,30);target.drawImage(canvas,0,0,10,10,20,30,40,50);
    expect(draw).toHaveBeenNthCalledWith(1,canvas,10,20,100,50);
    expect(draw).toHaveBeenNthCalledWith(2,canvas,10,20,25,30);
    expect(draw).toHaveBeenNthCalledWith(3,canvas,0,0,10,10,20,30,40,50);
  });
});
