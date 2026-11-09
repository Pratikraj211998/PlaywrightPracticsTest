import { test, expect } from '@playwright/test';
import * as allure from 'allure-js-commons';

test.beforeEach(async ({ request }) => { await request.post('/api/reset'); });

// ==== BASIC 1: Plain test, report for free ====
// > With the reporter installed, every test already appears in the Allure report with its status, time, steps from `test.step`, screenshots and traces. No extra code is needed.
test('plain test appears in the report', async ({ page }) => {
  await page.goto('/shop.html');
  await expect(page.locator('.product')).toHaveCount(3);
});

// ==== BASIC 2: Organise with epic, feature and story ====
// > Allure groups tests in a tree. `epic` is the big area, `feature` the part of it, and `story` the user story. Use the same names across tests so they group together.
test('login shows a welcome message', async ({ page }) => {
  await allure.epic('Shop');
  await allure.feature('Login');
  await allure.story('Valid credentials');
  await page.goto('/shop.html');
  await page.getByLabel('Email').fill('asha@example.com');
  await page.getByLabel('Password').fill('secret');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Welcome');
});

// ==== BASIC 3: Severity and owner ====
// > `severity` tells how important the test is (blocker, critical, normal, minor, trivial). `owner` says who maintains it.
test('cart counter works', async ({ page }) => {
  await allure.severity(allure.Severity.CRITICAL);
  await allure.owner('asha');
  await page.goto('/shop.html');
  await page.getByTestId('product-2').getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByRole('link', { name: /^Cart/ })).toHaveText('Cart (1)');
});

// ==== INTERMEDIATE 1: Steps ====
// > `allure.step` creates a named step with its own pass or fail. Steps can nest. (Playwright's own `test.step` also shows up when `detail: true` is set.)
test('checkout flow with steps', async ({ page }) => {
  await allure.feature('Cart');
  await allure.step('Open the shop', async () => {
    await page.goto('/shop.html');
  });
  await allure.step('Add two products', async () => {
    await allure.step('Add Laptop', async () => {
      await page.getByTestId('product-1').getByRole('button', { name: 'Add to cart' }).click();
    });
    await allure.step('Add Phone', async () => {
      await page.getByTestId('product-2').getByRole('button', { name: 'Add to cart' }).click();
    });
  });
  await allure.step('Check the counter', async () => {
    await expect(page.getByRole('link', { name: /^Cart/ })).toHaveText('Cart (2)');
  });
});

// ==== INTERMEDIATE 2: Description, links, issue and tags ====
// > Add context: a description (Markdown), a link to the requirement, the bug ticket, and free tags.
test('metadata: description, links, tags', async ({ page }) => {
  await allure.description('## Goal\nCheck that the **home page** opens.');
  await allure.link('https://example.com/requirements/HOME-1', 'Requirement HOME-1');
  await allure.issue('BUG-77', 'https://example.com/browse/BUG-77');
  await allure.tms('TC-1001', 'https://example.com/testcases/TC-1001');
  await allure.tags('smoke', 'home');
  await allure.displayName('Home page opens (readable name)');
  await page.goto('/');
  await expect(page).toHaveTitle('Practice Home');
});

// ==== INTERMEDIATE 3: Parameters and attachments ====
// > Parameters show the data of a data-driven test. Attachments add evidence: text, JSON, screenshots, files.
for (const [email, password, expected] of [['asha@example.com', 'secret', 'Welcome'], ['asha@example.com', 'bad', 'Invalid']]) {
  test(`parameters and attachments: ${password}`, async ({ page }) => {
    await allure.parameter('email', email);
    await allure.parameter('password', password, { mode: 'masked' });          // hides the value in the report
    await page.goto('/shop.html');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await allure.attachment('request data', JSON.stringify({ email }), { contentType: allure.ContentType.JSON });
    await allure.attachment('page screenshot', await page.screenshot(), { contentType: allure.ContentType.PNG });
    await expect(page.getByRole('alert')).toContainText(expected);
  });
}

// ==== INTERMEDIATE 4: Playwright attachments flow into Allure ====
// > `testInfo.attach` is picked up by the Allure reporter automatically, so you can keep writing standard Playwright code.
test('testInfo.attach is included', async ({ page }, testInfo) => {
  await page.goto('/shop.html');
  await testInfo.attach('html snapshot', { body: await page.content(), contentType: 'text/html' });
  await testInfo.attach('note', { body: 'Products loaded from /api/products', contentType: 'text/plain' });
  await expect(page.getByRole('heading', { name: 'Demo Shop' })).toBeVisible();
});

// ==== HARD 1: Status types: passed, failed, broken, skipped ====
// > In Allure a FAILED test is an assertion failure and a BROKEN test is an unexpected error (for example a timeout or a bug in the test). Skipped tests are listed separately. Here an expected failure and a skip show up in the report.
test('expected failure shows as passed', async ({ page }) => {
  test.fail();
  await page.goto('/shop.html');
  await expect(page.getByText('this text does not exist')).toBeVisible({ timeout: 500 });
});

test.skip('skipped test is listed as skipped', async () => {});

// ==== HARD 2: Suites, layers and ids for a clean tree ====
// > `parentSuite`, `suite` and `subSuite` control the folders. `layer` marks the kind of test (ui, api). `allureId` links to a test case management id.
test('custom suite tree and layer', async ({ request }) => {
  await allure.parentSuite('Regression');
  await allure.suite('API');
  await allure.subSuite('Products');
  await allure.layer('api');
  await allure.allureId('1234');
  const response = await request.get('/api/products');
  expect(response.status()).toBe(200);
});

// ==== HARD 3: Log API calls as steps with request and response ====
// > Wrap important API calls in a step and attach the request and response so a failure can be understood from the report alone.
test('API call recorded with attachments', async ({ request }) => {
  const payload = { name: 'Allure Item', price: 5 };
  const created = await allure.step('POST /api/products', async () => {
    await allure.attachment('request body', JSON.stringify(payload, null, 2), { contentType: allure.ContentType.JSON });
    const r = await request.post('/api/products', { data: payload });
    await allure.attachment('response body', await r.text(), { contentType: allure.ContentType.JSON });
    return r;
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  await request.delete(`/api/products/${id}`);
});
