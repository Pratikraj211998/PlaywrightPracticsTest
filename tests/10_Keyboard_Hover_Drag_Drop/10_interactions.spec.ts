import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/interactions.html'); });

// ==== BASIC 1: Press keys ====
// > `press` sends a key to the focused element or to a locator. Key names follow the browser: Enter, Tab, Escape, ArrowDown, Backspace, F5. Combine with `+`.
test('press single keys and combinations', async ({ page }) => {
  const input = page.getByLabel('Type here');
  await input.press('Enter');
  await expect(page.locator('#key-log')).toHaveText('keydown: Enter');
  await input.press('ArrowDown');
  await expect(page.locator('#key-log')).toHaveText('keydown: ArrowDown');
  await input.press('Control+a');
  await expect(page.locator('#key-log')).toHaveText('keydown: Control+a');
  await input.press('Control+Shift+K');
  await expect(page.locator('#key-log')).toHaveText('keydown: Control+Shift+K');
});

// ==== BASIC 2: Type text ====
// > `fill` sets the whole value at once. `pressSequentially` types one key at a time with an optional delay. `keyboard.type` types into whatever has focus.
test('fill vs pressSequentially vs keyboard.type', async ({ page }) => {
  const input = page.getByLabel('Type here');
  await input.fill('abc');
  await expect(input).toHaveValue('abc');
  await input.clear();
  await input.pressSequentially('xyz', { delay: 30 });
  await expect(page.locator('#key-log')).toHaveText('keydown: z');
  await input.clear();
  await input.focus();
  await page.keyboard.type('Hello');
  await expect(input).toHaveValue('Hello');
});

// ==== BASIC 3: Hover to reveal ====
// > `hover()` moves the mouse over an element. Menus that open on hover appear, and you can then click inside them.
test('hover opens a menu', async ({ page }) => {
  await expect(page.getByRole('link', { name: 'Laptops' })).toBeHidden();
  await page.getByRole('link', { name: 'Products' }).hover();
  await expect(page.getByRole('link', { name: 'Laptops' })).toBeVisible();
});

// ==== BASIC 4: Double click and right click ====
// > `dblclick()` and `click({ button: 'right' })` work on any element. A custom context menu appears; click one of its items.
test('right click opens a custom context menu', async ({ page }) => {
  await page.locator('#ctx-area').click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(page.locator('#ctx-out')).toHaveText('Chose: Delete');
  await expect(page.getByRole('menu')).toBeHidden();
});

// ==== INTERMEDIATE 1: Multi-level hover ====
// > Hover each level in order. A level only stays open while the mouse is over it, so move step by step.
test('multi-level hover menu', async ({ page }) => {
  await page.getByRole('link', { name: 'Products' }).hover();
  await page.getByRole('link', { name: 'Laptops' }).hover();
  await expect(page.getByRole('link', { name: 'Gaming' })).toBeVisible();
  await page.getByRole('link', { name: 'Gaming' }).click();
  await expect(page.locator('#menu-out')).toHaveText('Opened Gaming laptops');
});

// ==== INTERMEDIATE 2: Modifier keys with clicks ====
// > Hold Control or Shift while clicking with the `modifiers` option. Use `ControlOrMeta` to work on Windows, Linux and Mac.
test('ctrl-click and shift-click multi-select', async ({ page }) => {
  const items = page.locator('#multi-list li');
  await items.nth(0).click();
  await items.nth(2).click({ modifiers: ['ControlOrMeta'] });
  await expect(page.locator('#multi-out')).toHaveText('Selected: One,Three');
  await items.nth(4).click({ modifiers: ['Shift'] });
  await expect(page.locator('#multi-out')).toHaveText('Selected: Three,Four,Five');
});

// ==== INTERMEDIATE 3: Low-level keyboard: down, up and insertText ====
// > `keyboard.down` and `keyboard.up` hold a key while you do something else. `insertText` pastes text without key events.
test('keyboard.down and up, insertText', async ({ page }) => {
  const input = page.getByLabel('Type here');
  await input.focus();
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Shift');
  await expect(input).toHaveValue('A');
  await page.keyboard.insertText(' pasted');
  await expect(input).toHaveValue('A pasted');
});

// ==== INTERMEDIATE 4: Copy and paste with the keyboard ====
// > Select all, copy, move focus, paste. The clipboard needs permission in some browsers, so grant it when you read the clipboard directly.
test.describe('copy and paste', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });
  test('copy from one box and paste into another', async ({ page }) => {
    await page.getByLabel('Source').click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+c');
    await page.getByLabel('Target').click();
    await page.keyboard.press('ControlOrMeta+v');
    await expect(page.getByLabel('Target')).toHaveValue('Playwright');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Playwright');
  });
});

// ==== INTERMEDIATE 5: HTML5 drag and drop ====
// > `dragTo` moves an element onto a target. It works with pages that use the browser's drag events.
test('drag and drop with dragTo', async ({ page }) => {
  await page.locator('#d1').dragTo(page.getByRole('region', { name: 'Bin' }));
  await expect(page.locator('#bin-out')).toHaveText('Dropped: Item 1');
  await page.locator('#d2').dragTo(page.getByRole('region', { name: 'Bin' }), { targetPosition: { x: 10, y: 10 } });
  await expect(page.locator('#bin-out')).toHaveText('Dropped: Item 2');
});

// ==== HARD 1: Drag with the mouse for custom widgets (sortable list) ====
// > Some lists react to raw mouse events, not drag events. Move the mouse in steps so the page sees movement: `down`, several `move` calls, then `up`.
test('reorder a sortable list with the mouse', async ({ page }) => {
  const items = page.locator('#sortable li');
  await expect(items).toHaveText(['Task A', 'Task B', 'Task C', 'Task D']);
  const a = await items.nth(0).boundingBox();
  const c = await items.nth(2).boundingBox();
  await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
  await page.mouse.down();
  await page.mouse.move(c!.x + c!.width / 2, c!.y + c!.height - 2, { steps: 15 });
  await page.mouse.up();
  await expect(items).toHaveText(['Task B', 'Task C', 'Task A', 'Task D']);
});

// ==== HARD 2: dragTo also works for mouse-based lists ====
// > `dragTo` sends real mouse events too, so many custom lists work with it. Try it first; use the manual mouse steps only when needed.
test('dragTo on a sortable list', async ({ page }) => {
  const items = page.locator('#sortable li');
  await items.nth(3).dragTo(items.nth(0), { targetPosition: { x: 20, y: 2 } });
  await expect(items.first()).toHaveText('Task D');
});

// ==== HARD 3: Keyboard navigation of the page ====
// > Test that a page works with the keyboard only: Tab moves focus, Enter activates. This is also an accessibility check.
test('tab order and Enter', async ({ page }) => {
  await page.getByLabel('Type here').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Products' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByLabel('Type here')).toBeFocused();
});

// ==== HARD 4: Mouse wheel and scroll with the keyboard ====
// > `mouse.wheel(dx, dy)` scrolls like a wheel. Keys such as End and PageDown also scroll. Check the result with the scroll position.
test('wheel and End key scroll the page', async ({ page }) => {
  await page.mouse.move(100, 100);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await page.keyboard.press('Home');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.keyboard.press('End');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
});
