import { afterEach, expect, it, vi } from 'vitest';
import { buildCampus } from '../src/scene/campus';
import type { Ctx } from '../src/scene/pixel';

afterEach(()=>vi.unstubAllGlobals());

it('keeps scenery opaque in campus and dissolves only the explicitly selected shell',()=>{
  const gradient={addColorStop(){}};
  vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>new Proxy({}, {
    get:(_,key)=>key==='createLinearGradient'||key==='createRadialGradient'?()=>gradient:()=>{},
  })})});
  const campus=buildCampus({});
  let alphas:number[]=[];
  const saved:number[]=[];
  const ctx={
    globalAlpha:1,
    drawImage(){alphas.push(this.globalAlpha);},
    save(){saved.push(this.globalAlpha);},
    restore(){this.globalAlpha=saved.pop()!;},
  };
  campus.draw(ctx as unknown as Ctx,undefined,0,()=>{});
  const closed=[...alphas];alphas=[];
  campus.draw(ctx as unknown as Ctx,'uditus',0,()=>{});
  expect(closed.length).toBeGreaterThan(100);
  expect(closed.every(alpha=>alpha===1)).toBe(true);
  expect(alphas.filter(alpha=>alpha===0)).toHaveLength(1);
  expect(alphas.filter(alpha=>alpha===1)).toHaveLength(closed.length-1);
});
