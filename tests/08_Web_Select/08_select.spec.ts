import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/selects.html'); });

// ==== BASIC 1: Choose an option in three ways ====
// > For a real `<select>`: `selectOption('value')`, `selectOption({ label })` and `selectOption({ index })`. Check with `toHaveValue`.
test('select by value, label and index', async ({ page }) => {
  const country = page.getByLabel('Country', { exact: true });
  await country.selectOption('jp');
  await expect(country).toHaveValue('jp');
  await country.selectOption({ label: 'France' });
  await expect(country).toHaveValue('fr');
  await country.selectOption({ index: 1 });                       // index 0 is "Choose..."
  await expect(country).toHaveValue('in');
  await expect(page.locator('#country-out')).toHaveText('Country: in');
});

// ==== BASIC 2: Read the options ====
// > List all options (`option` elements) and the one that is selected. Use `inputValue()` for the selected value.
test('list options and read the selected one', async ({ page }) => {
  const country = page.getByLabel('Country', { exact: true });
  const options = await country.locator('option').allTextContents();
  expect(options).toEqual(['Choose...', 'India', 'Japan', 'France', 'Germany', 'Atlantis (disabled)']);
  await country.selectOption('de');
  expect(await country.inputValue()).toBe('de');
  const selectedText = await country.locator('option:checked').innerText();
  expect(selectedText).toBe('Germany');
});

// ==== BASIC 3: Disabled options ====
// > A disabled option cannot be chosen. Assert its state instead of trying to select it.
test('disabled option', async ({ page }) => {
  const atlantis = page.getByLabel('Country', { exact: true }).locator('option[value="xx"]');
  await expect(atlantis).toBeDisabled();
  await expect(page.getByLabel('Country', { exact: true }).locator('option:not([disabled])')).toHaveCount(5);
});

// ==== INTERMEDIATE 1: Multi-select ====
// > A `<select multiple>` accepts an array. `toHaveValues` checks all selected values. Passing a new array replaces the selection.
test('multi-select', async ({ page }) => {
  const skills = page.getByLabel('Skills (multi-select)');
  await skills.selectOption(['Playwright', 'SQL']);
  await expect(skills).toHaveValues(['Playwright', 'SQL']);
  await expect(page.locator('#skills-out')).toHaveText('Skills: Playwright,SQL');
  await skills.selectOption(['Docker']);
  await expect(skills).toHaveValues(['Docker']);
  await skills.selectOption([]);                                    // clear everything
  await expect(skills).toHaveValues([]);
});

// ==== INTERMEDIATE 2: Dependent dropdowns ====
// > The second list is empty or disabled until the first one is chosen. The assertion waits for the options to appear.
test('dependent dropdown', async ({ page }) => {
  const state = page.getByLabel('State');
  await expect(state).toBeDisabled();
  await page.getByLabel('Country (dependent)').selectOption('in');
  await expect(state).toBeEnabled();
  await expect(state.locator('option')).toHaveText(['Kerala', 'Goa', 'Delhi']);
  await state.selectOption('Goa');
  await expect(state).toHaveValue('Goa');
  await page.getByLabel('Country (dependent)').selectOption('us');
  await expect(state.locator('option')).toHaveText(['Texas', 'Ohio']);
});

// ==== INTERMEDIATE 3: Verify an option list is sorted and has no duplicates ====
// > A very common check. Read the options, compare with a sorted copy, and check the Set size.
test('options are sorted and unique', async ({ page }) => {
  const fruits = await page.getByLabel('Sorted options').locator('option').allTextContents();
  expect(fruits).toEqual([...fruits].sort());
  expect(new Set(fruits).size).toBe(fruits.length);
});

// ==== INTERMEDIATE 4: Option groups ====
// > `optgroup` creates headings inside a select. You can read which options live in which group.
test('optgroups', async ({ page }) => {
  const asia = page.getByLabel('Country', { exact: true }).locator('optgroup[label="Asia"] option');
  await expect(asia).toHaveText(['India', 'Japan']);
  await expect(page.getByLabel('Country', { exact: true }).locator('optgroup')).toHaveCount(2);
});

// ==== HARD 1: A custom dropdown (not a select) ====
// > Many sites build dropdowns from buttons and lists. `selectOption` does not work there. Click to open, then click the option by its role.
test('custom dropdown built from a button and a list', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Choose language' });
  await expect(page.getByRole('listbox', { name: 'Languages' })).toBeHidden();
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const languages = page.getByRole('listbox', { name: 'Languages' });          // scope: the page also has native <option>s
  await expect(languages.getByRole('option')).toHaveText(['English', 'Hindi', 'Tamil']);
  await languages.getByRole('option', { name: 'Hindi' }).click();
  await expect(page.locator('#lang-out')).toHaveText('Language: Hindi');
  await expect(page.getByRole('listbox', { name: 'Languages' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Hindi' })).toBeVisible();
});

// ==== HARD 2: datalist (type or pick a suggestion) ====
// > A text input with a `datalist` accepts any text. `fill` works. The suggestions can be read from the `option` elements.
test('datalist input', async ({ page }) => {
  const input = page.getByLabel('Browser (datalist)');
  const suggestions = await page.locator('#browsers option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  expect(suggestions).toEqual(['Chrome', 'Firefox', 'Safari']);
  await input.fill('Firefox');
  await expect(input).toHaveValue('Firefox');
});

// ==== HARD 3: Select by regex or partial text with a helper ====
// > `selectOption({ label })` needs the exact text. When you only know part of it, find the option first and select by its value.
test('select by partial text', async ({ page }) => {
  const country = page.getByLabel('Country', { exact: true });
  const value = await country.locator('option', { hasText: /^Ger/ }).getAttribute('value');
  await country.selectOption(value!);
  await expect(country.locator('option:checked')).toHaveText('Germany');
});
