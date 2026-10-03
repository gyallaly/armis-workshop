import { defineConfig } from '@playwright/test';

// Supported Chromium by default. Ubuntu host verification uses PW_CHANNEL=chrome.
const channel = process.env.PW_CHANNEL ?? 'chromium';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: channel === 'chromium' ? undefined : channel,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run serve:live',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
