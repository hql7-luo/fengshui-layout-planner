import { defineConfig, devices } from '@playwright/test';

const PRODUCTION_MODE = process.env.PLAYWRIGHT_SERVER_MODE === 'production';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  // 只输出不包含本机绝对路径的终端结果；失败证据由 trace / screenshot 保存在已忽略目录。
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3107',
    headless: true,
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: `node node_modules/next/dist/bin/next ${PRODUCTION_MODE ? 'start' : 'dev'} --hostname 127.0.0.1 --port 3107`,
    url: 'http://127.0.0.1:3107',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'desktop-1440x900',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, channel: 'chrome' },
    },
    {
      name: 'tablet-768x1024',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, channel: 'chrome' },
    },
    {
      name: 'mobile-390x844',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, channel: 'chrome' },
    },
  ],
});
