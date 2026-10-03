import { resolve } from 'node:path';
import { createViewerServer } from './index.ts';
const port = Number(process.env.PORT ?? 4173);
if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw Error('Invalid PORT');
const server = createViewerServer({ dist: resolve(process.argv[2] ?? 'dist'), dbPath: process.env.ARMIS_VIEWER_DB || undefined, hermesDbPath: process.env.ARMIS_HERMES_DB || undefined, hermesSessionId: process.env.ARMIS_HERMES_SESSION_ID || undefined, uditusEnvPath: process.env.ARMIS_UDITUS_ENV_PATH || undefined, policyPath:process.env.ARMIS_OWNER_POLICY_PATH, executorUrl:process.env.ARMIS_EXECUTOR_URL, executorToken:process.env.ARMIS_EXECUTOR_TOKEN,gateToken:process.env.ARMIS_GATE_TOKEN, port });
server.once('listening', () => {
  const address = server.address();
  if (address && typeof address !== 'string') console.log(`Workshop viewer and owner policy listening on http://127.0.0.1:${address.port}`);
});
server.once('error', () => { console.error('Viewer listener failed'); process.exitCode = 1; });
for (const signal of ['SIGTERM','SIGINT'] as const) process.on(signal, () => { server.close(() => { process.exitCode = 0; }); });
