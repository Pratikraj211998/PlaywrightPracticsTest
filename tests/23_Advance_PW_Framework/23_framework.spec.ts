import { expect as baseExpect } from '@playwright/test';
import { test } from './framework/fixtures';
import { expect } from './framework/matchers';
import { loadEnv } from './framework/env';
import { Logger } from './framework/logger';
import { retry } from './framework/retry';
import { newEmail, newProduct } from './framework/factories';

// ==== BASIC 1: A typed environment loader ====
// > One function reads the settings and checks them. A missing or unknown value fails FAST with a clear message, instead of a mysterious error in the middle of a test. Tests never read `process.env` directly. (This test uses no browser, so it is very quick.)
test('environment loader', async () => {
  expect(loadEnv({})).toMatchObject({ name: 'local', baseURL: 'http://localhost:3000', password: 'secret', isCI: false });
  expect(loadEnv({ TEST_ENV: 'staging', PASSWORD: 'x', CI: 'true' })).toMatchObject({ name: 'staging', isCI: true, userEmail: 'qa.user@example.com' });
  expect(() => loadEnv({ TEST_ENV: 'nowhere' })).toThrow('Unknown TEST_ENV "nowhere"');
  expect(() => loadEnv({ TEST_ENV: 'staging' })).toThrow('PASSWORD is required');
  expect(loadEnv({ BASE_URL: 'http://other:8080' }).baseURL).toBe('http://other:8080');     // real variables win
});

// ==== BASIC 2: A leveled logger ====
// > Log levels let you print details locally (`debug`) and only warnings in CI. The output function is a parameter, so the logger can be tested.
test('logger levels', async () => {
  const lines: string[] = [];
  const log = new Logger('checkout', 'warn', (l) => lines.push(l));
  log.debug('hidden');
  log.info('hidden too');
  log.warn('slow response');
  log.error('payment failed');
  expect(lines).toEqual(['[WARN] [checkout] slow response', '[ERROR] [checkout] payment failed']);
});

// ==== BASIC 3: Unique test data ====
// > Factories give new values on every call, so two tests running at the same time cannot collide.
test('factories return unique data', async () => {
  const names = new Set(Array.from({ length: 50 }, () => newProduct().name));
  expect(names.size).toBe(50);
  expect(newEmail('qa')).toMatch(/^qa\..+@example\.com$/);
  expect(newProduct({ price: 99 })).toMatchObject({ price: 99, category: 'test-data' });
});

// ==== INTERMEDIATE 1: A retry helper for non-UI work ====
// > Use it for API calls or file checks that may need a moment. It waits longer after each failure (backoff). Do NOT use it for page checks: use web-first assertions there.
test('retry helper with backoff', async () => {
  const attemptsSeen: number[] = [];
  const result = await retry(async (attempt) => {
    attemptsSeen.push(attempt);
    if (attempt < 3) throw new Error('not yet');
    return 'ok';
  }, { attempts: 5, delayMs: 5 });
  expect(result).toBe('ok');
  expect(attemptsSeen).toEqual([1, 2, 3]);
  await baseExpect(retry(async () => { throw new Error('always fails'); }, { attempts: 2, delayMs: 1 })).rejects.toThrow('always fails');
});

// ==== INTERMEDIATE 2: A typed API layer and a data fixture ====
// > The `product` fixture creates a product through the API before the test and deletes it afterwards. The test only describes WHAT it checks.
test('product fixture owns its data', async ({ page, product }) => {
  await page.goto('/shop.html');
  await expect(page.getByTestId(`product-${product.id}`)).toContainText(product.name);
});

test('api helper: list contains my product', async ({ api, product }) => {
  const all = await api.list();
  baseExpect(all.map((p) => p.id)).toContain(product.id);
});

// ==== INTERMEDIATE 3: A custom matcher ====
// > A domain-specific assertion reads like a sentence and keeps retrying like a built-in one.
test('custom matcher toHaveProductCount', async ({ page }) => {
  await page.goto('/shop.html');
  await expect(page.locator('.product')).toHaveProductCount(3);
  await expect(page.locator('.product')).not.toHaveProductCount(99);
});

// ==== INTERMEDIATE 4: The console guard (an automatic fixture) ====
// > Every test now also checks that the page threw no JavaScript errors. This test PROVOKES an error, so `fail()` expects the guard to stop it.
test('console guard catches page errors', async ({ page }) => {
  test.fail();
  await page.goto('/extras.html');
  await page.getByRole('button', { name: 'Throw error' }).click();
  await page.waitForTimeout(100);                                  // let the page error be reported (demo only)
});

test.describe('when errors are expected', () => {
  test.use({ allowConsoleErrors: true });
  test('the guard can be switched off for one group', async ({ page }) => {
    await page.goto('/extras.html');
    await page.getByRole('button', { name: 'Log error' }).click();
    await expect(page.getByRole('heading', { name: 'Extras' })).toBeVisible();
  });
});

// ==== HARD 1: BDD style steps without a BDD tool ====
// > `Given / When / Then` helpers wrap `test.step`, so the report reads like a specification, with no extra library. Larger teams may choose Cucumber or `playwright-bdd`, but this small helper covers many needs.
const given = (text: string, body: () => Promise<void>) => test.step(`Given ${text}`, body);
const when = (text: string, body: () => Promise<void>) => test.step(`When ${text}`, body);
const then = (text: string, body: () => Promise<void>) => test.step(`Then ${text}`, body);

test('a user logs in (BDD steps)', { tag: '@smoke' }, async ({ page, env }) => {
  await given('the shop page is open', async () => { await page.goto('/shop.html'); });
  await when('the user signs in with valid credentials', async () => {
    await page.getByLabel('Email').fill(env.userEmail);
    await page.getByLabel('Password').fill(env.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
  });
  await then('a welcome message is shown', async () => {
    await expect(page.getByRole('alert')).toHaveText(`Welcome, ${env.userEmail}`);
  });
});

// ==== HARD 2: Tag every test, run suites by tag ====
// > Tags decide WHAT runs WHERE: `@smoke` on every pull request, `@regression` nightly. Run `npx playwright test --grep @smoke`. A test can read its own tags.
test('tags are readable at run time', { tag: ['@regression', '@api'] }, async ({ api }, testInfo) => {
  expect(testInfo.tags).toEqual(['@regression', '@api']);
  expect((await api.list()).length).toBeGreaterThan(0);
});

// ==== HARD 3: Parallel-safe tests ====
// > These two tests create their own products with unique names and never assert on the TOTAL number of products. They can run at the same time, in any order, on any machine. Turn this on in the config with `fullyParallel: true`.
for (const n of [1, 2]) {
  test(`parallel safe ${n}`, async ({ page, product, api }) => {
    await page.goto('/shop.html');
    await expect(page.getByTestId(`product-${product.id}`)).toBeVisible();
    const mine = (await api.list()).filter((p) => p.id === product.id);
    expect(mine).toHaveLength(1);
  });
}

// ==== HARD 4: Network error watcher ====
// > Record failed requests while a test runs and fail on unexpected ones. Combined with the console guard this catches broken images, scripts and API calls.
test('no failed requests on the shop page', async ({ page }) => {
  const failed: string[] = [];
  page.on('requestfailed', (r) => failed.push(`${r.method()} ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  await page.goto('/shop.html');
  await expect(page.locator('.product')).toHaveCount(3);
  expect(failed, 'requests that failed').toEqual([]);
});
