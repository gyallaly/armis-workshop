import { CORE_CENTER, CORE_OFFSET, PIPE_ELEVATION, POWER_ROUTES, routeSupports } from './powerLayout';
import { drawCoreArchitecture } from './coreArchitecture';
import type { WorkshopState } from '../core/types';
import { pipeWidth, reactorState, reactorQuota, type PowerPolicy } from '../core/powerVisuals';
import { displayStatus } from '../core/selectors';
import { box, Iso, left, px, right, text, top, type Ctx } from './pixel';
import { CAMPUS_FOOTPRINTS } from './campus';

type Pt = [number,number];
const iso = new Iso(550,190);
const routes=POWER_ROUTES;
const hull:Pt[]=Array.from({length:32},(_,i)=>iso.p(CORE_CENTER[0]+Math.cos(i*Math.PI/16)*78,CORE_CENTER[1]+Math.sin(i*Math.PI/16)*78));
const command:[number,number]=[-100+CORE_OFFSET[0],214+CORE_OFFSET[1]];
export const POWER_STATION={hull,label:iso.p(...command,60),focus:iso.p(...CORE_CENTER,18),bounds:{x0:35,y0:80,x1:280,y1:285}};

export function drawBuildingCharge(ctx:Ctx,state:WorkshopState,policies:Record<string,PowerPolicy>,now=0,motion=false) {
  ctx.save();
  for(const [id,r] of Object.entries(CAMPUS_FOOTPRINTS)) {
    const policy=policies[id];
    const supplied=['demo','connected'].includes(state.connection)&&policy&&['running','draining'].includes(policy.lifecycle)&&policy.weight>0&&policy.maxConcurrent>0;
    const corners:Pt[]=[[r.x0-2,r.y0-2],[r.x1+2,r.y0-2],[r.x1+2,r.y1+2],[r.x0-2,r.y1+2],[r.x0-2,r.y0-2]];
    ctx.globalAlpha=supplied ? .2+Math.min(100,policy.weight)/100*.6 : .25;
    // A restrained supply-lamp interruption represents an explicitly small allocation.
    // It never changes worker state, and reduced motion keeps illumination steady.
    if(supplied&&policy.weight<=5&&motion) ctx.globalAlpha*=Math.sin(now/900+id.length)>-.7?1:.45;
    line(ctx,corners,supplied?'#6bd5e7':'#52616d',1);
    for(const [x,y] of corners.slice(0,4)) {const p=iso.p(x,y,1);px(ctx,p[0]-1,p[1]-1,supplied?'#b2ebec':'#61747e',3,2);}
  }
  ctx.restore();
}

function line(ctx:Ctx, points:Pt[], color:string, width:number,z=1) {
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();
  points.forEach((p,i)=>{const q=iso.p(...p,z);i?ctx.lineTo(...q):ctx.moveTo(...q);});ctx.stroke();
}
function movingPoint(points:Pt[],progress:number):Pt {
  const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i]![0],p[1]-points[i]![1]));
  let remaining=lengths.reduce((a,b)=>a+b,0)*progress;
  for(let i=0;i<lengths.length;i++) {const n=lengths[i]!;if(remaining<=n){const a=points[i]!,b=points[i+1]!;return iso.p(a[0]+(b[0]-a[0])*remaining/n,a[1]+(b[1]-a[1])*remaining/n,PIPE_ELEVATION);}remaining-=n;}
  return iso.p(...points.at(-1)!,PIPE_ELEVATION);
}

/** Offshore island and distribution corridors. All pipe widths mean policy, not consumption. */
export function drawPowerStation(ctx:Ctx,state:WorkshopState,policies:Record<string,PowerPolicy>,now:number,motion:boolean) {
  ctx.save();
  const running=Object.values(policies).filter(p=>['running','draining'].includes(p.lifecycle)&&p.weight>0&&p.maxConcurrent>0);
  const main:PowerPolicy={lifecycle:running.length?'running':'unknown',weight:Math.min(100,running.reduce((sum,p)=>sum+p.weight,0)),maxConcurrent:running.reduce((sum,p)=>sum+p.maxConcurrent,0)};
  const sourceAvailable=Object.values(state.capacity).some(c=>['available','warning'].includes(reactorState(c,state)));
  // Structural conduit casing and pedestal supports physically carry the supply line.
  const supportKeys=new Set<string>();
  for(const [id,path] of Object.entries(routes)) {
    const downstream=id==='south-trunk'?['uditus','aster-ledger']:Object.keys(policies);
    const children=downstream.map(key=>policies[key]).filter((p):p is PowerPolicy=>!!p&&['running','draining'].includes(p.lifecycle)&&p.weight>0&&p.maxConcurrent>0);
    const trunk:PowerPolicy={lifecycle:children.length?'running':'unknown',weight:Math.min(100,children.reduce((sum,p)=>sum+p.weight,0)),maxConcurrent:children.reduce((sum,p)=>sum+p.maxConcurrent,0)};
    const policy=id==='campus-feed'?main:id==='south-trunk'?trunk:policies[id];const width=pipeWidth(policy)*.6;
    const observed=state.connection==='demo'||state.connection==='connected';
    const supplied=observed&&sourceAvailable&&policy&&policy.weight>0&&policy.maxConcurrent>0&&['running','draining'].includes(policy.lifecycle);
    ctx.save();ctx.globalAlpha=.17;line(ctx,path,'#020911',width+5,0);ctx.restore();
    for(const [x,y] of routeSupports(path)) {
      const key=x+':'+y;if(supportKeys.has(key))continue;supportKeys.add(key);
      const bottom=x<0?-12:0;
      box(ctx,iso,x-2,y-2,x+2,y+2,bottom,bottom+2,{top:'#657480',left:'#354a5d',right:'#263a4e'});
      box(ctx,iso,x-.7,y-.7,x+.7,y+.7,bottom+2,PIPE_ELEVATION-1,{top:'#7296a7',left:'#4a637a',right:'#2f4a61'});
      box(ctx,iso,x-3,y-2,x+3,y+2,PIPE_ELEVATION-2,PIPE_ELEVATION-1,{top:'#688698',left:'#354e65',right:'#294155'});
    }
    line(ctx,path,'#172d3a',width+3,PIPE_ELEVATION);line(ctx,path,'#617c90',width+1,PIPE_ELEVATION);
    line(ctx,path,supplied?'#1d8cb7':'#4b606b',width,PIPE_ELEVATION);
    if(supplied) line(ctx,path,'#71dded',Math.max(1,width*.24),PIPE_ELEVATION);
    const active=supplied&&Object.values(state.workers).some(w=>(id==='campus-feed'||id==='south-trunk'&&downstream.includes(w.businessId)||w.businessId===id)&&displayStatus(state,w).state==='active');
    for(const [x,y] of routeSupports(path,14)) {const p=iso.p(x,y,PIPE_ELEVATION);ctx.strokeStyle='#91a8b5';ctx.lineWidth=.65;ctx.beginPath();ctx.ellipse(...p,width*.6,width*.32,0,0,Math.PI*2);ctx.stroke();}
    if(!id.includes('trunk')&&id!=='campus-feed') {const end=iso.p(...path.at(-1)!,PIPE_ELEVATION),base=iso.p(...path.at(-1)!,1);ctx.strokeStyle='#426781';ctx.lineWidth=width+2;ctx.beginPath();ctx.moveTo(...end);ctx.lineTo(...base);ctx.stroke();ctx.strokeStyle=supplied?'#77d9ed':'#516d80';ctx.lineWidth=1;ctx.stroke();}
    if(active&&motion) {const p=movingPoint(path,(now%3000)/3000);px(ctx,p[0]-2,p[1]-1,'#bdf7f3',4,2);}
  }

  drawCoreArchitecture(ctx,state,now,motion);
  ctx.restore();
}
