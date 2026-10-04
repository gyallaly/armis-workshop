import { resolve } from 'node:path';
import { createViewerServer } from './index.ts';
const port = Number(process.env.PORT ?? 4173);
const enrollment={currentWorkEnrollmentPath:process.env.ARMIS_CURRENT_WORK_ENROLLMENT_PATH,currentWorkEnrollmentRoot:process.env.ARMIS_CURRENT_WORK_ENROLLMENT_ROOT};
if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw Error('Invalid PORT');
const server = createViewerServer({ ...enrollment, dist: resolve(process.argv[2] ?? 'dist'), dbPath: process.env.ARMIS_VIEWER_DB || undefined, hermesDbPath: process.env.ARMIS_HERMES_DB || undefined, hermesSessionId: process.env.ARMIS_HERMES_SESSION_ID || undefined, uditusEnvPath: process.env.ARMIS_UDITUS_ENV_PATH || undefined, policyPath:process.env.ARMIS_OWNER_POLICY_PATH, executorUrl:process.env.ARMIS_EXECUTOR_URL, executorToken:process.env.ARMIS_EXECUTOR_TOKEN,gateToken:process.env.ARMIS_GATE_TOKEN,currentWorkDbPath:process.env.ARMIS_CURRENT_WORK_DB,currentWorkScopePath:process.env.ARMIS_CURRENT_WORK_SCOPE_PATH,currentWorkChatId:process.env.ARMIS_CURRENT_WORK_CHAT_ID,currentWorkThreadId:process.env.ARMIS_CURRENT_WORK_THREAD_ID,armisStatusPath:process.env.ARMIS_DB_STATUS_PATH,setupPolicyPath:process.env.ARMIS_SETUP_POLICY_PATH,chatStorePath:process.env.ARMIS_CHAT_STORE_PATH,hermesChatExecutable:process.env.ARMIS_HERMES_CHAT_EXECUTABLE,hermesChatCwd:process.env.ARMIS_HERMES_CHAT_CWD, port });
server.once('listening', () => {
  const address = server.address();
  if (address && typeof address !== 'string') console.log(`Workshop viewer and owner policy listening on http://127.0.0.1:${address.port}`);
});
server.once('error', () => { console.error('Viewer listener failed'); process.exitCode = 1; });
for (const signal of ['SIGTERM','SIGINT'] as const) process.on(signal, () => { server.close(() => { process.exitCode = 0; }); });
