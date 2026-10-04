import { runCandidateE2E } from './city-v2-readiness.mjs';
const result=await runCandidateE2E(process.cwd());
console.log(JSON.stringify(result,null,2));
process.exitCode=result.status==='passed'?0:1;
