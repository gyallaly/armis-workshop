import {test,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {SetupEvidence} from '../server/evidence';

test('read-only setup evidence exposes recorded review and receipts without prompts or unsafe result content',()=>{
 const dir=mkdtempSync(`${process.env.TMPDIR}/evidence-`),path=dir+'/runtime.db';
 const db=new DatabaseSync(path);
 db.exec('CREATE TABLE workflows(id TEXT, state TEXT, result TEXT); CREATE TABLE calls(id TEXT,workflow TEXT,phase TEXT,role TEXT,model TEXT,started INTEGER,state TEXT,receipt TEXT);');
 db.prepare('INSERT INTO workflows VALUES(?,?,?)').run('setup-one','completed',JSON.stringify({summary:'A source-grounded internal checklist.',evidence:['supplied source'],review:{passed:true,issues:[]},released:false,prompt:'private prompt'}));
 db.prepare('INSERT INTO calls VALUES(?,?,?,?,?,?,?,?)').run('call-one','setup-one','review','armis.auditor','requested',100,'completed',JSON.stringify({actualProvider:'gemini',actualModel:'gemini-observed',tokens:{input:20,output:10,total:30},text:'private reviewer text',prompt:'private prompt',profileName:'auditor'}));
 const reader=new SetupEvidence(path); const out=reader.read();
 db.prepare('INSERT INTO calls VALUES(?,?,?,?,?,?,?,?)').run('failed-call','setup-one','execution','armis.operator','requested',101,'held',JSON.stringify({failure:{reason:'native-request-held',observedHttpStatus:200,finishReason:'MAX_TOKENS',failureCategory:'incomplete-output',generationRequests:1,private:'private diagnostic'}}));
 expect(reader.read().calls[0]?.failure).toMatchObject({reason:'native-request-held',observedHttpStatus:200,finishReason:'MAX_TOKENS',failureCategory:'incomplete-output'});
 expect(JSON.stringify(reader.read())).not.toContain('private');
 expect(out.state).toBe('connected'); expect(out.workflows[0]).toMatchObject({id:'setup-one',state:'completed',reviewPassed:true,released:false,result:'A source-grounded internal checklist.'});
 expect(out.calls[0]).toMatchObject({actualProvider:'gemini',actualModel:'gemini-observed',inputTokens:20,outputTokens:10});
 expect(JSON.stringify(out)).not.toContain('private');
 expect(out.executionHealth).toMatchObject({state:'completed',held:0,completed:1});
 db.prepare('INSERT INTO workflows VALUES(?,?,?)').run('held-one','held',JSON.stringify({summary:'Setup workflow held: native-request-held'}));
 expect(reader.read().executionHealth).toMatchObject({state:'held',held:1});
 expect(reader.read().workflows[0]?.diagnosticGap).toContain('not retained');
 db.prepare('UPDATE workflows SET result=?').run(JSON.stringify({summary:'password=abc123',review:{passed:true,issues:[]}}));
 expect(reader.read().workflows[0]?.result).toBe('Unavailable: unsafe or unsupported result text');
 reader.close();db.close();rmSync(dir,{recursive:true});
});
