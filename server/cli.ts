import { resolve } from 'node:path';
import { createViewerServer } from './index.ts';
const port = Number(process.env.PORT ?? 4173);
if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw Error('Invalid PORT');
const server = createViewerServer({ dist: resolve(process.argv[2] ?? 'dist'), dbPath: process.env.ARMIS_VIEWER_DB || undefined, hermesDbPath: process.env.ARMIS_HERMES_DB || undefined, hermesSessionId: process.env.ARMIS_HERMES_SESSION_ID || undefined, uditusEnvPath: process.env.ARMIS_UDITUS_ENV_PATH || undefined, currentWorkDbPath: process.env.ARMIS_CURRENT_WORK_DB || undefined, currentWorkChatId: process.env.ARMIS_CURRENT_WORK_CHAT_ID || undefined, currentWorkThreadId: process.env.ARMIS_CURRENT_WORK_THREAD_ID || undefined, armisStatusPath:process.env.ARMIS_DB_STATUS_PATH || undefined, setupPolicyPath:process.env.ARMIS_SETUP_POLICY_PATH || undefined, port });
server.once('listening', () => {
  const address = server.address();
  if (address && typeof address !== 'string') console.log(`Read-only viewer listening on http://127.0.0.1:${address.port}`);
});
server.once('error', () => { console.error('Viewer listener failed'); process.exitCode = 1; });
for (const signal of ['SIGTERM','SIGINT'] as const) process.on(signal, () => { server.close(() => { process.exitCode = 0; }); });
