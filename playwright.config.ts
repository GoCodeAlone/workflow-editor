import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5174',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npx vite --config e2e/test-app/vite.config.ts --port 5174',
    port: 5174,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
