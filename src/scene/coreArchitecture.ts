import { CORE_OFFSET } from './powerLayout';
import { shoreRock } from './coast';
import { Iso, box, glow, shade, text, lcg, type Ctx } from './pixel';
import { reactorQuota, reactorState } from '../core/powerVisuals';
import type { WorkshopState } from '../core/types';
const iso=new Iso(550+CORE_OFFSET[0]-CORE_OFFSET[1],190+(CORE_OFFSET[0]+CORE_OFFSET[1])/2);
const LOCAL_CENTER:[number,number]=[-72,246];

export function coreReactors(state:WorkshopState) {
  const caps=Object.values(state.capacity),count=Math.max(2,caps.length);
  return caps.map((cap,i)=>{
    const a=count<=2?(i===0?2.5:-.3):i*Math.PI*2/count;
    const x=LOCAL_CENTER[0]+Math.cos(a)*30,y=LOCAL_CENTER[1]+Math.sin(a)*30;
    const p=iso.p(x,y,25);
    return {id:cap.id,provider:cap.provider,at:p,hull:[[p[0]-20,p[1]-23],[p[0]+20,p[1]-23],[p[0]+20,p[1]+18],[p[0]-20,p[1]+18]] as [number,number][]};
  });
}

function cylinder(ctx:Ctx,x:number,y:number,r:number,z:number,h:number,color:string) {
  const [sx,sy]=iso.p(x,y,z),rx=r*1.414,ry=r*.707;
  const material=ctx.createLinearGradient(sx-rx,0,sx+rx,0);
  material.addColorStop(0,shade(color,.65));material.addColorStop(.35,shade(color,1.25));material.addColorStop(1,shade(color,.72));
  ctx.fillStyle=material;ctx.beginPath();ctx.ellipse(sx,sy,rx,ry,0,0,Math.PI);ctx.lineTo(sx-rx,sy-h);ctx.ellipse(sx,sy-h,rx,ry,0,Math.PI,Math.PI*2);ctx.closePath();ctx.fill();
  ctx.fillStyle=shade(color,1.06);ctx.beginPath();ctx.ellipse(sx,sy-h,rx,ry,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=shade(color,1.55);ctx.lineWidth=.45;ctx.stroke();
}
function ring(ctx:Ctx,x:number,y:number,r:number,z:number,color:string,width=1) {
  const p=iso.p(x,y,z);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.ellipse(...p,r*1.414,r*.707,0,0,Math.PI*2);ctx.stroke();
}
function rail(ctx:Ctx,r:number) {
  ring(ctx,...LOCAL_CENTER,r,7,'#879cab',.55);
  for(let i=0;i<48;i++) {const a=i*Math.PI/24,x=LOCAL_CENTER[0]+Math.cos(a)*r,y=LOCAL_CENTER[1]+Math.sin(a)*r;const b=iso.p(x,y),t=iso.p(x,y,7);ctx.strokeStyle='#61798c';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(...b);ctx.lineTo(...t);ctx.stroke();}
}
function screen(ctx:Ctx,x:number,y:number,z:number,title:string,subtitle:string,color:string) {
  const p=iso.p(x,y,z);ctx.save();ctx.translate(p[0]-19,p[1]);ctx.fillStyle='#071321';ctx.strokeStyle='#4a6478';ctx.lineWidth=.5;ctx.beginPath();ctx.roundRect(0,0,38,16,2);ctx.fill();ctx.stroke();text(ctx,title,3,2,'#c6d7e8',.65);text(ctx,subtitle,3,9,color,.65);ctx.restore();
}
export function drawCoreArchitecture(ctx:Ctx,state:WorkshopState,now:number,motion:boolean) {
  const coastRandom=lcg(519);
  for(let i=0;i<40;i++) {
    if(coastRandom()<.2)continue;
    const a=(i+coastRandom()*.6)*Math.PI/20,r=74+coastRandom()*8;
    const x=LOCAL_CENTER[0]+Math.cos(a)*r,y=LOCAL_CENTER[1]+Math.sin(a)*r;
    if(x>-35&&y>275&&y<294)continue;
    const size=2+coastRandom()*3;shoreRock(ctx,iso,x,y,size,519+i*43);
    if(coastRandom()<.3)shoreRock(ctx,iso,x-4,y+3,size*.5,830+i);
  }
  // A single concentric plan grounds seawall, deck, rail and equipment.
  cylinder(ctx,...LOCAL_CENTER,70,-7,7,'#263d51');
  // Recessed seawall service lights and panel joints define its physical depth.
  for(let i=0;i<22;i++) {
    const a=i*Math.PI/21,p=iso.p(LOCAL_CENTER[0]+Math.cos(a)*70,LOCAL_CENTER[1]+Math.sin(a)*70,-1);
    ctx.strokeStyle='#536c80';ctx.lineWidth=.4;ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(p[0],p[1]+5);ctx.stroke();
    if(i%2===0){ctx.fillStyle='#ddbe81';ctx.fillRect(p[0]-1,p[1]+2,2,.8);glow(ctx,p[0],p[1]+2,'#f7c883',4,.13);}
  }
  cylinder(ctx,...LOCAL_CENTER,68,0,3,'#354d63');
  cylinder(ctx,...LOCAL_CENTER,60,3,2,'#172b3f');
  for(const r of [47,51,55]) ring(ctx,...LOCAL_CENTER,r,5,'#385369',.35);
  ring(ctx,...LOCAL_CENTER,64,3,'#8eabb7',.7);ring(ctx,...LOCAL_CENTER,58,5,'#3c617c',.8);
  rail(ctx,67);
  for(let i=0;i<40;i++) {
    const a=i*Math.PI/20,p=iso.p(LOCAL_CENTER[0]+Math.cos(a)*65,LOCAL_CENTER[1]+Math.sin(a)*65,7);
    glow(ctx,p[0],p[1],'#f2d19b',3,.3);ctx.fillStyle='#ffe1b0';ctx.beginPath();ctx.arc(...p,.65,0,Math.PI*2);ctx.fill();
  }
  // Internal conduits and service equipment are architectural, not job animation.
  for(const [x,y] of [[-96,263],[-43,238]] as [number,number][]) {
    const start=iso.p(x,y,6),end=iso.p(-51,284,6);ctx.strokeStyle='#20344a';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(...start);ctx.lineTo(...end);ctx.stroke();ctx.strokeStyle='#417491';ctx.lineWidth=1;ctx.stroke();
  }
  // Rear command hall, supported roof and glazed operating level.
  cylinder(ctx,-101,216,19,5,22,'#304960');
  for(let i=0;i<15;i++) {const a=i*Math.PI/14,p=iso.p(-101+Math.cos(a)*18,216+Math.sin(a)*18,10);ctx.fillStyle=i%3?'#ddba78':'#58b8db';ctx.fillRect(p[0]-.5,p[1]-10,1,9);}
  cylinder(ctx,-101,216,20,27,2,'#526879');ring(ctx,-101,216,16,29,'#8da7b7');
  screen(ctx,-101,216,29,'ARMIS','COMMAND','#91dcec');
  box(ctx,iso,-70,208,-56,220,5,12,{top:'#536777',left:'#304657',right:'#243b4e',rim:'#7d97a6'});
  const caps=Object.values(state.capacity);
  const count=Math.max(2,caps.length);
  // Provider geometry grows from actual account scopes; unknown bays stay neutral.
  for(let i=0;i<count;i++) {
    const angle=count<=2 ? (i===0 ? 2.5 : -.3) : i*Math.PI*2/count;
    const x=LOCAL_CENTER[0]+Math.cos(angle)*30,y=LOCAL_CENTER[1]+Math.sin(angle)*30;
    const cap=caps[i],status=cap?reactorState(cap,state):'unknown',quota=cap?reactorQuota(cap,state):null;
    const color=quota!==null&&quota>0&&quota<=.1?'#ef7277':{available:'#54dce9',warning:'#edb967',fault:'#ed7279',unknown:'#758ca1'}[status];
    cylinder(ctx,x,y,17,5,4,'#40576e');ring(ctx,x,y,16,10,'#779eb5',.8);
    cylinder(ctx,x,y,12,9,32,'#20354e');
    for(let level=0;level<6;level++) {
      const lit=quota!==null&&level/6<quota;
      ring(ctx,x,y,12.1,13+level*4,lit?color:'#40556b',1.7);
    }
    // Structural ribs stay vertical and separate from quota fill.
    for(const a of [.4,1.6,2.8,4]) {const p=iso.p(x+Math.cos(a)*12,y+Math.sin(a)*12,10);ctx.strokeStyle='#7892a5';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(p[0],p[1]-30);ctx.stroke();}
    cylinder(ctx,x,y,13,41,3,'#435c74');ring(ctx,x,y,9,44,color,1.2);
    if(status==='warning'||status==='fault') {const p=iso.p(x,y,48);glow(ctx,...p,color,7,motion?.3+.15*Math.sin(now/350):.3);ctx.fillStyle=color;ctx.beginPath();ctx.arc(...p,1.4,0,Math.PI*2);ctx.fill();}
    const name=cap?cap.provider.toUpperCase().slice(0,12):'UNOBSERVED';
    screen(ctx,x,y+15,22,name,quota===null?'UNKNOWN':Math.round(quota*100)+'% LEFT',color);
  }
  // The front nexus distributes supply; it does not invent another provider.
  cylinder(ctx,-51,284,15,5,15,'#2c4865');
  for(const z of [7,13,19]) ring(ctx,-51,284,15,z,'#397ca0',.8);
  cylinder(ctx,-51,284,16,20,3,'#52758b');ring(ctx,-51,284,11,23,'#82d3e7',1);
  screen(ctx,-51,299,15,'THE CORE','DISTRIBUTION','#9dd5ec');

}
