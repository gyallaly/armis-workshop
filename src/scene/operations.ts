import { displayStatus } from '../core/selectors';
import type { Task, WorkshopState } from '../core/types';
import type { Pt } from './campus';
import { type Ctx, glow, px } from './pixel';

export const STATUS_LIGHTS = ['#64c7ce', '#91a6c1', '#d2ac66', '#d77e7e'] as const;

/** Counts agents once, rather than mixing agent and queued-job counts. */
export function buildingSignals(state: WorkshopState, businessId: string) {
  const counts: [number,number,number,number] = [0,0,0,0];
  let unknown = 0;
  for (const worker of Object.values(state.workers)) {
    if (worker.businessId !== businessId) continue;
    const status = displayStatus(state,worker).state;
    if (status === 'active') counts[0]++;
    else if (status === 'idle' || status === 'offline') counts[1]++;
    else if (status === 'waiting_provider' || status === 'waiting_approval') counts[2]++;
    else if (status === 'failed') counts[3]++;
    else unknown++;
  }
  return {counts,unknown};
}

export function drawBuildingSignals(ctx: Ctx, at: Pt, state: WorkshopState, businessId: string) {
  const {counts} = buildingSignals(state,businessId);
  px(ctx,at[0]-13,at[1]-13,'#172532',26,7);
  counts.forEach((count,i) => {
    // Four tiny banks of one lamp per agent, capped at the declared roster size.
    for(let k=0;k<8;k++) px(ctx,at[0]-11+i*6+(k%2)*2,at[1]-12+Math.floor(k/2),k<count?STATUS_LIGHTS[i]!:'#33414b',1,1);
    if(count) glow(ctx,at[0]-10+i*6,at[1]-10,STATUS_LIGHTS[i]!,7,0.18);
  });
}

export function jobVisual(task: Task) {
  const met = task.acceptanceCriteria.filter(c=>c.state==='met').length;
  const progress = task.acceptanceCriteria.length ? met/task.acceptanceCriteria.length : null;
  const issue = task.status === 'failed' || task.status === 'rejected';
  const review = task.stage === 'audit' || task.status === 'waiting_approval' || task.status === 'held';
  return {progress,mark:issue?'!':review?'?':task.status==='ready'?'✓':'',color:issue?'#d77e7e':review?'#d2ac66':task.status==='ready'?'#8fb997':'#64c7ce'};
}

/** Agent-level endpoints only when an assignment/attempt was recorded.
 * Demo additionally simulates delegation along the declared reporting line.
 * Live data never invents an assigning agent from that line.
 */
export function delegationPulses(state: WorkshopState,businessId: string,now:number) {
  if(state.connection !== 'demo' && state.connection !== 'connected') return [];
  return state.timeline.filter(e=>e.type==='task.assigned' && e.businessId===businessId && e.workerId && now>=e.at && now-e.at<1800).slice(-3).flatMap(e=> {
    const to=state.workers[e.workerId!];
    if(!to || displayStatus(state,to).stale) return [];
    const previous=Object.values(state.attempts).filter(a=>a.taskId===e.taskId && a.workerId!==to.id && a.endedAt!==undefined && a.endedAt<=e.at && e.at-a.endedAt<15000).sort((a,b)=>b.startedAt-a.startedAt)[0];
    const from=previous?.workerId ?? (state.connection==='demo'?to.reportsTo:undefined);
    if(!from || !state.workers[from] || state.workers[from]!.businessId!==businessId || displayStatus(state,state.workers[from]!).stale) return [];
    return [{from,to:to.id,progress:(now-e.at)/1800}];
  });
}

export function drawDelegations(ctx:Ctx,state:WorkshopState,businessId:string,now:number,position:(id:string)=>Pt|null,motion:boolean) {
  if(!motion) return;
  for(const pulse of delegationPulses(state,businessId,now)) {
    const a=position(pulse.from),b=position(pulse.to);
    if(!a || !b) continue;
    const y=-14;
    ctx.save();
    ctx.globalAlpha=0.3*Math.sin(Math.PI*pulse.progress);
    ctx.strokeStyle='#aec1bc'; ctx.lineWidth=0.7; ctx.setLineDash([2,5]);
    ctx.beginPath(); ctx.moveTo(a[0],a[1]+y); ctx.lineTo(b[0],b[1]+y); ctx.stroke();
    ctx.globalAlpha=0.8*Math.sin(Math.PI*pulse.progress);
    const x=a[0]+(b[0]-a[0])*pulse.progress,py=a[1]+(b[1]-a[1])*pulse.progress+y;
    px(ctx,x-1,py-1,'#d8c493',3,3);
    ctx.restore();
  }
}
