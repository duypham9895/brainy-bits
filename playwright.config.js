import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:8799', ...devices['Pixel 7'] },
  webServer: {
    command: 'python3 -m http.server 8799 --bind 127.0.0.1',
    url: 'http://127.0.0.1:8799',
    reuseExistingServer: false,
  },
});
