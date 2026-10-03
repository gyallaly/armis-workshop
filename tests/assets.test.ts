import {test,expect} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {builtAssets} from '../server/assets';
test('built manifest serves only the explicit diagnostics download, never arbitrary text or links',()=>{
 const d=mkdtempSync(join(process.env.TMPDIR!,'workshop-assets-'));
 try{
  writeFileSync(join(d,'index.html'),'public index');
  writeFileSync(join(d,'mac-mini-diagnostics.txt'),'public read-only installation instructions');
  writeFileSync(join(d,'private.txt'),'must not be public');
  writeFileSync(join(d,'.env'),'must not be public');
  mkdirSync(join(d,'assets'));writeFileSync(join(d,'assets','private.txt'),'must not be public');
  const a=builtAssets(d);
  expect(a.get('/mac-mini-diagnostics.txt')).toEqual({body:Buffer.from('public read-only installation instructions'),mime:'text/plain; charset=utf-8'});
  expect([...a.keys()]).toEqual(['/','/index.html','/mac-mini-diagnostics.txt']);
  rmSync(join(d,'mac-mini-diagnostics.txt'));symlinkSync(join(d,'private.txt'),join(d,'mac-mini-diagnostics.txt'));
  expect(()=>builtAssets(d)).toThrow('Invalid built asset');
 }finally{rmSync(d,{recursive:true,force:true});}
});
