import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {treeHash,buildIdentity} from './city-v2-readiness.mjs';

const fixture=()=>{
  const root=mkdtempSync(join(process.env.TMPDIR,'build-provenance-'));
  mkdirSync(join(root,'src'));mkdirSync(join(root,'public'));
  writeFileSync(join(root,'src','fixture.ts'),'source');
  writeFileSync(join(root,'index.html'),'<html>original</html>');
  writeFileSync(join(root,'public','fixture.svg'),'<svg>original</svg>');
  return root;
};
test('source fingerprint covers Vite entry HTML and public assets',()=>{
  const root=fixture();
  try{
    const first=treeHash(root);
    writeFileSync(join(root,'index.html'),'<html>changed</html>');
    assert.notEqual(treeHash(root),first,'root Vite HTML is a build input');
    const second=treeHash(root);
    writeFileSync(join(root,'public','fixture.svg'),'<svg>changed</svg>');
    assert.notEqual(treeHash(root),second,'public assets are build inputs');
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('build identity rejects source modified after its measured build input',()=>{
  const root=fixture();
  try{
    mkdirSync(join(root,'dist'));
    writeFileSync(join(root,'dist','index.html'),'<html>built</html>');
    const sourceHash=treeHash(root),assetHash=treeHash(root,'build');
    writeFileSync(join(root,'dist','build-info.json'),JSON.stringify({version:2,revision:'a'.repeat(40),branch:'fixture',dirty:true,builtAt:1,sourceHash,assetHash}));
    writeFileSync(join(root,'src','fixture.ts'),'changed after build');
    assert.throws(()=>buildIdentity(root),/source.*changed/i);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('standalone stamping cannot invent a missing pre-build input receipt',()=>{
  const root=fixture();
  try{
    mkdirSync(join(root,'dist'));writeFileSync(join(root,'dist','index.html'),'<html>built</html>');
    for(const args of [['init','-q'],['add','.'],['-c','user.name=Fixture','-c','user.email=fixture@localhost','commit','-qm','fixture']]){
      assert.equal(spawnSync('git',args,{cwd:root,encoding:'utf8'}).status,0);
    }
    const result=spawnSync(process.execPath,[fileURLToPath(new URL('./stamp-build.mjs',import.meta.url))],{cwd:root,encoding:'utf8'});
    assert.notEqual(result.status,0,'post-hoc stamp lacks proof that inputs were captured before building');
  }finally{rmSync(root,{recursive:true,force:true});}
});
