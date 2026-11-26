import { defineConfig } from '@playwright/test';
import { UI_PROFILES, UI_VIEWPORT } from './scripts/ui-profiles.mjs';

/** Browser verification of the Vue lane; native Tauri UI profiles remain separate. */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  // Run independent files concurrently within each isolated 30-second profile.
  workers: 2,
  fullyParallel: false,
  outputDir: `test-artifacts/app-ui/${Date.now()}`,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    locale: 'en-US',
    baseURL: 'http://127.0.0.1:4184',
    trace: 'retain-on-failure',
  },
  projects: UI_PROFILES.map((profile) => ({
    name: profile.name,
    use: { viewport: UI_VIEWPORT, deviceScaleFactor: profile.dpr },
  })),
  webServer: {
    command: 'node scripts/serve-static.mjs dist/app --port 4184 --no-open',
    url: 'http://127.0.0.1:4184',
    reuseExistingServer: false,
    timeout: 10_000,
  },
});
