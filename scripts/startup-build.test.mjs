import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createViewerServer} from '../server/index.ts';
import {treeHash} from './city-v2-readiness.mjs';
import {loopbackFetch} from './loopback-fetch.mjs';

test('health binds startup source and asset fingerprints instead of revision alone',async()=>{
 const root=mkdtempSync(join(tmpdir(),'startup-build-')),dist=join(root,'dist');
 mkdirSync(dist);mkdirSync(join(root,'server'));
 writeFileSync(join(root,'server','fixture.ts'),'original candidate source');
 writeFileSync(join(dist,'index.html'),'<html>candidate fixture</html>');
 writeFileSync(join(dist,'build-info.json'),JSON.stringify({version:2,revision:'a'.repeat(40),branch:'fixture',dirty:true,builtAt:1,sourceHash:treeHash(root),assetHash:treeHash(root,'assets')}));
 const expectedSource=treeHash(root),expectedBuild=treeHash(root,'build');
 const server=createViewerServer({dist,policyPath:join(root,'policy.json'),chatStorePath:join(root,'chat.json'),port:0});
 await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const page=await loopbackFetch(base+'/',{headers:{'Sec-Fetch-Site':'none','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}});
  const cookie=page.headers.get('set-cookie').split(';')[0];await page.body.cancel();
  writeFileSync(join(root,'server','fixture.ts'),'mutated after startup');
  const health=await(await fetch(base+'/api/health',{headers:{Cookie:cookie}})).json();
  assert.equal(health.build.sourceHash,expectedSource);assert.equal(health.build.buildHash,expectedBuild);
  assert.notEqual(treeHash(root),health.build.sourceHash);
 }finally{await new Promise(resolve=>server.close(resolve));rmSync(root,{recursive:true});}
});

test('startup does not advertise build identity when source differs from built inputs',async()=>{
 const root=mkdtempSync(join(tmpdir(),'stale-build-')),dist=join(root,'dist');
 mkdirSync(dist);mkdirSync(join(root,'server'));
 writeFileSync(join(root,'server','fixture.ts'),'built source');
 writeFileSync(join(dist,'index.html'),'<html>fixture</html>');
 writeFileSync(join(dist,'build-info.json'),JSON.stringify({version:2,revision:'a'.repeat(40),branch:'fixture',dirty:true,builtAt:1,sourceHash:treeHash(root),assetHash:treeHash(root,'assets')}));
 writeFileSync(join(root,'server','fixture.ts'),'not the built source');
 const server=createViewerServer({dist,policyPath:join(root,'policy.json'),chatStorePath:join(root,'chat.json'),port:0});
 await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const page=await loopbackFetch(base+'/',{headers:{'Sec-Fetch-Site':'none','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}});
  const cookie=page.headers.get('set-cookie').split(';')[0];await page.body.cancel();
  const health=await(await fetch(base+'/api/health',{headers:{Cookie:cookie}})).json();
  assert.equal(health.build,null);
 }finally{await new Promise(resolve=>server.close(resolve));rmSync(root,{recursive:true});}
});
