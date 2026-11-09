import { test, expect as baseExpect } from '@playwright/test';

const expect = baseExpect;

// ==== BASIC 1: Element state assertions ====
// > These check whether an element exists, is shown, and can be used. Every one of them WAITS (retries) until true or until the timeout of 5 seconds.
test('state assertions', async ({ page }) => {
  await page.goto('/widgets.html');
  const name = page.getByLabel('Full name');
  await expect(name).toBeVisible();
  await expect(name).toBeEnabled();
  await expect(name).toBeEditable();
  await expect(name).toBeEmpty();
  await expect(name).not.toBeFocused();
  await name.focus();
  await expect(name).toBeFocused();
  await expect(page.getByRole('checkbox', { name: 'I accept the terms' })).not.toBeChecked();
  await expect(page.locator('#loaded')).toBeHidden();
  await expect(page.locator('#loaded')).toBeAttached();                     // in the DOM, even though hidden
  await expect(page.locator('#does-not-exist')).not.toBeAttached();
  await expect(page.getByRole('heading', { name: 'Widgets' })).toBeInViewport();
});

// ==== BASIC 2: Text assertions ====
// > `toHaveText` checks the WHOLE text (string or regex). `toContainText` checks a part. With an array, a list of elements is compared in order.
test('text assertions', async ({ page }) => {
  await page.goto('/shop.html');
  await expect(page.locator('.product')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Demo Shop' })).toHaveText('Demo Shop');
  await expect(page.getByRole('heading', { name: 'Demo Shop' })).toHaveText(/demo/i);
  await expect(page.locator('.product').first()).toContainText('$900');
  await expect(page.locator('.product .name')).toHaveText(['Laptop', 'Phone', 'Headphones']);
  await expect(page.locator('.product .name')).toContainText(['Lap', 'Pho', 'Head']);
});

// ==== BASIC 3: Text options: ignoreCase and useInnerText ====
// > `ignoreCase` ignores letter case. `useInnerText` compares what the user SEES (respects CSS and hidden text) instead of the raw text content.
test('toHaveText options', async ({ page }) => {
  await page.goto('/shop.html');
  await expect(page.getByRole('heading', { name: 'Demo Shop' })).toHaveText('DEMO SHOP', { ignoreCase: true });
  await expect(page.getByRole('heading', { name: 'Login' })).toHaveText('Login', { useInnerText: true });
});

// ==== BASIC 4: Value, attribute, class, id and CSS ====
// > Check what an element IS: its value, attributes, classes, id, computed style or JavaScript property.
test('value and attribute assertions', async ({ page }) => {
  await page.goto('/shop.html');
  const email = page.getByLabel('Email');
  await email.fill('asha@example.com');
  await expect(email).toHaveValue('asha@example.com');
  await expect(email).toHaveValue(/@example\.com$/);
  await expect(email).toHaveAttribute('placeholder', 'you@example.com');
  await expect(email).toHaveClass('input');
  await expect(email).toContainClass('input');
  await expect(page.locator('#login-btn')).toHaveClass(/btn-primary/);
  await expect(page.locator('#login-btn')).toHaveId('login-btn');
  await expect(page.locator('#login-btn')).toHaveCSS('display', 'inline-block');
  await expect(email).toHaveJSProperty('type', 'text');
});

// ==== BASIC 5: Multi-select values ====
// > `toHaveValues` checks the list of selected options of a `<select multiple>`.
test('toHaveValues', async ({ page }) => {
  await page.goto('/selects.html');
  await page.getByLabel('Skills (multi-select)').selectOption(['SQL', 'Docker']);
  await expect(page.getByLabel('Skills (multi-select)')).toHaveValues(['SQL', 'Docker']);
});

// ==== BASIC 6: Page assertions ====
// > `toHaveURL` and `toHaveTitle` wait for navigation. Use a regex when part of the address changes.
test('page assertions', async ({ page }) => {
  await page.goto('/shop.html');
  await expect(page).toHaveURL('/shop.html');
  await expect(page).toHaveURL(/\/shop\.html$/);
  await expect(page).toHaveURL((url) => url.pathname === '/shop.html');
  await expect(page).toHaveTitle('Demo Shop');
  await expect(page).not.toHaveTitle('Something else');
});

// ==== INTERMEDIATE 1: Negative assertions wait too ====
// > `.not` retries until the condition is FALSE. A loader that disappears after a second makes `not.toBeVisible` pass as soon as it is gone.
test('not waits until the element disappears', async ({ page }) => {
  await page.goto('/widgets.html');
  await page.getByRole('button', { name: 'Load data' }).click();
  await expect(page.locator('#loaded')).toBeHidden();
  await expect(page.locator('#loaded')).not.toBeHidden();                  // waits for the 1 s delay
  await expect(page.getByText('Data loaded')).toBeVisible();
});

// ==== INTERMEDIATE 2: A custom message and a custom timeout ====
// > The message appears in the failure report and makes failures easy to understand. Raise the timeout only for the slow assertion.
test('message and timeout', async ({ page }) => {
  await page.goto('/widgets.html');
  await page.getByRole('button', { name: 'Load data' }).click();
  await expect(page.getByText('Data loaded'), 'the data must appear after the click').toBeVisible({ timeout: 10_000 });
});

// ==== INTERMEDIATE 3: Soft assertions ====
// > A failed soft assertion does not stop the test; you see all problems at once. The test still FAILS at the end. (Here `test.fail()` expects that, so the example passes.)
test('soft assertions report every problem', async ({ page }) => {
  test.fail();
  await page.goto('/shop.html');
  await expect.soft(page.getByRole('heading', { name: 'Demo Shop' })).toBeVisible();
  await expect.soft(page.locator('.product'), 'wrong count on purpose').toHaveCount(99, { timeout: 500 });
  await expect.soft(page.getByLabel('Email')).toHaveValue('wrong', { timeout: 500 });
  expect(test.info().errors.length).toBe(2);
});

// ==== INTERMEDIATE 4: Generic matchers: toBe, toEqual, toStrictEqual ====
// > These compare plain JavaScript values and do NOT retry. `toBe` is strict identity. `toEqual` compares content and ignores `undefined` fields. `toStrictEqual` also checks undefined fields and types.
test('generic equality matchers', async () => {
  expect(2 + 2).toBe(4);
  expect('a').toBe('a');
  expect({ a: 1 }).not.toBe({ a: 1 });                                      // different objects
  expect({ a: 1 }).toEqual({ a: 1 });
  expect({ a: 1, b: undefined }).toEqual({ a: 1 });                         // undefined ignored
  expect({ a: 1, b: undefined }).not.toStrictEqual({ a: 1 });               // undefined matters here
  expect([1, 2, 3]).toEqual([1, 2, 3]);
});

// ==== INTERMEDIATE 5: Numbers, strings, arrays and objects ====
// > A set of everyday matchers. Choose the one that reads like a sentence.
test('everyday generic matchers', async () => {
  expect(10).toBeGreaterThan(5);
  expect(10).toBeGreaterThanOrEqual(10);
  expect(3).toBeLessThan(4);
  expect(0.1 + 0.2).toBeCloseTo(0.3);
  expect('Playwright').toMatch(/play/i);
  expect('Playwright').toContain('wright');
  expect(['a', 'b']).toContain('a');
  expect([{ id: 1 }, { id: 2 }]).toContainEqual({ id: 2 });
  expect([1, 2, 3]).toHaveLength(3);
  expect({ id: 1, name: 'x', extra: true }).toMatchObject({ id: 1, name: 'x' });
  expect({ a: 1 }).toHaveProperty('a', 1);
  expect(null).toBeNull();
  expect(undefined).toBeUndefined();
  expect('x').toBeDefined();
  expect(1).toBeTruthy();
  expect(0).toBeFalsy();
  expect(Number.NaN).toBeNaN();
});

// ==== INTERMEDIATE 6: Asymmetric matchers (match the shape, not exact values) ====
// > When some values change every run (ids, dates), describe them by type or pattern instead of exact value.
test('asymmetric matchers', async ({ request }) => {
  const created = await (await request.post('/api/products', { data: { name: 'Shape Item', price: 7 } })).json();
  expect(created).toEqual({
    id: expect.any(Number),
    name: expect.stringContaining('Shape'),
    price: 7,
    category: expect.stringMatching(/^[a-z]+$/),
  });
  expect([1, 2, 3, 4]).toEqual(expect.arrayContaining([2, 4]));
  expect({ a: 1, b: 2 }).toEqual(expect.objectContaining({ b: 2 }));
  expect('anything').toEqual(expect.anything());
  await request.delete(`/api/products/${created.id}`);
});

// ==== INTERMEDIATE 7: Errors and promises ====
// > `toThrow` checks that a function throws. `resolves` and `rejects` check promises. Remember `await` before `expect(promise)`.
test('toThrow, resolves and rejects', async () => {
  expect(() => { throw new Error('boom'); }).toThrow('boom');
  expect(() => JSON.parse('{bad')).toThrow(SyntaxError);
  await expect(Promise.resolve(5)).resolves.toBe(5);
  await expect(Promise.reject(new Error('nope'))).rejects.toThrow('nope');
});

// ==== INTERMEDIATE 8: API response assertions ====
// > `toBeOK()` checks for any 2xx status. Combine with status, headers and body checks.
test('response assertions', async ({ request }) => {
  const ok = await request.get('/api/products');
  await expect(ok).toBeOK();
  expect(ok.status()).toBe(200);
  expect(ok.headers()['content-type']).toContain('application/json');
  const missing = await request.get('/api/products/999');
  await expect(missing).not.toBeOK();
  expect(missing.status()).toBe(404);
  expect(await missing.json()).toEqual({ error: 'Not found' });
});

// ==== HARD 1: expect.poll for non-locator values ====
// > Retry ANY async function until it returns the wanted value. You can set the timeout, the retry intervals and a message.
test('expect.poll with options', async ({ page }) => {
  await page.goto('/extras.html');
  const feed = page.getByRole('feed', { name: 'News feed' });
  await expect.poll(async () => {
    await feed.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    return feed.getByRole('article').count();
  }, { message: 'the feed should load 30 posts', timeout: 10_000, intervals: [100, 250, 500] }).toBe(30);
});

// ==== HARD 2: toPass: retry a block of statements ====
// > Use it when SEVERAL checks must pass together. The whole block is repeated with growing delays until it passes.
test('toPass with intervals', async ({ page }) => {
  await page.goto('/widgets.html');
  await page.getByRole('button', { name: 'Load data' }).click();
  await expect(async () => {
    const visible = await page.locator('#loaded').isVisible();
    const text = await page.locator('#loaded').textContent();
    expect(visible).toBe(true);
    expect(text).toBe('Data loaded');
  }).toPass({ intervals: [200, 400, 800], timeout: 5000 });
});

// ==== HARD 3: expect.configure: your own expect with other defaults ====
// > Create a new `expect` with a longer timeout, or one where every assertion is soft. Use it only where needed.
test('expect.configure', async ({ page }) => {
  const slowExpect = expect.configure({ timeout: 8000 });
  await page.goto('/widgets.html');
  await page.getByRole('button', { name: 'Load data' }).click();
  await slowExpect(page.getByText('Data loaded')).toBeVisible();
  const softExpect = expect.configure({ soft: true });
  await softExpect(page.getByRole('heading', { name: 'Widgets' })).toBeVisible();
});

// ==== HARD 4: Write your own matcher ====
// > `expect.extend` adds domain-specific assertions. Wrapping a built-in web-first assertion keeps the automatic retry.
const myExpect = baseExpect.extend({
  async toBeOnSale(locator: import('@playwright/test').Locator, maxPrice: number) {
    let pass = false;
    let message = '';
    try {
      await baseExpect(locator).toHaveText(new RegExp(`^\\$(\\d+)$`));
      const price = Number((await locator.innerText()).replace('$', ''));
      pass = price <= maxPrice;
      message = `price is ${price}, limit is ${maxPrice}`;
    } catch (e) {
      message = (e as Error).message;
    }
    return { pass, message: () => `toBeOnSale: ${message}` };
  },
});

test('custom matcher toBeOnSale', async ({ page }) => {
  await page.goto('/shop.html');
  await myExpect(page.locator('.product .price').nth(2)).toBeOnSale(150);     // $100
  await myExpect(page.locator('.product .price').first()).not.toBeOnSale(150);   // $900
});

// ==== HARD 5: Accessibility assertions ====
// > Assert the accessible name, description and role, and the structure of a region with an ARIA snapshot.
test('accessibility assertions', async ({ page }) => {
  await page.goto('/extras.html');
  await expect(page.getByLabel('Volume')).toHaveAccessibleName('Volume');
  await expect(page.getByRole('button', { name: 'Info' })).toHaveAccessibleDescription('Extra help text');
  await expect(page.getByRole('heading', { name: 'Extras' })).toHaveRole('heading');
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
});

// ==== HARD 6: Assert on network traffic ====
// > Wait for a response, then assert on its status and JSON. The listener is created BEFORE the action. Note: `toBeOK()` only works on API responses (from `request`), so for a page response use `response.ok()`.
test('assert on a network response', async ({ page }) => {
  const responsePromise = page.waitForResponse('**/api/products');
  await page.goto('/shop.html');
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.map((p: { name: string }) => p.name)).toEqual(expect.arrayContaining(['Laptop', 'Phone']));
});
