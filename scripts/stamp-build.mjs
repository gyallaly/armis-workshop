import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const branch=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
const dirty=!!execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim();
writeFileSync('dist/build-info.json',JSON.stringify({revision,branch,dirty,builtAt:Date.now()}));
