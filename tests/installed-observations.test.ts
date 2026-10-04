import { test, expect } from 'vitest';
import { createViewerServer } from '../server/index';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { loopbackFetch } from '../scripts/loopback-fetch.mjs';
test('installed resources require cookie auth and return measured Linux resources without fake GPU or quotas',async()=>{
 const dist=mkdtempSync(join(tmpdir(),'city-resources-'));writeFileSync(join(dist,'index.html'),'<html></html>');
 const server=createViewerServer({dist,policyPath:join(dist,'policy.json')});await once(server,'listening');
 const base=`http://127.0.0.1:${(server.address() as any).port}`;
 try{
  const blocked=await loopbackFetch(base+'/api/resources');expect(blocked.status).toBe(401);
  const page=await loopbackFetch(base+'/',{headers:{'Sec-Fetch-Site':'none','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}});
  const cookie=page.headers.get('set-cookie')!.split(';')[0];await page.body?.cancel();
  const response=await loopbackFetch(base+'/api/resources',{headers:{Cookie:cookie}});expect(response.status).toBe(200);
  const data=await response.json();expect(data.source).toBe('node:os + Linux procfs');expect(data.machine.memoryTotalBytes).toBeGreaterThan(0);expect(data.machine.gpu).toBeNull();expect(data.machine.diskFreeBytes).toBeGreaterThan(0);expect(data.observedAt).toBeGreaterThan(Date.now()-10000);expect(data.providerAllowances).toEqual([]);
  const evidence=await (await loopbackFetch(base+'/api/evidence',{headers:{Cookie:cookie}})).json();expect(evidence.reports).toHaveLength(23);expect(evidence.reports.find((r:any)=>r.id==='machine').status).toBe('ok');
  const work=await (await loopbackFetch(base+'/api/current-work',{headers:{Cookie:cookie}})).json();expect(work.state).toBe('unavailable');
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
