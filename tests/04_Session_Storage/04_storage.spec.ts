import { test, expect } from '@playwright/test';
import fs from 'fs';

// ==== BASIC 1: Cookies: read, add, clear ====
// > A cookie is a small value the browser sends with every request. `context.cookies()` lists them. `addCookies` creates one. `clearCookies` removes all.
test('cookies: read, add, clear', async ({ page, context }) => {
  await page.goto('/storage.html');
  await page.getByRole('button', { name: 'Set cookie' }).click();
  let cookies = await context.cookies();
  expect(cookies.find((c) => c.name === 'theme')?.value).toBe('dark');

  await context.addCookies([{ name: 'plan', value: 'pro', url: 'http://localhost:3000' }]);
  cookies = await context.cookies();
  expect(cookies.map((c) => c.name).sort()).toEqual(['plan', 'theme']);

  await context.clearCookies({ name: 'plan' });                    // remove one by name
  expect((await context.cookies()).map((c) => c.name)).toEqual(['theme']);
  await context.clearCookies();
  expect(await context.cookies()).toHaveLength(0);
});

// ==== BASIC 2: localStorage ====
// > localStorage keeps data per website, even after the tab closes. Use `page.evaluate` to read or write it.
test('localStorage get, set, remove', async ({ page }) => {
  await page.goto('/storage.html');
  await page.getByRole('button', { name: 'Set localStorage' }).click();
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBe('abc123');
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));
  expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual(['lang', 'theme', 'token']);
  await page.evaluate(() => localStorage.removeItem('theme'));
  expect(await page.evaluate(() => localStorage.length)).toBe(2);
});

// ==== BASIC 3: sessionStorage ====
// > sessionStorage lives only as long as the TAB. A new tab starts empty. It survives a reload of the same tab.
test('sessionStorage lives in one tab', async ({ page, context }) => {
  await page.goto('/storage.html');
  await page.getByRole('button', { name: 'Set sessionStorage' }).click();
  expect(await page.evaluate(() => sessionStorage.getItem('cart'))).toBe('["pen","book"]');

  await page.reload();                                              // same tab: still there
  expect(await page.evaluate(() => sessionStorage.getItem('cart'))).toBe('["pen","book"]');

  const other = await context.newPage();                            // new tab: empty
  await other.goto('/storage.html');
  expect(await other.evaluate(() => sessionStorage.getItem('cart'))).toBeNull();
});

// ==== INTERMEDIATE 1: Seed storage BEFORE the page loads ====
// > `addInitScript` runs before the page's own scripts. Use it to start a test already logged in or with a feature flag.
test('seed localStorage before load', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('token', 'token-123'));
  await page.goto('/dashboard.html');
  await expect(page.locator('#status')).toHaveText('Welcome back, asha');
});

// ==== INTERMEDIATE 2: HttpOnly cookies are hidden from JavaScript ====
// > A server can mark a cookie HttpOnly so page scripts cannot read it. Playwright can still see it through the context.
test('httpOnly cookie', async ({ page, context }) => {
  await page.goto('/storage.html');
  await page.request.get('/api/set-secure-cookie');
  const cookie = (await context.cookies()).find((c) => c.name === 'sid');
  expect(cookie).toMatchObject({ value: 'server-secret', httpOnly: true, sameSite: 'Lax' });
  expect(await page.evaluate(() => document.cookie)).not.toContain('sid');
});

// ==== INTERMEDIATE 3: Test isolation: every test starts empty ====
// > Each test gets a new context, so storage from a previous test is gone. This is why tests do not affect each other.
test.describe('isolation', () => {
  test('writes storage', async ({ page }) => {
    await page.goto('/storage.html');
    await page.getByRole('button', { name: 'Set localStorage' }).click();
    expect(await page.evaluate(() => localStorage.length)).toBe(2);
  });
  test('starts empty again', async ({ page }) => {
    await page.goto('/storage.html');
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
  });
});

// ==== INTERMEDIATE 4: storageState saves cookies and localStorage ====
// > `context.storageState()` returns an object (or writes a file). Load it into a NEW context to reuse a login.
test('storageState round trip', async ({ page, browser }, testInfo) => {
  await page.goto('/storage.html');
  await page.getByRole('button', { name: 'Set cookie' }).click();
  await page.getByRole('button', { name: 'Set localStorage' }).click();
  const file = testInfo.outputPath('state.json');
  const state = await page.context().storageState({ path: file });
  expect(state.cookies.map((c) => c.name)).toContain('theme');
  expect(state.origins[0].localStorage.map((i) => i.name).sort()).toEqual(['lang', 'token']);

  const fresh = await browser.newContext({ storageState: file });
  const page2 = await fresh.newPage();
  await page2.goto('/storage.html');
  expect(await page2.evaluate(() => localStorage.getItem('token'))).toBe('abc123');
  await fresh.close();
  expect(JSON.parse(fs.readFileSync(file, 'utf-8')).origins).toHaveLength(1);
});

// ==== HARD 1: storageState does NOT include sessionStorage ====
// > This surprises many people. sessionStorage is tied to one tab, so it is not saved. To restore it, save it yourself and put it back with `addInitScript`.
test('restore sessionStorage by hand', async ({ page, browser }) => {
  await page.goto('/storage.html');
  await page.getByRole('button', { name: 'Set sessionStorage' }).click();
  const state = await page.context().storageState();
  expect(JSON.stringify(state)).not.toContain('cart');               // not in storageState!

  const saved = await page.evaluate(() => JSON.stringify(sessionStorage));   // save it yourself

  const fresh = await browser.newContext();
  await fresh.addInitScript((data) => {                              // put it back before page scripts run
    if (window.location.hostname === 'localhost') {
      for (const [k, v] of Object.entries(JSON.parse(data))) sessionStorage.setItem(k, v as string);
    }
  }, saved);
  const page2 = await fresh.newPage();
  await page2.goto('/storage.html');
  expect(await page2.evaluate(() => sessionStorage.getItem('cart'))).toBe('["pen","book"]');
  await fresh.close();
});

// ==== HARD 2: IndexedDB in storageState ====
// > Newer Playwright can also save IndexedDB data when you ask for it with `indexedDB: true`.
test('storageState with IndexedDB', async ({ page }) => {
  await page.goto('/storage.html');
  await page.getByRole('button', { name: 'Save to IndexedDB' }).click();
  await expect(page.locator('#out')).toHaveAttribute('data-idb', 'saved');
  const state = await page.context().storageState({ indexedDB: true });
  expect(JSON.stringify(state.origins)).toContain('appdb');
});

// ==== HARD 3: Typing in a field keeps a draft in sessionStorage ====
// > A real-world use: a form that remembers unsent text. A reload keeps it, a new tab does not.
test('draft survives a reload', async ({ page }) => {
  await page.goto('/storage.html');
  await page.getByLabel('Draft').fill('unsent message');
  await page.reload();
  await expect(page.getByLabel('Draft')).toHaveValue('unsent message');
});
