import {it,expect} from 'vitest';
import {UditusSource,bindUditus} from '../server/uditus';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
it('rejects unexpected project bindings before any request',()=>{
 expect(()=>new UditusSource({url:'https://unrelated.supabase.co',key:'fixture'})).toThrow('Unexpected Uditus project');
});
it('reads only configuration metadata and classifies access errors without making model calls',async()=>{
 const dir=mkdtempSync(`${process.env.TMPDIR}/uditus-binding-`);
 writeFileSync(dir+'/.env','NEXT_PUBLIC_SUPABASE_URL=https://sgfgoezfazrweaycdlkq.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=fixture\nUDITUS_KILL_SWITCH=true\nUDITUS_OUTBOUND_ENABLED=false\n');
 writeFileSync(dir+'/workshop.models.json',JSON.stringify([{provider:'gemini',model:'configured-only',verifiedAt:'2026-10-02T04:08:02Z',credential:'private'}]));
 const source=bindUditus(dir+'/.env');expect(source.configuration).toMatchObject({environmentKillSwitch:true,outboundDisabled:true,modelRegistryState:'configured',models:[{model:'configured-only'}]});expect(JSON.stringify(source.configuration)).not.toContain('private');
 let requests=0;
 const denied=new UditusSource({url:'https://sgfgoezfazrweaycdlkq.supabase.co',key:'fixture'},async(_url,init)=>{requests++;expect(init?.method).toBe('GET');return new Response(JSON.stringify({code:'42501',message:'private error'}),{status:403});});
 const [one,two]=await Promise.all([denied.read(),denied.read()]);expect(one).toEqual(two);expect(requests).toBe(Object.keys(one.sources).length);expect(one.sources.workshopTasks).toMatchObject({state:'missing_access'});expect(JSON.stringify(one)).not.toContain('private');rmSync(dir,{recursive:true});
});
