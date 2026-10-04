import { cpus, totalmem, freemem, loadavg, uptime } from 'node:os';
import { readFileSync, statfsSync } from 'node:fs';
/** Read-only observations. Host counters are not execution attribution or quota. */
export function resourceObservation(diskPath: string, now=Date.now()) {
  const optional=(read:()=>unknown)=>{try{return read();}catch{return null;}};
  const mem=process.platform==='linux'?optional(()=>Object.fromEntries(readFileSync('/proc/meminfo','utf8').split('\n').map(line=>{const m=line.match(/^(\w+):\s+(\d+)/);return m?[m[1],Number(m[2])*1024]:[];}).filter(v=>v.length===2))) as Record<string,number>|null:null;
  const disk=optional(()=>statfsSync(diskPath)) as ReturnType<typeof statfsSync>|null;
  return {version:2,observedAt:now,receivedAt:now,source:process.platform==='linux'?'node:os + Linux procfs':'node:os',provenance:'locally_measured',maxAgeMs:15000,
    machine:{platform:process.platform,cpuCount:cpus().length,cpuTimes:cpus().map(c=>c.times),loadAverage:loadavg(),uptimeSeconds:uptime(),memoryTotalBytes:totalmem(),memoryFreeBytes:freemem(),memoryAvailableBytes:mem?.MemAvailable??null,swapTotalBytes:mem?.SwapTotal??null,swapFreeBytes:mem?.SwapFree??null,diskTotalBytes:disk?Number(disk.blocks)*Number(disk.bsize):null,diskFreeBytes:disk?Number(disk.bavail)*Number(disk.bsize):null,gpu:null,gpuNote:'not reported: no supported GPU collector installed'},
    providerAllowances:[],providerNote:'not reported: no supported entitlement observation bound; subscription and API allowances remain separate',attribution:'Host-wide measurements, not per-company resource usage'};
}
