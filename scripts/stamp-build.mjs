import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { treeHash } from './city-v2-readiness.mjs';

/** Called only after the build runner captured inputs before compiling. */
export function stampBuild(root,{expectedSourceHash,builtAt=Date.now()}={}) {
  if(!/^[a-f0-9]{64}$/.test(expectedSourceHash??''))throw Error('Measured pre-build input receipt required; use npm run build');
  if(treeHash(root)!==expectedSourceHash)throw Error('Build source identity changed during build');
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  const revision=git(['rev-parse','HEAD']),branch=git(['branch','--show-current']);
  const dirty=!!git(['status','--porcelain','--untracked-files=normal']);
  const stamp={version:2,revision,branch,dirty,builtAt,sourceHash:expectedSourceHash,assetHash:treeHash(root,'assets')};
  writeFileSync(join(root,'dist/build-info.json'),JSON.stringify(stamp));
  return stamp;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  throw Error('Standalone stamping cannot verify build provenance; use npm run build');
}
