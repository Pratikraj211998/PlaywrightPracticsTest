import { test, expect, devices } from '@playwright/test';

// ==== BASIC 1: The smallest possible test ====
// > A test needs three things: the `test` function, a name, and an `async` body that receives the `page` fixture.
// > `page.goto('/')` opens the base URL from the config, and `expect(...)` checks the result.
test('smallest test: open the home page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Practice Home');
});

// ==== BASIC 2: Navigate, click, and check where you are ====
// > `getByRole('link')` finds a link by what it is and what it says. After the click, `toHaveURL` waits for the new address.
test('click a link and check the URL', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Shop' }).click();
  await expect(page).toHaveURL(/shop\.html/);
  await expect(page.getByRole('heading', { name: 'Demo Shop' })).toBeVisible();
});

// ==== BASIC 3: Back, forward and reload ====
// > Playwright keeps the browser history. `goBack`, `goForward` and `reload` work like the browser buttons.
test('history: back, forward, reload', async ({ page }) => {
  await page.goto('/');
  await page.goto('/shop.html');
  await page.goBack();
  await expect(page).toHaveURL('/');
  await page.goForward();
  await expect(page).toHaveURL(/shop/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Demo Shop' })).toBeVisible();
});

// ==== BASIC 4: Group tests with describe and share setup with beforeEach ====
// > `test.describe` groups tests. `beforeEach` runs before every test in the group. Each test still gets its own fresh page.
test.describe('Shop page', () => {
  test.beforeEach(async ({ page, request }) => {
    await request.post('/api/reset');
    await page.goto('/shop.html');
  });

  test('shows the products', async ({ page }) => {
    await expect(page.locator('.product')).toHaveCount(3);
  });

  test('has a login form', async ({ page }) => {
    await expect(page.getByLabel('Email')).toBeVisible();
  });
});

// ==== INTERMEDIATE 1: Reading information from the page ====
// > `page.title()`, `page.url()` and `page.content()` are plain reads. They do NOT wait, so use them only after the page is ready.
test('read title, url and html', async ({ page }) => {
  await page.goto('/shop.html');
  expect(await page.title()).toBe('Demo Shop');
  expect(page.url()).toContain('/shop.html');
  expect(await page.content()).toContain('<h1>Demo Shop</h1>');
});

// ==== INTERMEDIATE 2: Viewport and testInfo ====
// > `testInfo` describes the running test (title, project, retry number, output folder). `setViewportSize` resizes the window.
test('testInfo and viewport', async ({ page }, testInfo) => {
  expect(testInfo.title).toBe('testInfo and viewport');
  expect(testInfo.project.name).toBe('chromium');
  expect(testInfo.retry).toBe(0);
  await page.setViewportSize({ width: 500, height: 800 });
  expect(page.viewportSize()).toEqual({ width: 500, height: 800 });
});

// ==== INTERMEDIATE 3: Test-level settings with test.use ====
// > `test.use` changes fixture options for every test in the file or describe block.
test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  test('uses the viewport and locale', async ({ page }) => {
    await page.goto('/responsive.html');
    await expect(page.locator('#lang')).toHaveText('Language: fr-FR');
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
  });
});

// ==== INTERMEDIATE 4: Run JavaScript inside the page ====
// > `page.evaluate` runs your function in the browser and returns the (serialisable) result.
test('evaluate in the browser', async ({ page }) => {
  await page.goto('/shop.html');
  const width = await page.evaluate(() => window.innerWidth);
  expect(width).toBeGreaterThan(0);
  const headings = await page.evaluate(() => document.querySelectorAll('h2').length);
  expect(headings).toBe(3);
});

// ==== HARD 1: Two independent users with two contexts ====
// > A context is an isolated session. Two contexts in one test behave like two different people on two computers.
test('two contexts do not share anything', async ({ browser }) => {
  const alice = await browser.newContext();
  const bob = await browser.newContext();
  const a = await alice.newPage();
  const b = await bob.newPage();

  await a.goto('/storage.html');
  await a.getByRole('button', { name: 'Set localStorage' }).click();
  await b.goto('/storage.html');

  await expect(a.locator('#out')).toContainText('abc123');
  await expect(b.locator('#out')).not.toContainText('abc123');
  await alice.close();
  await bob.close();
});

// ==== HARD 2: Handle a new tab ====
// > A link with `target="_blank"` opens another page in the same context. Listen for the popup BEFORE clicking.
test('new tab opened by a link', async ({ page, context }) => {
  await page.goto('/widgets.html');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Open popup page' }).click();
  const popup = await popupPromise;
  await expect(popup.getByRole('heading', { name: 'Popup page' })).toBeVisible();
  expect(context.pages()).toHaveLength(2);
  await popup.close();
  expect(context.pages()).toHaveLength(1);
});

// ==== HARD 3: A browser you launch yourself (library mode inside a test) ====
// > Sometimes you need a browser with special launch options. `chromium.launch()` gives you a raw browser; you must close it yourself. A device preset also contains `defaultBrowserType`, which is not a context option, so remove it before passing the rest to `newContext`.
test('launch a browser manually', async () => {
  const { chromium } = await import('@playwright/test');
  const { defaultBrowserType, ...pixel } = devices['Pixel 7'];
  void defaultBrowserType;
  const browser = await chromium.launch();
  const context = await browser.newContext(pixel);
  const page = await context.newPage();
  await page.goto('http://localhost:3000/responsive.html');
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
  await browser.close();
});
test('has title', async ({ page }) => {
  await page.goto('https://playwright.dev/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Playwright/);
});