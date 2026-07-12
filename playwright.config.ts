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
  fullyParallel: false,
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
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } }
  ]
})
