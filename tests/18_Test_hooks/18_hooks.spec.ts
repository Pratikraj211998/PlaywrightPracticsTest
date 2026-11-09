import { test, expect } from '@playwright/test';

// ==== BASIC 1: beforeEach and afterEach ====
// > `beforeEach` runs before EVERY test in the group, `afterEach` runs after every test (even when the test fails). Each test still gets its own page.
test.describe('basic hooks', () => {
  const log: string[] = [];
  test.describe.configure({ mode: 'serial' });          // run in order so the log is predictable

  test.beforeEach(async () => { log.push('beforeEach'); });
  test.afterEach(async () => { log.push('afterEach'); });

  test('test 1', async () => { log.push('test 1'); });
  test('test 2', async () => {
    log.push('test 2');
    expect(log).toEqual(['beforeEach', 'test 1', 'afterEach', 'beforeEach', 'test 2']);
  });
});

// ==== BASIC 2: beforeAll and afterAll ====
// > These run ONCE for the group: `beforeAll` before the first test, `afterAll` after the last. In Playwright "once" means once per WORKER process.
test.describe('beforeAll and afterAll', () => {
  const log: string[] = [];
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => { log.push('beforeAll'); });
  test.afterAll(async () => { log.push('afterAll'); });
  test.beforeEach(async () => { log.push('beforeEach'); });

  test('first', async () => { expect(log).toEqual(['beforeAll', 'beforeEach']); });
  test('second', async () => { expect(log).toEqual(['beforeAll', 'beforeEach', 'beforeEach']); });
});

// ==== BASIC 3: Use fixtures in beforeEach ====
// > `beforeEach` receives the same fixtures as a test: `page`, `request`, and so on. A typical use is opening the page and resetting data.
test.describe('beforeEach with fixtures', () => {
  test.beforeEach(async ({ page, request }) => {
    await request.post('/api/reset');
    await page.goto('/shop.html');
  });
  test('the shop is open and data is fresh', async ({ page }) => {
    await expect(page.locator('.product')).toHaveCount(3);
  });
  test('the same setup ran for this test too', async ({ page }) => {
    await expect(page).toHaveURL(/shop\.html/);
  });
});

// ==== INTERMEDIATE 1: Nested describes: the order of hooks ====
// > Outer hooks run first on the way IN, and last on the way OUT. Think of nested boxes.
test.describe('outer', () => {
  const log: string[] = [];
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(async () => { log.push('outer before'); });
  test.afterEach(async () => { log.push('outer after'); });

  test.describe('inner', () => {
    test.beforeEach(async () => { log.push('inner before'); });
    test.afterEach(async () => { log.push('inner after'); });
    test('check the order', async () => { log.push('test'); });
  });

  test.afterAll(async () => {
    expect(log).toEqual(['outer before', 'inner before', 'test', 'inner after', 'outer after']);
  });
});

// ==== INTERMEDIATE 2: testInfo inside hooks ====
// > Hooks get `testInfo` as a second argument: the title, the status after the test, the duration and a way to attach files. Great for "screenshot after every test".
test.describe('testInfo in hooks', () => {
  test.afterEach(async ({ page }, testInfo) => {
    expect(['passed', 'failed', 'timedOut', 'skipped', 'interrupted']).toContain(testInfo.status);
    await testInfo.attach('final page', { body: await page.screenshot(), contentType: 'image/png' });
    expect(testInfo.attachments.some((a) => a.name === 'final page')).toBe(true);
  });
  test('this test gets a screenshot attached by the hook', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Practice Home');
  });
});

// ==== INTERMEDIATE 3: Clean up data created by the tests ====
// > Remember what each test created and delete it in `afterEach` or `afterAll`. The hook runs even if the test fails.
test.describe('cleanup', () => {
  let created: number[] = [];
  test.afterEach(async ({ request }) => {
    for (const id of created) await request.delete(`/api/products/${id}`);
    created = [];
  });
  test('creates a product', async ({ request }) => {
    const r = await request.post('/api/products', { data: { name: 'Temp', price: 1 } });
    created.push((await r.json()).id);
    expect((await request.get('/api/products')).status()).toBe(200);
  });
  test('the temp product is gone in the next test', async ({ request }) => {
    const all = await (await request.get('/api/products')).json();
    expect(all.some((p: { name: string }) => p.name === 'Temp')).toBe(false);
  });
});

// ==== INTERMEDIATE 4: Skip from a hook ====
// > `test.skip(condition, reason)` inside a hook skips the test when the condition is true. Good for environment checks.
test.describe('skip from beforeEach', () => {
  test.beforeEach(async ({ browserName }) => {
    test.skip(browserName !== 'chromium', 'This group only runs on Chromium');
  });
  test('runs on chromium', async ({ browserName }) => { expect(browserName).toBe('chromium'); });
});

// ==== INTERMEDIATE 5: Log in by API in beforeEach ====
// > Faster than typing into the login form every time. Call the API, store the token in the page, then open the page you want.
test.describe('login by API before each test', () => {
  test.beforeEach(async ({ page, request }) => {
    const login = await request.post('/api/login', { data: { email: 'asha@example.com', password: 'secret' } });
    const { token } = await login.json();
    await page.addInitScript((t) => localStorage.setItem('token', t), token);
    await page.goto('/dashboard.html');
  });
  test('already logged in', async ({ page }) => {
    await expect(page.locator('#status')).toHaveText('Welcome back, asha');
  });
});

// ==== HARD 1: Share ONE page across serial tests with beforeAll ====
// > `beforeAll` cannot use the `page` fixture (it belongs to one test). Create your own page from the `browser` fixture, share it in a serial group, and close it in `afterAll`. Use this pattern rarely: shared state makes tests depend on each other.
test.describe('shared page in a serial flow', () => {
  test.describe.configure({ mode: 'serial' });
  let page: import('@playwright/test').Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ baseURL: 'http://localhost:3000' });
    await page.goto('/shop.html');
  });
  test.afterAll(async () => { await page.close(); });

  test('step 1: log in', async () => {
    await page.getByLabel('Email').fill('asha@example.com');
    await page.getByLabel('Password').fill('secret');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('Welcome');
  });
  test('step 2: the same page is still logged in', async () => {
    await expect(page.getByRole('alert')).toContainText('Welcome');
    await page.locator('.product').first().getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByRole('link', { name: /^Cart/ })).toHaveText('Cart (1)');
  });
});

// ==== HARD 2: Hooks and retries ====
// > When a test fails and is retried, Playwright starts a NEW worker, so `beforeAll` runs again and your variables are reset. `testInfo.retry` tells which attempt this is. (This example fails on purpose once, so the run shows one "flaky" test.)
test.describe('retries rerun the hooks', () => {
  test.describe.configure({ retries: 1 });
  test.beforeAll(async () => { /* runs again on the retry because a new worker starts */ });
  test('fails on the first attempt, passes on the retry', async ({}, testInfo) => {
    if (testInfo.retry === 0) throw new Error('first attempt fails on purpose');
    expect(testInfo.retry).toBe(1);
  });
});

// ==== HARD 3: Hook timeouts ====
// > Hooks have their own time limit, by default the test timeout. Raise it for one slow hook with `test.setTimeout` or `testInfo.setTimeout`.
test.describe('slow hook', () => {
  test.beforeEach(async ({}, testInfo) => {
    testInfo.setTimeout(testInfo.timeout + 5_000);       // add 5 seconds for this test
    await new Promise((r) => setTimeout(r, 300));
  });
  test('the extra time was added', async ({}, testInfo) => {
    expect(testInfo.timeout).toBe(35_000);
  });
});

// ==== HARD 4: An automatic fixture instead of a hook ====
// > `{ auto: true }` fixtures run for every test, like `beforeEach` + `afterEach`, but they are reusable across files and keep setup and cleanup in one place. Many teams prefer them to hooks.
const autoTest = test.extend<{ cleanData: void }>({
  cleanData: [async ({ request }, use) => {
    await request.post('/api/reset');       // setup
    await use();
    await request.post('/api/reset');       // teardown
  }, { auto: true }],
});
autoTest('auto fixture works like a hook', async ({ page }) => {
  await page.goto('/shop.html');
  await expect(page.locator('.product')).toHaveCount(3);
});

// ==== HARD 5: Hooks run in file order, not by the order you wrote them in the description ====
// > Hooks of the same kind run in the order they were DECLARED. Two `beforeEach` in one describe both run, first one first.
test.describe('two hooks of the same kind', () => {
  const log: string[] = [];
  test.beforeEach(async () => { log.push('A'); });
  test.beforeEach(async () => { log.push('B'); });
  test('A runs before B', async () => { expect(log).toEqual(['A', 'B']); });
});
