import { test, expect } from '@playwright/test';

// ==== BASIC 1: One timeout per action ====
// > Every action accepts `{ timeout }`. By default an action has NO limit of its own and is limited only by the test timeout, so set one when you want a quick, clear failure.
test('action timeout in one call', async ({ page }) => {
  await page.goto('/shop.html');
  const started = Date.now();
  await expect(page.locator('#does-not-exist').click({ timeout: 300 })).rejects.toThrow(/Timeout 300ms exceeded/);
  expect(Date.now() - started).toBeLessThan(2000);
});

// ==== BASIC 2: One timeout per assertion ====
// > Assertions wait 5 seconds by default. A shorter limit is good for "must be there NOW" checks, a longer one for slow features.
test('expect timeout', async ({ page }) => {
  await page.goto('/shop.html');
  await expect(expect(page.locator('#does-not-exist')).toBeVisible({ timeout: 300 })).rejects.toThrow(/with timeout 300ms/);
  await expect(page.locator('.product')).toHaveCount(3, { timeout: 10_000 });      // slow feature: more time
});

// ==== BASIC 3: Defaults for a whole page ====
// > `page.setDefaultTimeout` changes the limit of actions and waits on that page; `setDefaultNavigationTimeout` changes navigations such as `goto`. (A per-call `{ timeout }` still wins.)
test('page defaults', async ({ page }) => {
  page.setDefaultTimeout(250);
  await expect(page.locator('#nope').click()).rejects.toThrow(/Timeout 250ms exceeded/);
  page.setDefaultNavigationTimeout(300);
  await expect(page.goto('/api/slow')).rejects.toThrow(/Timeout 300ms exceeded/);
});

// ==== INTERMEDIATE 1: The test timeout and test.slow ====
// > A test has 30 seconds by default (config `timeout`). `test.slow()` multiplies it by 3. `test.setTimeout(ms)` sets an exact value, `testInfo.setTimeout` does the same from a hook or fixture. The current value is `testInfo.timeout`.
test('test timeout values', async ({}, testInfo) => {
  expect(testInfo.timeout).toBe(30_000);
  test.slow();
  expect(testInfo.timeout).toBe(90_000);
  test.setTimeout(12_000);
  expect(testInfo.timeout).toBe(12_000);
});

// ==== INTERMEDIATE 2: What a test timeout looks like ====
// > When the WHOLE test runs out of time, Playwright stops it and reports `Test timeout of 30000ms exceeded.` together with the line where it was waiting, for example `page.waitForFunction: Test timeout of 1200ms exceeded.` A timed-out test is a real failure: `test.fail()` cannot turn it into a pass. That is why this example only shows the safe way to see the value that would apply.
test('how much time is left', async ({}, testInfo) => {
  test.setTimeout(1200);
  expect(testInfo.timeout).toBe(1200);
  expect(testInfo.duration).toBeLessThan(testInfo.timeout);          // time used so far versus time allowed
});

// ==== INTERMEDIATE 3: expect.poll and toPass have their own timeouts ====
// > These retrying helpers stop after their `timeout` and report the last value they saw.
test('poll and toPass timeouts', async () => {
  const started = Date.now();
  await expect(expect.poll(() => 1, { timeout: 400 }).toBe(2)).rejects.toThrow(/Timeout 400ms exceeded/);
  await expect(expect(async () => { expect(1).toBe(2); }).toPass({ timeout: 400 })).rejects.toThrow();
  expect(Date.now() - started).toBeLessThan(3000);
});

// ==== INTERMEDIATE 4: Navigation waits: waitUntil ====
// > `goto` can return at four moments: `commit` (the response started), `domcontentloaded`, `load` (default) or `networkidle` (no requests for 500 ms, discouraged). Pick the earliest one that is enough and then wait for a specific element.
test('waitUntil options', async ({ page }) => {
  for (const waitUntil of ['commit', 'domcontentloaded', 'load'] as const) {
    await page.goto('/shop.html', { waitUntil });
    await expect(page.locator('.product')).toHaveCount(3);
  }
});

// ==== HARD 1: Timeouts for hooks and fixtures ====
// > A hook shares the test's time. A fixture can have its own limit with `{ timeout }`, so slow setup does not eat the test time. (See Topics 18 and 21.)
const slowFixture = test.extend<{ slow: string }>({
  slow: [async ({}, use) => { await new Promise((r) => setTimeout(r, 300)); await use('ready'); }, { timeout: 10_000 }],
});
slowFixture('fixture with its own timeout', async ({ slow }) => { expect(slow).toBe('ready'); });

// ==== HARD 2: A timeout budget table ====
// > Putting all limits side by side avoids confusion.
test('the timeouts of this project', async ({}, testInfo) => {
  const limits = {
    test: testInfo.timeout,                                  // config: timeout (30 s)
    expect: 5_000,                                           // config: expect.timeout (5 s)
    action: 0,                                               // config: use.actionTimeout (0 = none)
    navigation: 0,                                           // config: use.navigationTimeout (0 = none)
  };
  expect(limits).toEqual({ test: 30_000, expect: 5_000, action: 0, navigation: 0 });
});
