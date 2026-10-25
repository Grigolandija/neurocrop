import { defineConfig, devices } from '@playwright/test'

const httpCredentials = process.env.E2E_HTTP_USERNAME
  ? {
      username: process.env.E2E_HTTP_USERNAME,
      password: process.env.E2E_HTTP_PASSWORD || ''
    }
  : undefined

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_FRONTEND_URL || 'http://127.0.0.1:4173',
    httpCredentials,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'desktop-chromium',
      testIgnore: /(?:mobile|living-greenhouse|node-height)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'graphics-chromium',
      testMatch: /(?:living-greenhouse|node-height)\.spec\.ts/,
      // Software Vulkan shares the runner's CPU. Finish ordinary UI tests first
      // and keep only one graphics browser active, including during retries.
      dependencies: ['desktop-chromium', 'mobile-chromium'],
      workers: 1,
      timeout: process.platform === 'linux' ? 60_000 : 30_000,
      use: { ...devices['Desktop Chrome'] },
    },
  ]
})
