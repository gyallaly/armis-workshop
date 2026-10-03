import {test,expect} from 'vitest';
import {UditusSource} from '../server/uditus';
test('authorized explicit Uditus binding uses only GET and preserves unavailable tasks and empty sender health',async()=>{
 const requests:string[]=[];
 const source=new UditusSource({url:'https://project.supabase.co',key:'server-only-key'},async (url,init)=>{
  expect(init?.method).toBe('GET');requests.push(String(url));
  if(String(url).includes('workshop_'))return new Response(JSON.stringify({code:'PGRST205',message:'private error'}),{status:404});
  if(String(url).includes('sender_health'))return new Response('[]',{status:200});
  if(String(url).includes('operations_control'))return new Response('[{"kill_switch":true}]',{status:200});
  return new Response('[]',{status:200,headers:{'content-range':'*/12'}});
 });
 const out=await source.read();
 expect(out.sources.prospects).toMatchObject({state:'connected',count:12});
 expect(out.sources.workshopTasks).toMatchObject({state:'unavailable',gap:'public.workshop_tasks unavailable (PGRST205); apply migration 030 after 029'});
 expect(out.senderHealth).toMatchObject({state:'unknown',records:[]});
 expect(out.killSwitch).toBe(true);expect(requests.some(x=>x.includes('/rpc/'))).toBe(false);
 expect(JSON.stringify(out)).not.toContain('server-only-key');expect(JSON.stringify(out)).not.toContain('private error');
});
