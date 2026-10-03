import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const branch=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
if(!/^[a-f0-9]{40}$/.test(revision)||!/^[-A-Za-z0-9_./]{1,200}$/.test(branch))throw Error('Verified Git build identity required');
writeFileSync(join(process.argv[2]??'dist','build-info.json'),JSON.stringify({revision,branch})+'\n');
