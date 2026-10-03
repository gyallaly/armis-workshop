import {test,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
test('build stamp identifies exact committed revision without runtime configuration',()=>{
 const dir=mkdtempSync(`${process.env.TMPDIR}/stamp-`);
 try{execFileSync(process.execPath,['scripts/stamp-build.mjs',dir]);const value=JSON.parse(readFileSync(dir+'/build-info.json','utf8'));
 expect(value.revision).toBe(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim());
 expect(Object.keys(value).sort()).toEqual(['branch','revision']);
 }finally{rmSync(dir,{recursive:true});}
});
