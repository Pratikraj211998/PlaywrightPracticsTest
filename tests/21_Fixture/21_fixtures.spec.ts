import { test as base, expect, mergeTests, Page, APIRequestContext } from '@playwright/test';

// ==== BASIC 1: Built-in fixtures ====
// > You have used fixtures all along: `page`, `context`, `browser`, `request`, `browserName`, `baseURL`, `viewport` and `testInfo`. A test asks for the ones it needs by NAME inside the curly braces, and Playwright prepares them.
base('built-in fixtures', async ({ page, context, browser, request, browserName, baseURL }, testInfo) => {
  expect(browserName).toBe('chromium');
  expect(baseURL).toBe('http://localhost:3000');
  expect(context.pages()).toContain(page);
  expect(browser.contexts()).toContain(context);
  expect((await request.get('/api/products')).ok()).toBe(true);
  expect(testInfo.title).toBe('built-in fixtures');
});

// ==== BASIC 2: Your first custom fixture ====
// > `base.extend` returns a NEW `test` with extra fixtures. A fixture is an async function: prepare something, give it to the test with `use(value)`. Import the new `test` instead of the one from Playwright.
const test = base.extend<{ userName: string }>({
  userName: async ({}, use) => {
    await use('Asha');
  },
});

test('custom fixture value', async ({ userName }) => {
  expect(userName).toBe('Asha');
});

// ==== BASIC 3: Setup and teardown in one place ====
// > Everything BEFORE `use()` is setup. Everything AFTER `use()` is teardown and ALWAYS runs, even when the test fails. That is why fixtures are safer than hooks.
const log: string[] = [];
const lifecycle = base.extend<{ resource: string }>({
  resource: async ({}, use) => {
    log.push('setup');
    await use('the resource');
    log.push('teardown');
  },
});
lifecycle.describe('setup and teardown order', () => {
  lifecycle.describe.configure({ mode: 'serial' });          // run in order so the log is predictable

  lifecycle('1. the test sees the resource', async ({ resource }) => {
    log.push('test uses ' + resource);
    expect(log).toEqual(['setup', 'test uses the resource']);
  });
  lifecycle('2. teardown of test 1 already ran', async ({ resource }) => {
    expect(resource).toBe('the resource');
    expect(log).toEqual(['setup', 'test uses the resource', 'teardown', 'setup']);
  });
});

// ==== INTERMEDIATE 1: A fixture that uses another fixture ====
// > List other fixtures in the first parameter. Playwright creates them first. Here `loggedInPage` needs `page` and `request`.
const withLogin = base.extend<{ loggedInPage: Page }>({
  loggedInPage: async ({ page, request }, use) => {
    const login = await request.post('/api/login', { data: { email: 'asha@example.com', password: 'secret' } });
    const { token } = await login.json();
    await page.addInitScript((t) => localStorage.setItem('token', t), token);
    await page.goto('/dashboard.html');
    await use(page);
  },
});

withLogin('fixture builds on page and request', async ({ loggedInPage }) => {
  await expect(loggedInPage.locator('#status')).toHaveText('Welcome back, asha');
});

// ==== INTERMEDIATE 2: A fixture that returns a helper object ====
// > A fixture can hand over an object with methods, such as an API client. Tests stay short and all the details live in one place.
class ShopApi {
  constructor(private readonly request: APIRequestContext) {}
  async products() { return (await this.request.get('/api/products')).json(); }
  async create(name: string, price: number) { return (await this.request.post('/api/products', { data: { name, price } })).json(); }
  async remove(id: number) { await this.request.delete(`/api/products/${id}`); }
}
const withApi = base.extend<{ api: ShopApi }>({
  api: async ({ request }, use) => { await use(new ShopApi(request)); },
});

withApi('fixture returns an API helper', async ({ api }) => {
  const item = await api.create('Fixture Item', 3);
  expect((await api.products()).some((p: { id: number }) => p.id === item.id)).toBe(true);
  await api.remove(item.id);
});

// ==== INTERMEDIATE 3: A factory fixture that cleans up everything it made ====
// > Sometimes a test needs several items. The fixture returns a FUNCTION; every call creates an item and remembers it; the teardown deletes them all. One of the most useful patterns.
type ProductFactory = (name: string, price: number) => Promise<{ id: number; name: string }>;
const withFactory = base.extend<{ makeProduct: ProductFactory }>({
  makeProduct: async ({ request }, use) => {
    const created: number[] = [];
    await use(async (name, price) => {
      const product = await (await request.post('/api/products', { data: { name, price } })).json();
      created.push(product.id);
      return product;
    });
    for (const id of created) await request.delete(`/api/products/${id}`);         // clean up all
  },
});

withFactory('factory fixture creates many and cleans all', async ({ page, makeProduct }) => {
  const a = await makeProduct('Factory A', 1);
  const b = await makeProduct('Factory B', 2);
  await page.goto('/shop.html');
  await expect(page.getByTestId(`product-${a.id}`)).toContainText('Factory A');
  await expect(page.getByTestId(`product-${b.id}`)).toContainText('Factory B');
});

// ==== INTERMEDIATE 4: Automatic fixtures (run without being asked) ====
// > `{ auto: true }` makes the fixture run for EVERY test that uses this `test` object. Good for a console-error guard, a reset, or a trace attachment.
const errorsSeen: string[] = [];
const withGuard = base.extend<{ consoleGuard: void }>({
  consoleGuard: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await use();
    errorsSeen.push(...errors);
    expect(errors, 'the page threw JavaScript errors').toEqual([]);
  }, { auto: true }],
});

withGuard('the guard watched this test without being requested', async ({ page }) => {
  await page.goto('/shop.html');
  await expect(page.locator('.product')).toHaveCount(3);
});

// ==== INTERMEDIATE 5: Option fixtures and test.use ====
// > An option fixture has a default value and can be replaced with `test.use`. Great for switching user, language or environment for a group of tests.
const withRole = base.extend<{ role: 'user' | 'admin'; email: string }>({
  role: ['user', { option: true }],
  email: async ({ role }, use) => { await use(role === 'admin' ? 'admin@example.com' : 'asha@example.com'); },
});

withRole.describe('default role', () => {
  withRole('role is user', async ({ role, email }) => { expect([role, email]).toEqual(['user', 'asha@example.com']); });
});
withRole.describe('admin role', () => {
  withRole.use({ role: 'admin' });
  withRole('role is admin', async ({ role, email }) => { expect([role, email]).toEqual(['admin', 'admin@example.com']); });
});

// ==== INTERMEDIATE 6: Override a built-in fixture ====
// > Declare a fixture with the SAME name as a built-in one. You can use the original inside it. Here every `page` opens the shop first.
const shopByDefault = base.extend({
  page: async ({ page }, use) => {
    await page.goto('/shop.html');
    await use(page);
  },
});

shopByDefault('the page fixture was overridden', async ({ page }) => {
  await expect(page).toHaveURL(/shop\.html/);
  await expect(page.getByRole('heading', { name: 'Demo Shop' })).toBeVisible();
});

// ==== INTERMEDIATE 7: Combine fixtures from several files with mergeTests ====
// > Keep small, focused fixture files (api, pages, roles) and merge them into one `test` that your specs import.
const merged = mergeTests(withApi, withFactory, withRole);
merged('merged test object has all the fixtures', async ({ api, makeProduct, role }) => {
  expect(role).toBe('user');
  const item = await makeProduct('Merged', 9);
  expect((await api.products()).some((p: { id: number }) => p.id === item.id)).toBe(true);
});

// ==== HARD 1: Worker-scoped fixtures ====
// > A normal fixture runs for each TEST. A worker fixture runs once per WORKER process and is shared by all its tests. Use it for something expensive: a database connection, a token, a started server. It cannot use test-scoped fixtures such as `page`.
let workerSetups = 0;
const withWorker = base.extend<{}, { sharedToken: string }>({
  sharedToken: [async ({}, use) => {
    workerSetups++;
    await use(`token-for-worker-${workerSetups}`);
  }, { scope: 'worker' }],
});

withWorker('worker fixture, test A', async ({ sharedToken }) => { expect(sharedToken).toBe('token-for-worker-1'); });
withWorker('worker fixture, test B reuses it', async ({ sharedToken }) => {
  expect(sharedToken).toBe('token-for-worker-1');
  expect(workerSetups).toBe(1);
});

// ==== HARD 2: Different data for each parallel worker ====
// > When tests run in parallel they must not use the same account. `testInfo.parallelIndex` is a number (0, 1, 2...) for the running worker slot. Use it to give each worker its own user.
const perWorker = base.extend<{}, { workerUser: string }>({
  workerUser: [async ({}, use, workerInfo) => {
    await use(`user${workerInfo.parallelIndex}@example.com`);
  }, { scope: 'worker' }],
});
perWorker('each worker gets its own user', async ({ workerUser }, testInfo) => {
  expect(workerUser).toBe(`user${testInfo.parallelIndex}@example.com`);
});

// ==== HARD 3: Teardown runs even when the test fails ====
// > Prove it: the test is marked `fail()` (expected to fail), and the fixture still records its teardown.
const teardownLog: string[] = [];
const safe = base.extend<{ tracked: string }>({
  tracked: async ({}, use) => {
    await use('x');
    teardownLog.push('teardown ran');
  },
});
safe.describe('teardown after failure', () => {
  safe.describe.configure({ mode: 'serial' });
  safe('a failing test (expected)', async ({ tracked }) => {
    safe.fail();
    expect(tracked).toBe('y');
  });
  safe('the teardown ran after the failure', async () => {
    expect(teardownLog).toEqual(['teardown ran']);
  });
});

// ==== HARD 4: Fixture titles and hidden fixtures ====
// > `title` changes the name shown in reports. `box: true` hides a noisy fixture from the report and makes errors point to YOUR test line instead of the fixture.
const nice = base.extend<{ seeded: number }>({
  seeded: [async ({ request }, use) => {
    await request.post('/api/reset');
    await use(3);
  }, { title: 'reset demo data', box: true }],
});
nice('a boxed, titled fixture', async ({ seeded, page }) => {
  await page.goto('/shop.html');
  await expect(page.locator('.product')).toHaveCount(seeded);
});

// ==== HARD 5: A fixture with its own timeout ====
// > A slow fixture can have a longer limit than the test, so a slow setup does not use up the test's time.
const slowSetup = base.extend<{ slowThing: string }>({
  slowThing: [async ({}, use) => {
    await new Promise((r) => setTimeout(r, 400));
    await use('ready');
  }, { timeout: 10_000 }],
});
slowSetup('fixture with a longer timeout', async ({ slowThing }) => { expect(slowThing).toBe('ready'); });

// ==== HARD 6: Fixture dependency chain and order ====
// > Fixtures are created in order of their dependencies and destroyed in the reverse order. This log shows `c` needs `b` needs `a`.
const order: string[] = [];
const chain = base.extend<{ a: string; b: string; c: string }>({
  a: async ({}, use) => { order.push('a up'); await use('a'); order.push('a down'); },
  b: async ({ a }, use) => { order.push('b up'); await use(a + 'b'); order.push('b down'); },
  c: async ({ b }, use) => { order.push('c up'); await use(b + 'c'); order.push('c down'); },
});
chain.describe('dependency order', () => {
  chain.describe.configure({ mode: 'serial' });
  chain('dependencies are created first', async ({ c }) => {
    expect(c).toBe('abc');
    expect(order).toEqual(['a up', 'b up', 'c up']);
  });
  chain('and destroyed in reverse order', async ({ a }) => {
    expect(order.slice(3, 6)).toEqual(['c down', 'b down', 'a down']);
    expect(a).toBe('a');
  });
});
