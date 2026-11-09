import { test, expect } from '@playwright/test';

// ==== BASIC 1: Accept an alert and read its message ====
// > A JavaScript `alert`, `confirm` or `prompt` blocks the page until it is answered. Register the listener BEFORE the click that opens it.
test('alert: read the message, then accept', async ({ page }) => {
  await page.goto('/widgets.html');
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('alert');
    expect(dialog.message()).toBe('Hello from alert');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Show alert' }).click();
  await expect(page.locator('#dialog-result')).toHaveText('Alert closed');
});

// ==== BASIC 2: Confirm: OK or Cancel ====
// > `accept()` presses OK (the page receives true). `dismiss()` presses Cancel (false).
test('confirm: accept and dismiss', async ({ page }) => {
  await page.goto('/widgets.html');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Show confirm' }).click();
  await expect(page.locator('#dialog-result')).toHaveText('Confirmed');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Show confirm' }).click();
  await expect(page.locator('#dialog-result')).toHaveText('Cancelled');
});

// ==== BASIC 3: Prompt: type an answer ====
// > `accept('text')` types the text and presses OK. `defaultValue()` shows what the prompt suggested.
test('prompt: type an answer', async ({ page }) => {
  await page.goto('/widgets.html');
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('prompt');
    expect(dialog.message()).toBe('Your name?');
    expect(dialog.defaultValue()).toBe('');
    await dialog.accept('Asha');
  });
  await page.getByRole('button', { name: 'Show prompt' }).click();
  await expect(page.locator('#dialog-result')).toHaveText('Hello, Asha');
});

// ==== INTERMEDIATE 1: One listener for all dialogs ====
// > `page.on('dialog')` stays active for the whole test. Collect every message in an array, then assert on it afterwards.
test('collect the messages of a sequence of dialogs', async ({ page }) => {
  await page.goto('/alerts.html');
  const messages: string[] = [];
  page.on('dialog', async (dialog) => {
    messages.push(`${dialog.type()}: ${dialog.message()}`);
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Sequence of dialogs' }).click();
  await expect(page.locator('#out')).toHaveText('Finished');
  expect(messages).toEqual(['alert: Step 1 of 3', 'alert: Step 2 of 3', 'confirm: Finish?']);
});

// ==== INTERMEDIATE 2: Decide per dialog ====
// > In one handler you can choose the answer from the dialog type or text.
test('answer depends on the dialog', async ({ page }) => {
  await page.goto('/alerts.html');
  page.on('dialog', async (dialog) => {
    if (dialog.type() === 'confirm') await dialog.dismiss();
    else await dialog.accept();
  });
  await page.getByRole('button', { name: 'Sequence of dialogs' }).click();
  await expect(page.locator('#out')).toHaveText('Stopped');
});

// ==== INTERMEDIATE 3: A dialog that opens later ====
// > Wait for the dialog event itself when the dialog does not open straight away. Start waiting first, then click.
test('delayed alert', async ({ page }) => {
  await page.goto('/alerts.html');
  const dialogPromise = page.waitForEvent('dialog');
  await page.getByRole('button', { name: 'Alert after 1 second' }).click();
  const dialog = await dialogPromise;
  expect(dialog.message()).toBe('Delayed hello');
  await dialog.accept();
  await expect(page.locator('#out')).toHaveText('Delayed alert closed');
});

// ==== INTERMEDIATE 4: Multi-line messages ====
// > Line breaks in the message arrive as `\n`.
test('long multi-line alert', async ({ page }) => {
  await page.goto('/alerts.html');
  page.once('dialog', async (dialog) => {
    expect(dialog.message().split('\n')).toEqual(['Line one', 'Line two', 'Line three']);
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Alert with long text' }).click();
  await expect(page.locator('#out')).toHaveText('Long alert closed');
});

// ==== INTERMEDIATE 5: What happens with no listener ====
// > Playwright automatically DISMISSES dialogs that nobody handles, so the test keeps going. An alert is just closed, but a confirm returns false. This can silently change your flow, so always register a handler when a dialog is expected.
test('unhandled dialogs are dismissed automatically', async ({ page }) => {
  await page.goto('/widgets.html');
  await page.getByRole('button', { name: 'Show confirm' }).click();      // no listener on purpose
  await expect(page.locator('#dialog-result')).toHaveText('Cancelled');
  await page.getByRole('button', { name: 'Show alert' }).click();
  await expect(page.locator('#dialog-result')).toHaveText('Alert closed');
});

// ==== HARD 1: beforeunload (leave page?) dialog ====
// > A page can warn before closing. It only fires if the page was used, and Playwright runs it only when you ask: `page.close({ runBeforeUnload: true })`.
test('beforeunload dialog', async ({ page }) => {
  await page.goto('/beforeunload.html');
  await page.getByLabel('Note').fill('unsaved text');
  const dialogPromise = page.waitForEvent('dialog');
  await page.close({ runBeforeUnload: true });
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();                                                  // "Stay on page"
  expect(page.isClosed()).toBe(false);
});

// ==== HARD 2: HTML dialogs are NOT JavaScript dialogs ====
// > A modal built with the `<dialog>` element or a div is ordinary page content. Use locators, not the `dialog` event.
test('HTML modal uses locators', async ({ page }) => {
  await page.goto('/alerts.html');
  await page.getByRole('button', { name: 'Open HTML modal' }).click();
  const modal = page.getByRole('dialog', { name: 'Custom modal' });
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('HTML dialog');
  await modal.getByRole('button', { name: 'Close modal' }).click();
  await expect(modal).toBeHidden();
  await expect(page.locator('#out')).toHaveText('Modal closed');
});

// ==== HARD 3: A popup window opened by JavaScript ====
// > `window.open` creates a new page. Wait for the popup event, then work with that page.
test('window.open popup', async ({ page }) => {
  await page.goto('/alerts.html');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'window.open popup' }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveTitle('Popup page');
});

// ==== HARD 4: HTTP basic authentication (the browser login box) ====
// > The browser's own login box is not a JavaScript dialog and cannot be clicked. Give the credentials to the context instead.
test.describe('basic auth', () => {
  test('without credentials the server answers 401', async ({ request }) => {
    const response = await request.get('/secure');
    expect(response.status()).toBe(401);
  });

  test.describe('with credentials', () => {
    test.use({ httpCredentials: { username: 'admin', password: 'secret' } });
    test('the secure page opens', async ({ page }) => {
      await page.goto('/secure');
      await expect(page.getByRole('heading', { name: 'Secure area' })).toBeVisible();
    });
  });
});
