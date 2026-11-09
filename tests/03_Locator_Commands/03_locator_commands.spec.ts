import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page, request }) => {
  await request.post('/api/reset');
  await page.goto('/shop.html');
  await expect(page.locator('.product')).toHaveCount(3);
});

// ==== BASIC 1: Count, first, last, nth ====
// > `count()` gives the number of matches right now. `first()`, `last()` and `nth(i)` pick one. `nth(-1)` is the last item.
test('count, first, last, nth', async ({ page }) => {
  const items = page.locator('.product');
  expect(await items.count()).toBe(3);
  await expect(items.first()).toContainText('Laptop');
  await expect(items.last()).toContainText('Headphones');
  await expect(items.nth(1)).toContainText('Phone');
  await expect(items.nth(-1)).toContainText('Headphones');
});

// ==== BASIC 2: Reading text ====
// > `textContent()` returns all text (even hidden). `innerText()` returns what is shown. `allTextContents()` returns an array for many elements. All of these read ONCE and do not wait.
test('textContent, innerText, allTextContents', async ({ page }) => {
  const name = page.locator('.product .name').first();
  expect(await name.textContent()).toBe('Laptop');
  expect(await name.innerText()).toBe('Laptop');
  expect(await page.locator('.product .name').allTextContents()).toEqual(['Laptop', 'Phone', 'Headphones']);
  expect(await page.locator('.product .price').allInnerTexts()).toEqual(['$900', '$500', '$100']);
});

// ==== BASIC 3: Reading values and attributes ====
// > `inputValue()` reads what the user typed. `getAttribute()` reads an HTML attribute.
test('inputValue and getAttribute', async ({ page }) => {
  await page.getByLabel('Email').fill('asha@example.com');
  expect(await page.getByLabel('Email').inputValue()).toBe('asha@example.com');
  expect(await page.locator('#login-btn').getAttribute('type')).toBe('submit');
  expect(await page.getByLabel('Email').getAttribute('placeholder')).toBe('you@example.com');
  expect(await page.locator('#nope').count()).toBe(0);
});

// ==== BASIC 4: State checks ====
// > `isVisible`, `isEnabled`, `isChecked`, `isEditable` answer right now (no waiting). Prefer the `expect(...)` versions for assertions.
test('is... state methods', async ({ page }) => {
  expect(await page.locator('#login-btn').isVisible()).toBe(true);
  expect(await page.locator('#login-btn').isEnabled()).toBe(true);
  expect(await page.getByRole('checkbox', { name: 'Remember me' }).isChecked()).toBe(false);
  expect(await page.getByLabel('Email').isEditable()).toBe(true);
  expect(await page.getByRole('button', { name: 'Delete' }).nth(2).isDisabled()).toBe(true);
});

// ==== INTERMEDIATE 1: Looping over many elements ====
// > `all()` returns an array of locators (a snapshot). Wait for the list to load first. Loop with `for...of` so each `await` runs in order.
test('loop with all()', async ({ page }) => {
  const names: string[] = [];
  for (const card of await page.locator('.product').all()) {
    names.push(await card.locator('.name').innerText());
  }
  expect(names).toEqual(['Laptop', 'Phone', 'Headphones']);
});

// ==== INTERMEDIATE 2: Chaining locators ====
// > A locator can search inside another locator. Reading from left to right narrows the search each time.
test('chain locator inside locator', async ({ page }) => {
  const phone = page.locator('.product', { hasText: 'Phone' }).filter({ hasNotText: 'Headphones' });
  await expect(phone).toHaveCount(1);
  await phone.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByRole('link', { name: /^Cart/ })).toHaveText('Cart (1)');
});

// ==== INTERMEDIATE 3: Position and size ====
// > `boundingBox()` returns x, y, width, height of the element on the page. Useful for clicks at a position and for layout checks.
test('boundingBox and click at a position', async ({ page }) => {
  const box = await page.locator('#login-btn').boundingBox();
  expect(box!.width).toBeGreaterThan(20);
  expect(box!.height).toBeGreaterThan(10);
  await page.getByLabel('Email').fill('asha@example.com');
  await page.getByLabel('Password').fill('secret');
  await page.locator('#login-btn').click({ position: { x: 5, y: 5 } });
  await expect(page.getByRole('alert')).toContainText('Welcome');
});

// ==== INTERMEDIATE 4: Focus, blur and key presses on an element ====
// > Many actions exist directly on the locator: `focus`, `blur`, `press`, `selectText`, `hover`, `dblclick`.
test('focus, press and selectText', async ({ page }) => {
  const email = page.getByLabel('Email');
  await email.focus();
  await expect(email).toBeFocused();
  await email.pressSequentially('hello');
  await email.selectText();
  await email.press('Backspace');
  await expect(email).toHaveValue('');
  await email.blur();
  await expect(email).not.toBeFocused();
});

// ==== INTERMEDIATE 5: Wait for an element state ====
// > `waitFor` waits for `attached`, `detached`, `visible` or `hidden`. Most of the time assertions are better; use `waitFor` when you need no assertion.
test('waitFor state', async ({ page }) => {
  await page.goto('/widgets.html');
  await page.getByRole('button', { name: 'Load data' }).click();
  await page.getByText('Data loaded').waitFor({ state: 'visible' });
  await page.locator('#nothing-here').waitFor({ state: 'detached' });
});

// ==== HARD 1: evaluate and evaluateAll ====
// > Run a function against the element(s) inside the browser. `evaluateAll` is much faster than a loop when you need data from many elements.
test('evaluate and evaluateAll', async ({ page }) => {
  const tag = await page.locator('#login-btn').evaluate((el) => el.tagName);
  expect(tag).toBe('BUTTON');
  const total = await page.locator('.product .price').evaluateAll((els) =>
    els.reduce((sum, el) => sum + Number(el.textContent!.replace('$', '')), 0));
  expect(total).toBe(1500);
});

// ==== HARD 2: dispatchEvent and screenshots of one element ====
// > `dispatchEvent('click')` sends a raw event without the checks of a real click (use for odd widgets). `screenshot()` captures only that element.
test('dispatchEvent and element screenshot', async ({ page }, testInfo) => {
  await page.getByLabel('Email').fill('asha@example.com');
  await page.getByLabel('Password').fill('secret');
  await page.locator('#login-btn').dispatchEvent('click');
  await expect(page.getByRole('alert')).toContainText('Welcome');
  const shot = await page.locator('#login-form').screenshot({ path: testInfo.outputPath('form.png') });
  expect(shot.byteLength).toBeGreaterThan(500);
});

// ==== HARD 3: and, or, and describe ====
// > `and` requires both conditions, `or` accepts either. `describe` gives a locator a readable name that appears in error messages and reports.
test('and, or and describe', async ({ page }) => {
  const signIn = page.getByRole('button').and(page.getByText('Sign in'));
  await expect(signIn).toHaveCount(1);
  const either = page.getByRole('button', { name: 'Sign in' }).or(page.getByRole('link', { name: 'Sign in' }));
  await expect(either).toHaveCount(1);
  const named = page.locator('#login-btn').describe('the Sign in button');
  await expect(named).toBeVisible();
});
