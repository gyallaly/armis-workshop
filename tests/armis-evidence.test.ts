import {test,expect} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {readArmisStatus} from '../server/armis';
test('database evidence shows only exact Armis readback and marks outages stale',()=>{
 const dir=mkdtempSync(process.env.TMPDIR+'/armis-status-'),path=dir+'/status.json';
 try{
 writeFileSync(path,JSON.stringify({state:'connected',projectRef:'lbzyeywrvzixiryzeddx',organizationId:'iamhwxlfdmbjpbbcemfz',observedAt:1000,counts:{identities:10,tasks:20},pending:0,tasks:[],private:'password=private'}));
 expect(readArmisStatus(path,1500)).toMatchObject({state:'connected',counts:{identities:10,tasks:20},pending:0});
 expect(JSON.stringify(readArmisStatus(path,1500))).not.toContain('private');
 expect(readArmisStatus(path,100000).state).toBe('stale');
 writeFileSync(dir+'/health.json',JSON.stringify({state:'held',observedAt:1500}));
 expect(readArmisStatus(path,1600).state).toBe('stale');
 writeFileSync(path,JSON.stringify({state:'connected',projectRef:'sgfgoezfazrweaycdlkq',observedAt:1500}));
 expect(readArmisStatus(path,1600).state).toBe('unavailable');
 }finally{rmSync(dir,{recursive:true});}
});
