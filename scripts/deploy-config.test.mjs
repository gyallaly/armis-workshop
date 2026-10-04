import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import * as deployment from './city-v2-deploy.mjs';
test('new effective or not-yet-reloaded drop-ins invalidate a captured service configuration',()=>{
 const root=mkdtempSync(join(process.env.TMPDIR,'deploy-config-'));
 try {
  const unit=join(root,'viewer.service'),dir=unit+'.d',dropin=join(dir,'zz-city-v2-switch.conf');mkdirSync(dir);writeFileSync(unit,'original',{mode:0o600});
  const config=[{path:unit,mode:statSync(unit).mode&0o777,hash:createHash('sha256').update('original').digest('hex')}],plan={config,dropin};
  assert.equal(typeof deployment.verifyConfiguration,'function');
  deployment.verifyConfiguration(plan,[unit]);
  writeFileSync(dropin,'owned switch',{mode:0o600});deployment.verifyConfiguration(plan,[unit,dropin]);
  assert.throws(()=>deployment.verifyConfiguration(plan,[unit,dropin,join(root,'introduced.conf')]),/changed/);
  writeFileSync(join(dir,'zzz-external.conf'),'[Service]\nEnvironment=UNAPPROVED=1',{mode:0o600});
  assert.throws(()=>deployment.verifyConfiguration(plan,[unit,dropin]),/changed/,'pending files must be caught even before daemon reload');
 }finally{rmSync(root,{recursive:true,force:true});}
});
