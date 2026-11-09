import { test, expect } from '@playwright/test';

// ==== BASIC 1: Navigation timing from the browser ====
// > The browser records how long a page took to load. Read it with `performance.getEntriesByType('navigation')`. Assert against a budget, and print the numbers to understand your baseline.
test('navigation timing budget', async ({ page }) => {
  await page.goto('/shop.html', { waitUntil: 'load' });
  const timing = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return { ttfb: n.responseStart - n.requestStart, domContentLoaded: n.domContentLoadedEventEnd, load: n.loadEventEnd };
  });
  expect(timing.ttfb).toBeLessThan(500);
  expect(timing.domContentLoaded).toBeLessThan(3000);
  expect(timing.load).toBeLessThan(5000);
});

// ==== BASIC 2: Resource timing: what was downloaded ====
// > `resource` entries list every file and API call with sizes and durations. Use them to find slow or huge requests.
test('resource timing', async ({ page }) => {
  await page.goto('/shop.html');
  await expect(page.locator('.product')).toHaveCount(3);
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => ({ name: new URL(r.name).pathname, duration: r.duration })));
  const api = resources.find((r) => r.name === '/api/products');
  expect(api).toBeDefined();
  expect(api!.duration).toBeLessThan(1000);
  expect(resources.every((r) => r.duration < 3000)).toBe(true);
});

// ==== BASIC 3: Web Vitals: LCP and CLS ====
// > Largest Contentful Paint (LCP) says when the main content appeared. Cumulative Layout Shift (CLS) measures how much the page jumped. Observe them inside the page with `PerformanceObserver`.
test('LCP and CLS', async ({ page }) => {
  await page.goto('/shop.html');
  await expect(page.locator('.product')).toHaveCount(3);
  const vitals = await page.evaluate(() => new Promise<{ lcp: number; cls: number }>((resolve) => {
    let lcp = 0; let cls = 0;
    new PerformanceObserver((list) => { for (const e of list.getEntries()) lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => { for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    setTimeout(() => resolve({ lcp, cls }), 500);
  }));
  expect(vitals.lcp).toBeGreaterThan(0);
  expect(vitals.lcp).toBeLessThan(2500);          // Google's "good" limit for LCP
  expect(vitals.cls).toBeLessThan(0.25);          // "needs improvement" starts above 0.1, "poor" above 0.25
});

// ==== INTERMEDIATE 1: A Chrome DevTools Protocol (CDP) session ====
// > CDP is the low-level protocol of Chromium. `context.newCDPSession(page)` lets you send any command. This only works in Chromium. Example: read engine metrics.
test('CDP metrics', async ({ page, context }) => {
  await page.goto('/shop.html');
  const client = await context.newCDPSession(page);
  await client.send('Performance.enable');
  const { metrics } = await client.send('Performance.getMetrics');
  const byName = Object.fromEntries(metrics.map((m) => [m.name, m.value]));
  expect(byName.Nodes).toBeGreaterThan(20);
  expect(byName.JSHeapUsedSize).toBeGreaterThan(100_000);
  await client.detach();
});

// ==== INTERMEDIATE 2: Throttle the network ====
// > Test how the page behaves on a slow connection. CDP's `Network.emulateNetworkConditions` adds latency and limits speed. Measure a call before and after.
test('slow network via CDP', async ({ page, context }) => {
  await page.goto('/');
  const timeCall = () => page.evaluate(async () => { const t = performance.now(); await (await fetch('/api/products')).json(); return performance.now() - t; });
  const fast = await timeCall();

  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', { offline: false, latency: 600, downloadThroughput: 50 * 1024, uploadThroughput: 50 * 1024 });
  const slow = await timeCall();
  expect(slow).toBeGreaterThan(550);
  expect(slow).toBeGreaterThan(fast * 3);
  await client.detach();
});

// ==== INTERMEDIATE 3: Throttle the CPU ====
// > `Emulation.setCPUThrottlingRate` makes the processor up to N times slower, like a cheap phone. The same JavaScript work now takes clearly longer (the exact ratio varies, so assert a generous difference).
test('slow CPU via CDP', async ({ page, context }) => {
  await page.goto('/');
  const work = () => page.evaluate(() => { const t = performance.now(); let x = 0; for (let i = 0; i < 8_000_000; i++) x += Math.sqrt(i); return performance.now() - t; });
  const normal = await work();
  const client = await context.newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 12 });
  const throttled = await work();
  expect(throttled).toBeGreaterThan(normal * 2);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await client.detach();
});

// ==== INTERMEDIATE 4: Offline and the effect on the UI ====
// > Network conditions can also set `offline: true` for one page only (the context-wide switch is `context.setOffline`).
test('offline through CDP', async ({ page, context }) => {
  await page.goto('/extras.html');
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await page.getByRole('button', { name: 'Ping' }).click();
  await expect(page.locator('#ping-result')).toHaveText('Offline');
});

// ==== HARD 1: JavaScript code coverage ====
// > Chromium can tell which JavaScript was used. Start coverage, use the page, stop it. A list with unused code shows what to delete or lazy-load.
test('JS coverage of an inline script', async ({ page }) => {
  await page.coverage.startJSCoverage();
  await page.goto('/shop.html');
  await expect(page.locator('.product')).toHaveCount(3);
  const entries = await page.coverage.stopJSCoverage();
  const shop = entries.find((e) => e.url.endsWith('/shop.html'));
  expect(shop).toBeDefined();
  const usedFunctions = shop!.functions.filter((f) => f.ranges.some((r) => r.count > 0)).length;
  expect(usedFunctions).toBeGreaterThan(0);
});

// ==== HARD 2: A Chromium performance trace ====
// > `browser.startTracing` writes a trace you can open in Chrome's `chrome://tracing` or the Performance panel. This is different from the Playwright trace. Chromium only.
test('browser tracing', async ({ page, browser }, testInfo) => {
  const file = testInfo.outputPath('chrome-trace.json');
  await browser.startTracing(page, { path: file, screenshots: false });
  await page.goto('/shop.html');
  await expect(page.locator('.product')).toHaveCount(3);
  await browser.stopTracing();
  expect(require('fs').statSync(file).size).toBeGreaterThan(1000);
});

// ==== HARD 3: A performance regression guard ====
// > Wrap measurements in a helper and compare with a budget that comes from the environment, so CI can be stricter than a laptop. (For full audits with scores, run Lighthouse separately; for load testing, use k6 or JMeter.)
test('budget from an environment variable', async ({ page }) => {
  const budgetMs = Number(process.env.LOAD_BUDGET_MS ?? 5000);
  const started = Date.now();
  await page.goto('/shop.html');
  await expect(page.locator('.product')).toHaveCount(3);
  expect(Date.now() - started, `page must be ready within ${budgetMs} ms`).toBeLessThan(budgetMs);
});
