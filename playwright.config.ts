import { defineConfig } from '@playwright/test';

// Uses the system Microsoft Edge (always present on Windows 11) so no browser
// binaries need to be downloaded. Set PW_CHANNEL=chrome or chromium elsewhere.
const channel = process.env.PW_CHANNEL ?? 'msedge';

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
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
