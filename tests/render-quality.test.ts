import { expect,it } from 'vitest';
import { prepareSceneContext,registerTexture,textureSize } from '../src/scene/renderQuality';

it('draws high-resolution textures at logical dimensions without changing explicit crops',()=>{
  const calls:unknown[][]=[];
  const ctx={drawImage:(...args:unknown[])=>calls.push(args)} as unknown as CanvasRenderingContext2D;
  const source={width:300,height:150} as HTMLCanvasElement;
  registerTexture(source,100,50);
  prepareSceneContext(ctx);prepareSceneContext(ctx);
  ctx.drawImage(source,10,20);
  expect(calls[0]).toEqual([source,10,20,100,50]);
  ctx.drawImage(source,0,0,300,75,1,2,30,15);
  expect(calls[1]).toEqual([source,0,0,300,75,1,2,30,15]);
  expect(textureSize(source)).toEqual({width:100,height:50});
});
