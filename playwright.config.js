// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    fullyParallel: true,
    timeout: 30 * 1000,
    expect: { timeout: 5000 },
    use: {
        baseURL: 'http://localhost:8888',
        trace: 'retain-on-failure',
    },
    reporter: [['list'], ['html', { open: 'never' }]],
    projects: [
        { name: 'desktop',  use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
        { name: 'tablet',   use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
        { name: 'mobile',   use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 667 } } },
        { name: 'iphoneSE', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 568 } } },
    ],
});
