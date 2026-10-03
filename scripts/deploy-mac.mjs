import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkMacConnection } from './check-mac-connection.mjs';
import { loopbackFetch } from './loopback-fetch.mjs';

// Invoked by the configured Mini updater, never by git pull automatically.
const root=process.cwd(), report={version:2,at:Date.now(),working:false,revision:null,transport:null,capabilities:null,gaps:[]};
const run=(cmd,args)=>execFileSync(cmd,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const save=()=>{mkdirSync('.armis',{recursive:true});writeFileSync('.armis/deployment-readiness.json',JSON.stringify(report,null,2),{mode:0o600});};
let previous=null,backup=null,switched=false;
try {
 if(process.platform!=='linux'&&process.platform!=='darwin')throw Error('Deployment must run on the installed Mini host');
 if(!process.argv.includes('--apply'))throw Error('Updater must explicitly invoke --apply; this script changes the installed build and restarts the viewer');
 if(run('git',['branch','--show-current'])!=='main')throw Error('Installed branch has not been reconciled to main; preserve and review local Mac branch first');
 if(run('git',['status','--porcelain']))throw Error('Installation has local changes; deployment preserves them and refuses replacement');
 previous=run('git',['rev-parse','HEAD']);
 run('git',['fetch','origin','main']);run('git',['merge','--ff-only','origin/main']);switched=true;
 report.revision=run('git',['rev-parse','HEAD']);
 if(existsSync('dist')) {backup=resolve(root,'.armis',`dist-${Date.now()}`);mkdirSync('.armis',{recursive:true});renameSync(resolve(root,'dist'),backup);}
 run('npm',['ci']);run('npm',['run','typecheck']);run('npm',['test']);run('npm',['run','test:runtime']);run('npm',['run','test:deployment']);run('npm',['run','build']);
 if(process.platform==='linux')run('systemctl',['--user','restart','armis-viewer.service']);
 else throw Error('Configured launchd activation is not yet installed; no guessed service command');
 report.transport=await checkMacConnection();
 if(!report.transport.working)throw Error('Restarted viewer transport check failed');
 const base='http://127.0.0.1:4173';
 const page=await loopbackFetch(base+'/',{headers:{'Sec-Fetch-Site':'none','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}});const cookie=page.headers.get('set-cookie')?.split(';')[0];await page.body?.cancel();
 const control=await loopbackFetch(base+'/api/control',{headers:{Cookie:cookie,Origin:base}});if(!control.ok)throw Error('Owner capability endpoint unavailable');const state=await control.json();
 report.capabilities=state.capabilities;report.gaps=state.coverage.uncovered;
 // A deployed viewer is usable even with clearly unavailable, disabled executor controls.
 report.working=true;
} catch(error) {
 report.gaps.push(error.message);
 if(switched&&previous){try{run('git',['checkout',previous]);if(backup&&existsSync(backup)){if(existsSync('dist'))renameSync(resolve(root,'dist'),resolve(root,'.armis',`failed-dist-${Date.now()}`));renameSync(backup,resolve(root,'dist'));}if(process.platform==='linux')run('systemctl',['--user','restart','armis-viewer.service']);report.gaps.push('Previous revision restored as detached checkout; review before resuming updater');}catch{report.gaps.push('Automatic rollback could not complete; retained backups need review');}}
 process.exitCode=1;
} finally {save();console.log(JSON.stringify(report,null,2));}
