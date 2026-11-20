import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PW_PORT || 8799);

export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  use: { baseURL: `http://127.0.0.1:${PORT}`, ...devices['Pixel 7'] },
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
  },
});
