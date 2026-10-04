import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {treeHash} from './city-v2-readiness.mjs';
import {stampBuild} from './stamp-build.mjs';

// Bind the output to inputs captured BEFORE either compiler executes.
const root=resolve(process.cwd()),expectedSourceHash=treeHash(root);
execFileSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','-p','tsconfig.json'],{cwd:root,stdio:'inherit',timeout:180000});
execFileSync(process.execPath,[join(root,'node_modules/vite/bin/vite.js'),'build'],{cwd:root,stdio:'inherit',timeout:180000});
stampBuild(root,{expectedSourceHash});
