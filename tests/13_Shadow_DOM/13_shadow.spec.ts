import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/shadow.html'); });

// ==== BASIC 1: Open shadow roots need no special code ====
// > A shadow root hides a component's inner HTML from the rest of the page. Playwright's `getBy...` and CSS locators look INSIDE open shadow roots automatically.
test('getByLabel and getByRole work inside an open shadow root', async ({ page }) => {
  await page.getByLabel('Name').fill('Asha');
  await page.getByRole('button', { name: 'Save user' }).click();
  await expect(page.getByText('Saved Asha')).toBeVisible();
});

// ==== BASIC 2: CSS selectors also go through shadow roots ====
// > A normal CSS selector such as `user-card #uname` finds the input inside the shadow root. You do not need the `>>` or `/deep/` tricks of older tools.
test('CSS selectors pierce shadow roots', async ({ page }) => {
  await page.locator('user-card #uname').fill('Raj');
  await expect(page.locator('user-card #uname')).toHaveValue('Raj');
  await page.locator('user-card').getByRole('button', { name: 'Save user' }).click();
  await expect(page.locator('user-card #saved')).toHaveText('Saved Raj');
});

// ==== BASIC 3: The host element is a normal element ====
// > The custom tag (`user-card`) is in the normal page. Use it to scope your search to one component.
test('scope to the host element', async ({ page }) => {
  const card = page.locator('user-card');
  await expect(card).toHaveCount(1);
  await card.getByLabel('Name').fill('Meena');
  await expect(card.getByLabel('Name')).toHaveValue('Meena');
});

// ==== INTERMEDIATE 1: Shadow root inside a shadow root ====
// > Components often contain other components. The same locators still work through every level.
test('nested shadow roots', async ({ page }) => {
  await page.getByRole('button', { name: 'Fancy button' }).click();
  await expect(page.getByText('Fancy clicked')).toBeVisible();
  await page.locator('user-card fancy-button #fancy').click();
  await expect(page.locator('user-card fancy-button #fancy-out')).toHaveText('Fancy clicked');
});

// ==== INTERMEDIATE 2: Slots: light DOM shown inside a shadow component ====
// > Content that you write between the tags (the "light DOM") is shown by a `<slot>`. That content belongs to the normal page, so normal locators find it, and the heading gets its name from it.
test('slotted content', async ({ page }) => {
  await expect(page.locator('#light-title')).toHaveText('Title from light DOM');
  await expect(page.getByText('Body from light DOM')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Title from light DOM' })).toBeVisible();
});

// ==== INTERMEDIATE 3: A whole form inside a shadow root ====
// > Labels, inputs and buttons inside a shadow root keep their roles, so accessibility locators work as usual.
test('login form inside a shadow root', async ({ page }) => {
  await page.getByLabel('User').fill('asha');
  await page.getByLabel('Pass').fill('secret');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Welcome asha');
  await page.getByLabel('Pass').fill('wrong');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Denied');
});

// ==== INTERMEDIATE 4: XPath does NOT see inside shadow roots ====
// > This is the main reason to avoid XPath on modern component libraries. CSS and role locators work; XPath finds nothing.
test('XPath cannot pierce shadow DOM', async ({ page }) => {
  await expect(page.locator('xpath=//user-card//button')).toHaveCount(0);
  await expect(page.locator('user-card button')).toHaveCount(2);       // Save user + the nested Fancy button
});

// ==== INTERMEDIATE 5: Light-only matching with css:light ====
// > `css:light=` searches ONLY the normal DOM and skips shadow roots. Use it when the same selector exists both inside and outside a component.
test('css:light ignores shadow content', async ({ page }) => {
  await expect(page.locator('#uname')).toHaveCount(1);
  await expect(page.locator('css:light=#uname')).toHaveCount(0);
  await expect(page.locator('css:light=#light-title')).toHaveCount(1);
});

// ==== INTERMEDIATE 6: Peek inside with evaluate ====
// > For debugging, ask the host element for its `shadowRoot`. This reads the DOM directly and works for OPEN roots only.
test('inspect a shadow root with evaluate', async ({ page }) => {
  const info = await page.locator('user-card').evaluate((host) => ({
    mode: host.shadowRoot?.mode,
    hasInput: !!host.shadowRoot?.querySelector('#uname'),
    childCount: host.shadowRoot?.children.length,
  }));
  expect(info).toEqual({ mode: 'open', hasInput: true, childCount: 4 });
});

// ==== HARD 1: Closed shadow roots cannot be reached ====
// > A closed root (`mode: 'closed'`) hides its content from every script, including Playwright's locators. The page works for a user, but tests find nothing.
test('closed shadow root is invisible to locators', async ({ page }) => {
  await expect(page.locator('closed-widget')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Closed button' })).toHaveCount(0);
});

// ==== HARD 2: Workaround: force closed roots open in test mode ====
// > Override `attachShadow` BEFORE the page scripts run, so every closed root is created as open. Use this only for your own app, in test environments.
test('force closed shadow roots open with an init script', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const original = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init: ShadowRootInit) {
      return original.call(this, { ...init, mode: 'open' });
    };
  });
  const page = await context.newPage();
  await page.goto('/shadow.html');
  await page.getByRole('button', { name: 'Closed button' }).click();
  await expect(page.getByText('Closed clicked')).toBeVisible();
  await context.close();
});

// ==== HARD 3: List every shadow host on the page ====
// > Useful while learning a new page: which elements own a shadow root? (Closed roots report `null`, so they are not listed.)
test('list shadow hosts', async ({ page }) => {
  const hosts = await page.locator('*').evaluateAll((els) =>
    els.filter((el) => (el as HTMLElement).shadowRoot !== null).map((el) => el.tagName.toLowerCase()));
  expect([...new Set(hosts)].sort()).toEqual(['card-slot', 'fancy-button', 'login-shadow', 'user-card']);
});

// ==== HARD 4: Same label in two shadow roots ====
// > When several components use the same label, scope to the host or you get a strict-mode error.
test('scope when two components share a name', async ({ page }) => {
  await expect(page.locator('user-card').getByRole('button')).toHaveCount(2);        // Save user + Fancy button
  await expect(page.locator('login-shadow').getByRole('button')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Save user' })).toHaveCount(1);
});
