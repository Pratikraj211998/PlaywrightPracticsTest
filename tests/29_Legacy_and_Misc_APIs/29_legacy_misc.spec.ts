import { test, expect, selectors } from '@playwright/test';

// ==== BASIC 1: The old "selector string" methods still work ====
// > Older code calls `page.click('#id')`, `page.fill('#id', 'text')` and so on. They still run, but the Playwright team recommends locators because locators are lazy and easier to reuse. Learn to READ the old style, and WRITE the new style.
test('legacy page.click / fill / check / selectOption', async ({ page }) => {
  await page.goto('/shop.html');
  await page.fill('#email', 'asha@example.com');                  // modern: page.getByLabel('Email').fill(...)
  await page.fill('#pwd', 'secret');
  await page.check('input[name="remember"]');                    // modern: getByRole('checkbox', ...).check()
  await page.click('#login-btn');                                // modern: getByRole('button', ...).click()
  await page.waitForFunction(() => document.querySelector('#msg')!.textContent !== '');   // the old read methods do NOT wait, so wait first
  expect(await page.textContent('#msg')).toContain('Welcome');   // modern: await expect(locator).toContainText(...) waits by itself
  expect(await page.isVisible('#login-btn')).toBe(true);         // modern: await expect(locator).toBeVisible()
  expect(await page.inputValue('#email')).toBe('asha@example.com');
  expect(await page.getAttribute('#login-btn', 'type')).toBe('submit');
  await page.selectOption('#sort', 'Name');
  expect(await page.innerText('h1')).toBe('Demo Shop');
});

// ==== BASIC 2: ElementHandles: $, $$, $eval, $$eval ====
// > An `ElementHandle` points to ONE element at one moment. It does not wait and can go stale. `page.$` returns the first match (or null), `page.$$` all matches, `$eval` and `$$eval` run a function on them. Prefer `locator.evaluate` and `locator.evaluateAll`.
test('legacy handles', async ({ page }) => {
  await page.goto('/shop.html');
  await page.waitForSelector('.product');                        // modern: await expect(locator).toHaveCount(...)
  const first = await page.$('.product');                        // modern: page.locator('.product').first()
  expect(first).not.toBeNull();
  expect(await first!.textContent()).toContain('Laptop');
  expect((await page.$$('.product')).length).toBe(3);
  expect(await page.$('#does-not-exist')).toBeNull();
  expect(await page.$eval('#login-btn', (el) => el.textContent)).toBe('Sign in');
  expect(await page.$$eval('.product .name', (els) => els.map((e) => e.textContent))).toEqual(['Laptop', 'Phone', 'Headphones']);
  const handle = await page.locator('#login-btn').elementHandle();       // from a locator to a handle, if an old API needs it
  expect(await handle!.getAttribute('id')).toBe('login-btn');
  expect((await page.locator('.product').elementHandles()).length).toBe(3);
});

// ==== BASIC 3: waitForNavigation is deprecated ====
// > `page.waitForNavigation()` is racy and deprecated. Use `page.waitForURL()` or an assertion on the new URL.
test('waitForURL instead of waitForNavigation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Shop' }).click();
  await page.waitForURL('**/shop.html');
  await expect(page).toHaveURL(/shop\.html/);
});

// ==== INTERMEDIATE 1: Add your own CSS and JavaScript to the page ====
// > `addStyleTag` injects CSS (for example to switch off animations, or to highlight an element while debugging). `addScriptTag` injects JavaScript, from a string or a file.
test('addStyleTag and addScriptTag', async ({ page }) => {
  await page.goto('/shop.html');
  await page.addStyleTag({ content: '#login-btn { outline: 3px solid magenta; }' });
  await expect(page.locator('#login-btn')).toHaveCSS('outline-color', 'rgb(255, 0, 255)');
  await page.addScriptTag({ content: 'window.helper = (n) => n * 2;' });
  expect(await page.evaluate(() => (window as unknown as { helper: (n: number) => number }).helper(21))).toBe(42);
});

// ==== INTERMEDIATE 2: exposeBinding: like exposeFunction, plus the source ====
// > The first argument of a binding tells you WHICH page and frame called it. Useful when many pages share one binding.
test('exposeBinding gets the source page', async ({ page }) => {
  const calls: { value: string; sameFrame: boolean }[] = [];
  await page.exposeBinding('report', (source, value: string) => { calls.push({ value, sameFrame: source.frame === page.mainFrame() }); });
  await page.goto('/');
  await page.evaluate(() => (window as unknown as { report: (v: string) => void }).report('hello'));
  expect(calls).toEqual([{ value: 'hello', sameFrame: true }]);
});

// ==== INTERMEDIATE 3: Drag and drop with two selectors ====
// > `page.dragAndDrop(sourceSelector, targetSelector)` is the one-line version of `locator.dragTo`.
test('page.dragAndDrop', async ({ page }) => {
  await page.goto('/interactions.html');
  await page.dragAndDrop('#d1', '#bin');
  await expect(page.locator('#bin-out')).toHaveText('Dropped: Item 1');
});

// ==== INTERMEDIATE 4: Tabs: opener, bringToFront and close events ====
// > A popup knows the page that opened it. `bringToFront` activates a tab (useful when a test must interact with focus and visibility). `page.on('close')` tells when a tab is closed.
test('opener, bringToFront and close', async ({ page, context }) => {
  await page.goto('/widgets.html');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Open popup page' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(await popup.opener()).toBe(page);
  expect(await page.opener()).toBeNull();
  await popup.bringToFront();
  expect(await popup.evaluate(() => document.visibilityState)).toBe('visible');
  const closed = popup.waitForEvent('close');
  await popup.close();
  await closed;
  expect(popup.isClosed()).toBe(true);
  expect(context.pages()).toEqual([page]);
});

// ==== INTERMEDIATE 5: Permissions and location on an existing context ====
// > `context.grantPermissions`, `clearPermissions` and `setGeolocation` change these settings DURING a test (the context options set them at the start).
test('grant, change and clear permissions', async ({ page, context }) => {
  await page.goto('/widgets.html');
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 48.85, longitude: 2.35 });
  await page.getByRole('button', { name: 'Get location' }).click();
  await expect(page.locator('#coords')).toHaveText('48.85,2.35');
  await context.setGeolocation({ latitude: 35.68, longitude: 139.69 });
  await page.getByRole('button', { name: 'Get location' }).click();
  await expect(page.locator('#coords')).toHaveText('35.68,139.69');
  await context.clearPermissions();
  await page.getByRole('button', { name: 'Get location' }).click();
  await expect(page.locator('#coords')).toHaveText('Location denied');
});

// ==== INTERMEDIATE 6: Touch screen ====
// > A mobile context with touch has `page.touchscreen.tap(x, y)`. `locator.tap()` is usually easier.
test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('touchscreen.tap by coordinates', async ({ page }) => {
    await page.goto('/shop.html');
    await expect(page.locator('.product')).toHaveCount(3);
    const box = (await page.getByTestId('product-1').getByRole('button', { name: 'Add to cart' }).boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByRole('link', { name: /^Cart/ })).toHaveText('Cart (1)');
  });
});

// ==== INTERMEDIATE 7: Another attribute for test ids ====
// > Teams that use `data-qa` or `data-cy` instead of `data-testid` set it once: in the config (`use: { testIdAttribute: 'data-qa' }`) or in code with `selectors.setTestIdAttribute`. Reset it afterwards because it is global.
test('custom test id attribute', async ({ page }) => {
  await page.setContent('<button data-qa="save-btn">Save</button><button data-testid="other">Other</button>');
  selectors.setTestIdAttribute('data-qa');
  await expect(page.getByTestId('save-btn')).toHaveText('Save');
  await expect(page.getByTestId('other')).toHaveCount(0);
  selectors.setTestIdAttribute('data-testid');
  await expect(page.getByTestId('other')).toHaveText('Other');
});

// ==== HARD 1: JSHandle: a reference to something inside the browser ====
// > `evaluateHandle` returns a handle to an object that stays in the page (a DOM node, a big object). Read parts with `getProperty`, `getProperties` and `jsonValue`. Dispose of handles you no longer need.
test('JSHandle', async ({ page }) => {
  await page.goto('/shop.html');
  const handle = await page.evaluateHandle(() => ({ title: document.title, nested: { a: 1, b: [1, 2] }, body: document.body }));
  expect(await (await handle.getProperty('title')).jsonValue()).toBe('Demo Shop');
  expect(await (await handle.getProperty('nested')).jsonValue()).toEqual({ a: 1, b: [1, 2] });
  const props = await handle.getProperties();
  expect([...props.keys()].sort()).toEqual(['body', 'nested', 'title']);
  const body = (await handle.getProperty('body')).asElement();
  expect(body).not.toBeNull();
  expect(await body!.evaluate((el) => el.tagName)).toBe('BODY');
  await handle.dispose();
});

// ==== HARD 2: Clock: set the system time without stopping timers ====
// > `setSystemTime` changes what `Date.now()` returns but does not fire timers (unlike `fastForward` and `runFor`).
test('clock.setSystemTime', async ({ page }) => {
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
  await page.goto('/');
  expect(await page.evaluate(() => new Date().getUTCFullYear())).toBe(2030);
  await page.clock.setSystemTime(new Date('2040-06-15T12:00:00Z'));
  expect(await page.evaluate(() => new Date().toISOString())).toMatch(/^2040-06-15T12:00:0/);
});

// ==== HARD 3: Group trace steps and save chunks ====
// > In a trace you can group actions under a name (`tracing.group`) and save a trace in pieces (`startChunk` / `stopChunk`), for example one file per scenario.
test('tracing groups and chunks', async ({ page, context }, testInfo) => {
  await context.tracing.start({ screenshots: true, snapshots: true });
  await context.tracing.group('Open the shop');
  await page.goto('/shop.html');
  await context.tracing.groupEnd();
  await context.tracing.group('Log in');
  await page.getByLabel('Email').fill('asha@example.com');
  await context.tracing.groupEnd();
  const file = testInfo.outputPath('scenario-1.zip');
  await context.tracing.stopChunk({ path: file });
  expect(require('fs').statSync(file).size).toBeGreaterThan(1000);
  await context.tracing.startChunk();
  await page.getByLabel('Password').fill('secret');
  const second = testInfo.outputPath('scenario-2.zip');
  await context.tracing.stopChunk({ path: second });
  expect(require('fs').statSync(second).size).toBeGreaterThan(500);
  await context.tracing.stop();
});

// ==== HARD 4: Web Workers ====
// > A page can start background threads (Web Workers). Playwright lists them with `page.workers()` and raises the `worker` event. You can run code inside a worker with `worker.evaluate`.
test('web workers', async ({ page }) => {
  const workerPromise = page.waitForEvent('worker');
  await page.goto('/');
  await page.evaluate(() => { const blob = new Blob(['self.answer = 6 * 7; setInterval(() => {}, 1000);'], { type: 'text/javascript' }); new Worker(URL.createObjectURL(blob)); });
  const worker = await workerPromise;
  expect(page.workers()).toHaveLength(1);
  await expect.poll(() => worker.evaluate(() => (self as unknown as { answer: number }).answer)).toBe(42);
});

// ==== HARD 5: Event listeners: on, once, off, removeAllListeners ====
// > Pages, contexts and other objects are event emitters. `on` listens, `once` listens one time, `off` and `removeListener` stop one listener, `removeAllListeners` stops all.
test('event emitter methods', async ({ page }) => {
  const seen: string[] = [];
  const onConsole = (m: { text(): string }) => seen.push(m.text());
  page.on('console', onConsole);
  page.once('console', () => seen.push('first only'));
  await page.goto('/');
  await page.evaluate(() => { console.log('a'); console.log('b'); });
  await expect.poll(() => seen).toEqual(['a', 'first only', 'b']);
  page.off('console', onConsole);
  await page.evaluate(() => console.log('c'));
  await page.waitForTimeout(100);
  expect(seen).not.toContain('c');
  page.removeAllListeners('console');
});

// ==== HARD 6: isHidden and friends ====
// > `isHidden` is the opposite of `isVisible`. A locator that matches NOTHING is hidden (and not visible).
test('isHidden', async ({ page }) => {
  await page.goto('/shop.html');
  expect(await page.locator('#nothing').isHidden()).toBe(true);
  expect(await page.locator('#nothing').isVisible()).toBe(false);
  expect(await page.locator('#login-btn').isHidden()).toBe(false);
});

// ==== HARD 7: The last rarely used names ====
// > These are small helpers you may meet in other people's code: `toBeInstanceOf`, `toThrowError` (the same as `toThrow`), `frameElement`, `isDetached`, `browser.isConnected`, `response.headerValues`, CSS coverage, `ElementHandle.waitForElementState` and `ownerFrame`, `addListener` and `prependListener` (like `on`, but the second adds the listener at the FRONT), and three `testInfo` values.
test('rarely used names', async ({ page, browser }, testInfo) => {
  expect([1, 2]).toBeInstanceOf(Array);
  expect(() => { throw new Error('boom'); }).toThrowError('boom');
  expect(browser.isConnected()).toBe(true);
  expect(typeof testInfo.testId).toBe('string');                   // a stable id of this test
  expect(testInfo.repeatEachIndex).toBe(0);                        // which --repeat-each round this is
  expect(typeof testInfo.snapshotSuffix).toBe('string');           // the platform part of baseline names

  await page.goto('/frames.html');
  const frame = page.frame({ name: 'simple-frame' })!;
  const element = await frame.frameElement();                      // the <iframe> element that holds this frame
  expect(await element.getAttribute('id')).toBe('simple');
  expect(frame.isDetached()).toBe(false);

  const [response] = await Promise.all([page.waitForResponse('**/api/products'), page.goto('/shop.html')]);
  expect(await response.headerValues('content-type')).toHaveLength(1);

  const handle = (await page.locator('#login-btn').elementHandle())!;
  await handle.waitForElementState('visible');
  expect(await handle.ownerFrame()).toBe(page.mainFrame());

  const order: string[] = [];
  page.addListener('console', () => order.push('added'));
  page.prependListener('console', () => order.push('prepended'));
  await page.evaluate(() => console.log('x'));
  await expect.poll(() => order).toEqual(['prepended', 'added']);
});

test('CSS coverage', async ({ page }) => {
  await page.coverage.startCSSCoverage();
  await page.goto('/scroll.html');
  const css = await page.coverage.stopCSSCoverage();
  expect(css.length).toBeGreaterThan(0);
});

test('toHaveAccessibleErrorMessage', async ({ page }) => {
  await page.setContent('<input id="e" aria-label="Email" aria-invalid="true" aria-errormessage="err"><div id="err">Email is required</div>');
  await expect(page.getByLabel('Email')).toHaveAccessibleErrorMessage('Email is required');
});
