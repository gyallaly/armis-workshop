import { defineConfig } from '@playwright/test';

// Supported Chromium by default. Ubuntu host verification uses PW_CHANNEL=chrome.
const channel = process.env.PW_CHANNEL ?? 'chromium';
// Never reuse the user's live service or inherit its private source bindings.
// These empty-source browser assertions require a fresh, isolated server.
const port = 4183;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: channel === 'chromium' ? undefined : channel,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run serve:live',
    url: `http://127.0.0.1:${port}`,
    env: { PORT: String(port), ARMIS_VIEWER_DB: '', ARMIS_HERMES_DB: '', ARMIS_HERMES_SESSION_ID: '' },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
