import { test, expect, Frame, Page } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/frames.html'); });

// ==== BASIC 1: Work inside an iframe ====
// > An iframe is a separate page inside your page. A normal locator cannot see inside it. `frameLocator` takes you inside, then you use the usual `getBy` methods. Playwright has no "switch to frame" step.
test('frameLocator: fill and click inside an iframe', async ({ page }) => {
  const frame = page.frameLocator('#simple');
  await frame.getByLabel('Card number').fill('4242 4242 4242 4242');
  await frame.getByRole('button', { name: 'Pay now' }).click();
  await expect(frame.locator('#paid')).toHaveText('Paid with 4242 4242 4242 4242');
});

// ==== BASIC 2: The page and the frame are separate worlds ====
// > Elements outside the frame are reached with `page`. Elements inside need the frame. A locator that is not scoped to the frame will not find frame content.
test('page locators do not see inside a frame', async ({ page }) => {
  await expect(page.locator('#outer-text')).toHaveText('Text outside all frames');
  await expect(page.getByLabel('Card number')).toHaveCount(0);                          // lives in the frame
  await expect(page.frameLocator('#simple').getByLabel('Card number')).toHaveCount(1);
});

// ==== BASIC 3: Choose the iframe by title, id, name or position ====
// > Any CSS selector works. A `title` attribute is a good, readable choice. `.first()`, `.last()` and `.nth()` pick one of many.
test('select an iframe in different ways', async ({ page }) => {
  await expect(page.frameLocator('iframe[title="Simple frame"]').getByRole('button', { name: 'Pay now' })).toBeVisible();
  await expect(page.frameLocator('iframe[name="simple-frame"]').getByLabel('Card number')).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(3);
  await expect(page.frameLocator('iframe').first().getByLabel('Card number')).toBeVisible();
});

// ==== INTERMEDIATE 1: Nested iframes ====
// > A frame inside a frame: chain `frameLocator` twice. The order is outside to inside.
test('nested iframes', async ({ page }) => {
  const inner = page.frameLocator('#outer').frameLocator('#inner');
  await expect(page.frameLocator('#outer').getByRole('heading', { name: 'Outer frame heading' })).toBeVisible();
  await inner.getByLabel('Inner name').fill('Asha');
  await inner.getByRole('button', { name: 'Inner submit' }).click();
  await expect(inner.locator('#iout')).toHaveText('Hello Asha');
});

// ==== INTERMEDIATE 2: The Frame object: list and find frames ====
// > `page.frames()` lists every frame including the main one. `page.frame({ name })` or `({ url })` returns a `Frame`. A `Frame` has the same `locator`, `getBy...` and `url()` methods as a page.
test('page.frames, frame by name and by url', async ({ page }) => {
  await expect(page.locator('#inner-btn')).toHaveCount(0);
  await expect.poll(() => page.frames().length).toBeGreaterThanOrEqual(5);      // main + simple + outer + inner + srcdoc

  const byName = page.frame({ name: 'simple-frame' })!;
  expect(byName.url()).toContain('/frame.html');
  await byName.getByLabel('Card number').fill('1111');
  await expect(byName.locator('#card')).toHaveValue('1111');

  const byUrl = page.frame({ url: /frame-inner\.html/ })!;
  await byUrl.getByLabel('Inner name').fill('Raj');
  await expect(byUrl.getByLabel('Inner name')).toHaveValue('Raj');
  expect(byUrl.parentFrame()!.url()).toContain('frame-outer.html');
});

// ==== INTERMEDIATE 3: Frame tree ====
// > Each frame knows its parent and children, so you can print or search the whole tree.
test('frame tree', async ({ page }) => {
  await expect.poll(() => page.mainFrame().childFrames().length).toBe(3);
  const urls = page.mainFrame().childFrames().map((f) => f.url());
  expect(urls.some((u) => u.endsWith('/frame.html'))).toBe(true);
  const outer = page.frame({ url: /frame-outer\.html/ })!;
  expect(outer.childFrames()).toHaveLength(1);
});

// ==== INTERMEDIATE 4: srcdoc iframes ====
// > An iframe whose HTML is written directly in the `srcdoc` attribute is still a normal frame for Playwright.
test('srcdoc iframe', async ({ page }) => {
  const doc = page.frameLocator('iframe[title="Inline frame"]');
  await doc.getByRole('button', { name: 'Press me' }).click();
  await expect(doc.locator('#msg')).toHaveText('Clicked inside srcdoc');
});

// ==== INTERMEDIATE 5: Move between locator and frame ====
// > `locator.contentFrame()` turns an iframe element into a FrameLocator. `frameLocator.owner()` goes back to the iframe element so you can check its attributes.
test('contentFrame and owner', async ({ page }) => {
  const fl = page.locator('#simple').contentFrame();
  await fl.getByLabel('Card number').fill('999');
  await expect(fl.getByLabel('Card number')).toHaveValue('999');
  const iframeElement = page.frameLocator('#simple').owner();
  await expect(iframeElement).toHaveAttribute('title', 'Simple frame');
  await expect(iframeElement).toHaveAttribute('width', '320');
});

// ==== HARD 1: An iframe that appears later ====
// > `frameLocator` is lazy like every locator. It waits for the iframe to be added, so no sleep is needed. You can also listen for frame events.
test('dynamic iframe', async ({ page }) => {
  const attached = page.waitForEvent('frameattached');
  await page.getByRole('button', { name: 'Add iframe' }).click();
  await attached;
  const late = page.frameLocator('iframe[title="Late frame"]');
  await late.getByLabel('Card number').fill('555');
  await expect(late.getByLabel('Card number')).toHaveValue('555');
  await expect(page.locator('iframe')).toHaveCount(4);
});

// ==== HARD 2: Strict mode with several iframes ====
// > If your frame selector matches more than one iframe, Playwright refuses to guess, exactly like a normal locator. Make the selector specific.
test('ambiguous iframe selector', async ({ page }) => {
  await expect(
    page.frameLocator('iframe').getByLabel('Card number').fill('x', { timeout: 2000 }),
  ).rejects.toThrow(/strict mode violation/);
  await page.frameLocator('iframe[title="Simple frame"]').getByLabel('Card number').fill('ok');
});

// ==== HARD 3: Search every frame for an element ====
// > When you do not know which frame holds the element, loop over `page.frames()` and ask each one.
async function findFrameWith(page: Page, selector: string): Promise<Frame | undefined> {
  for (const frame of page.frames()) {
    if ((await frame.locator(selector).count()) > 0) return frame;
  }
  return undefined;
}

test('find the frame that contains an element', async ({ page }) => {
  await expect.poll(() => page.frames().length).toBeGreaterThanOrEqual(5);
  const frame = await findFrameWith(page, '#isubmit');
  expect(frame?.url()).toContain('frame-inner.html');
  await frame!.getByLabel('Inner name').fill('Meena');
  await frame!.locator('#isubmit').click();
  await expect(frame!.locator('#iout')).toHaveText('Hello Meena');
});

// ==== HARD 4: Wait for a frame to finish loading ====
// > After navigation inside a frame, `frame.waitForLoadState()` waits for it. Normally assertions on frame content are enough.
test('frame load state and url assertion', async ({ page }) => {
  const frame = page.frame({ name: 'simple-frame' })!;
  await frame.waitForLoadState('domcontentloaded');
  await expect(frame.locator('h1, label').first()).toBeVisible();
  expect(frame.name()).toBe('simple-frame');
});
