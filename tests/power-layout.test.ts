import { expect,it } from 'vitest';
import { CORE_CENTER,PIPE_ELEVATION,POWER_ROUTES,routeSupports } from '../src/scene/powerLayout';

it('keeps the power island separated from land with a raised supported supply bridge',()=>{
  expect(CORE_CENTER[0]+78).toBeLessThan(-100);
  expect(PIPE_ELEVATION).toBeGreaterThan(0);
  const feed=POWER_ROUTES['campus-feed']!;
  expect(feed[0]![0]).toBeLessThan(-100);
  expect(routeSupports(feed).some(([x])=>x<0)).toBe(true);
  expect(routeSupports(feed).some(([x])=>x>=0)).toBe(true);
});

it('draws common supply trunks once instead of overlapping company branches',()=>{
  const segments=Object.entries(POWER_ROUTES).flatMap(([id,path])=>path.slice(1).map((b,i)=>({id,a:path[i]!,b})));
  for(let i=0;i<segments.length;i++) for(let j=i+1;j<segments.length;j++) {
    const p=segments[i]!,q=segments[j]!;
    const pVertical=p.a[0]===p.b[0],qVertical=q.a[0]===q.b[0];
    if(pVertical!==qVertical) continue;
    const fixed=pVertical?0:1,along=pVertical?1:0;
    if(p.a[fixed]!==q.a[fixed])continue;
    const overlap=Math.min(Math.max(p.a[along],p.b[along]),Math.max(q.a[along],q.b[along]))-Math.max(Math.min(p.a[along],p.b[along]),Math.min(q.a[along],q.b[along]));
    expect(overlap,`${p.id} overlaps ${q.id}`).toBeLessThanOrEqual(0);
  }
});

it('keeps perpendicular pipes connected only at explicit junctions',()=>{
  const segments=Object.entries(POWER_ROUTES).flatMap(([id,path])=>path.slice(1).map((b,i)=>({id,a:path[i]!,b})));
  for(const p of segments)for(const q of segments) {
    if(p.a[0]!==p.b[0]||q.a[1]!==q.b[1])continue;
    const x=p.a[0],y=q.a[1];
    const insideV=y>Math.min(p.a[1],p.b[1])&&y<Math.max(p.a[1],p.b[1]);
    const insideH=x>Math.min(q.a[0],q.b[0])&&x<Math.max(q.a[0],q.b[0]);
    expect(insideV&&insideH,`${p.id} crosses ${q.id}`).toBe(false);
  }
});
