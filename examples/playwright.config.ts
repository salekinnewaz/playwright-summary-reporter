import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'sample.spec.ts',
  fullyParallel: true,
  reporter: [
    ['list'],
    ['../dist/index.js', { outputFile: 'examples/test-summary.md', title: 'Example Playwright Run' }],
  ],
  use: {
    browserName: 'chromium',
  },
});
