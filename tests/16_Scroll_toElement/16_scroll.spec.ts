import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/scroll.html'); });

const scrollY = (page: import('@playwright/test').Page) => page.evaluate(() => window.scrollY);

// ==== BASIC 1: Playwright scrolls for you ====
// > Before a click Playwright scrolls the element into view. You usually do NOT need to scroll yourself.
test('click auto-scrolls to the element', async ({ page }) => {
  expect(await scrollY(page)).toBe(0);
  await page.getByRole('button', { name: 'Footer button' }).click();
  await expect(page.locator('#footer-out')).toHaveText('Footer clicked');
  expect(await scrollY(page)).toBeGreaterThan(1000);
});

// ==== BASIC 2: scrollIntoViewIfNeeded and toBeInViewport ====
// > `scrollIntoViewIfNeeded()` brings the element on screen. `toBeInViewport()` checks that it is visible in the window (different from `toBeVisible`, which only checks that it is rendered).
test('scrollIntoViewIfNeeded and toBeInViewport', async ({ page }) => {
  const footerBtn = page.getByRole('button', { name: 'Footer button' });
  await expect(footerBtn).toBeVisible();
  await expect(footerBtn).not.toBeInViewport();
  await footerBtn.scrollIntoViewIfNeeded();
  await expect(footerBtn).toBeInViewport();
});

// ==== BASIC 3: Scroll the window with JavaScript ====
// > `window.scrollTo(x, y)` jumps to a position. `document.body.scrollHeight` is the full height of the page.
test('scrollTo top and bottom', async ({ page }) => {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => scrollY(page)).toBeGreaterThan(1500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => scrollY(page)).toBe(0);
});

// ==== BASIC 4: Mouse wheel ====
// > `mouse.wheel(dx, dy)` scrolls like a real wheel. It scrolls whatever is under the mouse pointer.
test('mouse wheel', async ({ page }) => {
  await page.mouse.move(200, 300);
  await page.mouse.wheel(0, 1000);
  await expect.poll(() => scrollY(page)).toBeGreaterThanOrEqual(900);
});

// ==== INTERMEDIATE 1: A sticky header can cover elements ====
// > A fixed or sticky header may sit on top of the element after scrolling. Playwright detects that the click would hit the header, scrolls differently and retries, so the click still works.
test('sticky header does not block the click', async ({ page }) => {
  await page.evaluate(() => window.scrollTo(0, 80));                      // button now sits under the sticky header area
  await page.getByRole('button', { name: 'First button' }).click();
  await expect(page.getByRole('button', { name: 'First button' })).toBeVisible();
});

// ==== INTERMEDIATE 2: Content that loads when scrolled into view (lazy loading) ====
// > Lazy content appears only after the element becomes visible. Scroll to it, then use an assertion that waits.
test('lazy loading', async ({ page }) => {
  await expect(page.locator('#lazy-1')).toHaveText('Not loaded');
  await page.locator('#lazy-1').scrollIntoViewIfNeeded();
  await expect(page.locator('#lazy-1')).toHaveText('Loaded lazy-1');
  await page.locator('#lazy-2').scrollIntoViewIfNeeded();
  await expect(page.locator('#lazy-2')).toHaveText('Loaded lazy-2');
});

// ==== INTERMEDIATE 3: Horizontal scrolling ====
// > A wide strip scrolls sideways. `scrollIntoViewIfNeeded` also scrolls inside containers, left and right.
test('horizontal scroll container', async ({ page }) => {
  const strip = page.locator('#h-scroll');
  await expect(page.locator('#far-card')).not.toBeInViewport({ ratio: 1 });
  expect(await strip.evaluate((el) => el.scrollLeft)).toBe(0);
  await page.locator('#far-card').scrollIntoViewIfNeeded();
  await expect(page.locator('#far-card')).toBeInViewport({ ratio: 1 });
  expect(await strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
});

// ==== INTERMEDIATE 4: Scrolling inside a panel ====
// > A scrollable box inside the page has its own scroll position. Set `scrollTop` or scroll the target row into view.
test('scroll inside a panel', async ({ page }) => {
  const panel = page.getByLabel('Scrollable panel');
  expect(await panel.evaluate((el) => el.scrollTop)).toBe(0);
  await page.locator('#deep-row').scrollIntoViewIfNeeded();
  expect(await panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  await panel.evaluate((el) => { el.scrollTop = 0; });
  expect(await panel.evaluate((el) => el.scrollTop)).toBe(0);
});

// ==== INTERMEDIATE 5: A button that appears after scrolling ====
// > "Back to top" shows only after you scroll down. Scroll, check it appears, click it, check you are at the top.
test('back to top button', async ({ page }) => {
  const toTop = page.getByRole('button', { name: 'Back to top' });
  await expect(toTop).toBeHidden();
  await page.mouse.wheel(0, 800);
  await expect(toTop).toBeVisible();
  await toTop.click();
  await expect.poll(() => scrollY(page)).toBe(0);
  await expect(toTop).toBeHidden();
});

// ==== HARD 1: Scroll until an element appears (infinite scroll) ====
// > Keep scrolling the list while checking for the target. `expect.poll` runs your function again and again until it returns the wanted value.
test('scroll until Post 30 exists', async ({ page }) => {
  await page.goto('/extras.html');
  const feed = page.getByRole('feed', { name: 'News feed' });
  const target = feed.getByRole('article').filter({ hasText: /^Post 30$/ });
  await expect.poll(async () => {
    await feed.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    return target.count();
  }, { timeout: 10_000 }).toBe(1);
  await expect(feed.getByRole('article')).toHaveCount(30);
});

// ==== HARD 2: Assert a scroll position ====
// > Scroll positions change gradually, so read them with `expect.poll`, not once.
test('scroll position assertions', async ({ page }) => {
  await page.locator('#section-3').scrollIntoViewIfNeeded();
  await expect.poll(() => scrollY(page)).toBeGreaterThan(1000);
  await page.keyboard.press('Home');
  await expect.poll(() => scrollY(page)).toBe(0);
});

// ==== HARD 3: Keyboard scrolling ====
// > `PageDown`, `PageUp`, `End` and `Home` scroll the page like a user.
test('keyboard scrolling', async ({ page }) => {
  await page.locator('body').click({ position: { x: 5, y: 200 } });
  await page.keyboard.press('PageDown');
  await expect.poll(() => scrollY(page)).toBeGreaterThan(300);
  await page.keyboard.press('End');
  await expect.poll(() => scrollY(page)).toBeGreaterThan(2000);
});

// ==== HARD 4: hover and focus also scroll ====
// > Any action that needs the element on screen scrolls it first. `hover` and `focus` are examples; `toBeInViewport({ ratio })` checks how much is visible.
test('hover scrolls the element into view', async ({ page }) => {
  const footerBtn = page.getByRole('button', { name: 'Footer button' });
  await footerBtn.hover();
  await expect(footerBtn).toBeInViewport({ ratio: 1 });
});
