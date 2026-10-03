import { Iso, lcg, type Ctx } from './pixel';

/** Low coastal rock with a submerged skirt and facets rising through the water. */
export function shoreRock(ctx:Ctx,iso:Iso,x:number,y:number,r:number,seed:number) {
  const random=lcg(seed),p=iso.p(x,y,-6),h=r*(.7+random()*.5);
  ctx.save();
  ctx.strokeStyle='rgba(134,178,192,.23)';ctx.lineWidth=.45;ctx.beginPath();ctx.ellipse(p[0],p[1]+1,r*1.8,r*.65,0,0,Math.PI*2);ctx.stroke();
  const points:[[number,number],[number,number],[number,number],[number,number],[number,number]]=[
    [p[0]-r*1.25,p[1]],[p[0]-r*.6,p[1]-h*.65],[p[0]+r*.2,p[1]-h],[p[0]+r*1.15,p[1]-h*.4],[p[0]+r*1.4,p[1]+r*.18],
  ];
  ctx.fillStyle='#263746';ctx.beginPath();points.forEach(([a,b],i)=>i?ctx.lineTo(a,b):ctx.moveTo(a,b));ctx.closePath();ctx.fill();
  ctx.fillStyle='#516171';ctx.beginPath();ctx.moveTo(...points[0]);ctx.lineTo(...points[1]);ctx.lineTo(...points[2]);ctx.lineTo(p[0]+r*.35,p[1]-h*.35);ctx.closePath();ctx.fill();
  ctx.fillStyle='#394d5f';ctx.beginPath();ctx.moveTo(...points[2]);ctx.lineTo(...points[3]);ctx.lineTo(...points[4]);ctx.lineTo(p[0]+r*.35,p[1]-h*.35);ctx.closePath();ctx.fill();
  ctx.strokeStyle='rgba(162,196,203,.25)';ctx.beginPath();ctx.moveTo(...points[0]);ctx.lineTo(...points[1]);ctx.lineTo(...points[2]);ctx.stroke();ctx.restore();
}

export function mainIslandRocks(ctx:Ctx,iso:Iso) {
  const random=lcg(74191);
  for(let side=0;side<4;side++) for(let t=16;t<480;t+=13+random()*12) {
    // Reserve the west-side cable landing and its foundations.
    if(side===0&&t>225&&t<265) continue;
    if(random()<.22)continue;
    const offset=7+random()*11,r=2.5+random()*5;
    const p=side===0?[-offset,t]:side===1?[t,-offset]:side===2?[480+offset,t]:[t,480+offset];
    shoreRock(ctx,iso,p[0]!,p[1]!,r,Math.round(t*57+side*900));
    if(random()<.4) shoreRock(ctx,iso,p[0]!+5+random()*4,p[1]!+3+random()*4,r*.55,Math.round(t*91));
  }
}
