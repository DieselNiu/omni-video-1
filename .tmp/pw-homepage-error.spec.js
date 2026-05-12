const { test } = require('playwright/test');

test('capture homepage errors', async ({ page }) => {
  page.on('console', (msg) => console.log('CONSOLE', msg.type(), msg.text()));
  page.on('pageerror', (err) =>
    console.log('PAGEERROR', err.stack || err.message)
  );
  page.on('requestfailed', (req) =>
    console.log('REQFAIL', req.url(), req.failure()?.errorText)
  );
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  console.log('TITLE', await page.title());
  await page.waitForTimeout(5000);
});
