import { test, expect } from '@playwright/test';

// ==== BASIC 1: skip, fixme, slow ====
// > `test.skip` does not run the test. `test.fixme` skips a known bug (it signals "fix me"). `test.slow()` triples the timeout of one test.
test.skip('skip: feature not ready yet', async ({ page }) => {
  await page.goto('/');
});

test.fixme('fixme: known bug BUG-101, enable after the fix', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Impossible text')).toBeVisible();
});

test('slow: this test gets three times the timeout', async ({ page }) => {
  test.slow();
  await page.goto('/shop.html');
  await expect(page.locator('.product')).toHaveCount(3);
});

// ==== BASIC 2: Tags with the details object ====
// > A tag is a label that starts with `@`. Run a subset with `--grep @smoke`. Tags can be read back with `test.info().tags`.
test('tagged test', { tag: ['@smoke', '@login'] }, async ({ page }) => {
  expect(test.info().tags).toEqual(['@smoke', '@login']);
  await page.goto('/shop.html');
});

// ==== INTERMEDIATE 1: Conditional skip ====
// > Skip depending on a condition. The first argument is a boolean, the second is the reason shown in the report.
test('conditional skip by browser', async ({ browserName }) => {
  test.skip(browserName === 'firefox', 'This feature is not supported in Firefox');
  expect(browserName).toBe('chromium');
});

// test('conditional skip by environment variable', async ({ page }) => {
//   test.skip(process.env.SKIP_PAYMENTS === '1', 'Payment sandbox is down');
//   await page.goto('/widgets.html');
//   await expect(page.getByRole('heading', { name: 'Widgets' })).toBeVisible();
// });

// ==== INTERMEDIATE 2: test.fail (expected failure) ====
// > `test.fail()` says "I expect this to fail". The test PASSES when it fails and FAILS if it unexpectedly passes. Good for known bugs that you want to keep tracking.
test('fail: known bug where the total is wrong', async ({ page }) => {
  test.fail();
  await page.goto('/shop.html');
  await expect(page.getByRole('link', { name: /^Cart/ })).toHaveText('Cart (99)');   // really shows Cart (0)
});

// ==== INTERMEDIATE 3: Custom annotations ====
// > Add your own metadata (a ticket id, an owner) so it shows in the HTML report. Use the details object or push at run time.
test('issue annotation in the details', {
  annotation: [{ type: 'issue', description: 'https://example.com/browse/BUG-42' }, { type: 'owner', description: 'asha' }],
}, async ({ page }) => {
  const types = test.info().annotations.map((a) => a.type);
  expect(types).toEqual(['issue', 'owner']);
  await page.goto('/');
});

test('push an annotation while the test runs', async ({ page }) => {
  await page.goto('/shop.html');
  test.info().annotations.push({ type: 'note', description: 'Products loaded after 300 ms' });
  expect(test.info().annotations.some((a) => a.type === 'note')).toBe(true);
});

// ==== INTERMEDIATE 4: Annotate a whole group ====
// > `test.describe.skip`, `test.describe.fixme` and `test.describe.configure` apply to every test inside.
test.describe.skip('whole group skipped', () => {
  test('never runs 1', async () => { throw new Error('should be skipped'); });
  test('never runs 2', async () => { throw new Error('should be skipped'); });
});

test.describe('group with its own settings', () => {
  test.describe.configure({ timeout: 10_000, retries: 0 });
  test('uses the 10 s timeout of the group', async ({ page }) => {
    expect(test.info().timeout).toBe(10_000);
    await page.goto('/');
  });
});

// ==== HARD 1: Skip at run time based on a tag or data ====
// > You can decide inside a hook. Here every test tagged `@slow` is skipped when the environment variable FAST is set.
// // test.describe('skip by tag at run time', () => {
// //   test.beforeEach(async () => {
// //     const isSlow = test.info().tags.includes('@slow');
// //     test.skip(isSlow && process.env.FAST === '1', 'FAST mode: skipping slow tests');
// //   });
//   test('a slow-tagged test', { tag: '@slow' }, async ({ page }) => {
//     await page.goto('/shop.html');
//     await expect(page.locator('.product')).toHaveCount(3);
//   });
//   test('a normal test', async ({ page }) => {
//     await page.goto('/');
//   });
// });

// ==== HARD 2: Annotations of other tests in afterEach ====
// > `afterEach` can read the status and annotations. This is how you build rules such as "an expected-failure test must really fail".
test.describe('inspect results in afterEach', () => {
  const seen: string[] = [];
  test.afterEach(async () => { seen.push(`${test.info().title}:${test.info().status}`); });
  test('first', async () => { expect(1).toBe(1); });
  test('second', async () => { expect(seen).toEqual(['first:passed']); });
});

// ==== HARD 3: Timeouts and serial mode as annotations of behaviour ====
// > `test.setTimeout` changes one test. `describe.configure({ mode: 'serial' })` runs tests in order and skips the rest after a failure.
test.describe('serial flow', () => {
  test.describe.configure({ mode: 'serial' });
  let orderId = 0;
  test('step 1 creates data', async ({ request }) => {
    const r = await request.post('/api/products', { data: { name: 'Serial Item', price: 1 } });
    orderId = (await r.json()).id;
    expect(orderId).toBeGreaterThan(0);
  });
  test('step 2 uses the data from step 1', async ({ request }) => {
    test.setTimeout(15_000);
    const r = await request.get(`/api/products/${orderId}`);
    expect((await r.json()).name).toBe('Serial Item');
    await request.delete(`/api/products/${orderId}`);
  });
});
