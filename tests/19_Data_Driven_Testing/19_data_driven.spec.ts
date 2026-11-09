import { test, expect, Page } from '@playwright/test';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const dataDir = path.join(__dirname, 'data');

// A small helper used by many examples below.
async function login(page: Page, email: string, password: string) {
  await page.goto('/shop.html');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

// ==== BASIC 1: A loop that creates one test per row ====
// > Data-driven testing means: the steps are written ONCE and the data changes. A `for...of` loop calls `test()` once per row, so each row is its own test with its own result in the report.
const inlineRows = [
  { email: 'asha@example.com', password: 'secret', expected: 'Welcome, asha@example.com' },
  { email: 'asha@example.com', password: 'wrong', expected: 'Invalid credentials' },
];
for (const row of inlineRows) {
  test(`inline data: ${row.email} / ${row.password}`, async ({ page }) => {
    await login(page, row.email, row.password);
    await expect(page.getByRole('alert')).toHaveText(row.expected);
  });
}

// ==== BASIC 2: Data from a JSON file ====
// > JSON is easy to read and edit. Read the file at the TOP of the test file (synchronously) so the tests can be created. Put a readable `title` in each row for the test name.
type LoginRow = { title: string; email: string; password: string; expected: string };
const jsonRows: LoginRow[] = JSON.parse(fs.readFileSync(path.join(dataDir, 'logins.json'), 'utf-8'));

for (const row of jsonRows) {
  test(`json data: ${row.title}`, async ({ page }) => {
    await login(page, row.email, row.password);
    await expect(page.getByRole('alert')).toHaveText(row.expected);
  });
}

// ==== BASIC 3: Every title must be unique ====
// > Two tests with the same title in one file make Playwright stop with an error. Build the title from the data so each one is different.
test('titles are built from the data and are unique', async () => {
  const titles = jsonRows.map((r) => `json data: ${r.title}`);
  expect(new Set(titles).size).toBe(titles.length);
});

// ==== INTERMEDIATE 1: Data from a CSV file ====
// > CSV is what testers often receive from business people. `csv-parse` turns it into objects (one per row, keys from the header line). Values are always TEXT.
const csvRows = parse(fs.readFileSync(path.join(dataDir, 'logins.csv'), 'utf-8'), { columns: true, skip_empty_lines: true }) as
  { email: string; password: string; expected: string; run: string }[];

for (const row of csvRows) {
  // A column can switch rows on or off: here "run" is yes or no.
  const runTest = row.run === 'yes' ? test : test.skip;
  runTest(`csv data: ${row.email} / ${row.password}`, async ({ page }) => {
    await login(page, row.email, row.password);
    await expect(page.getByRole('alert')).toContainText(row.expected);
  });
}

// ==== INTERMEDIATE 2: Data from an Excel file ====
// > Use the `xlsx` package. Pick a sheet by name and convert it to objects. Excel keeps numbers as numbers.
const workbook = XLSX.readFile(path.join(dataDir, 'users.xlsx'));
const excelLogins = XLSX.utils.sheet_to_json<{ email: string; password: string; expected: string }>(workbook.Sheets['Logins']);
const excelProducts = XLSX.utils.sheet_to_json<{ name: string; price: number }>(workbook.Sheets['Products']);

for (const row of excelLogins) {
  test(`excel data: ${row.email} / ${row.password}`, async ({ page }) => {
    await login(page, row.email, row.password);
    await expect(page.getByRole('alert')).toHaveText(row.expected);
  });
}

test('excel products sheet matches the shop', async ({ page }) => {
  await page.goto('/shop.html');
  await expect(page.locator('.product')).toHaveCount(excelProducts.length);
  for (const product of excelProducts) {
    const card = page.locator('.product').filter({ has: page.getByText(product.name, { exact: true }) });
    await expect(card.locator('.price')).toHaveText(`$${product.price}`);
  }
});

// ==== INTERMEDIATE 3: Different data for each environment ====
// > Choose the file from an environment variable. The same test then runs with QA data or staging data. Run with `TEST_ENV=staging npx playwright test`.
const envName = process.env.TEST_ENV ?? 'qa';
const envData = JSON.parse(fs.readFileSync(path.join(dataDir, `${envName}.json`), 'utf-8'));

test(`environment data (${envName})`, async ({ page }) => {
  expect(envData.baseUser).toContain('@example.com');
  await page.goto('/shop.html');
  await expect(page.locator('.product')).toHaveCount(envData.expectedProducts);
});

// ==== INTERMEDIATE 4: One describe block per data set, with tags ====
// > Grouping by data set gives a clean report tree and lets you attach a tag or a setting (like a viewport) to the whole group.
const datasets = [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, tag: '@desktop' },
  { name: 'phone', viewport: { width: 390, height: 844 }, tag: '@phone' },
];
for (const ds of datasets) {
  test.describe(`layout on ${ds.name}`, { tag: ds.tag }, () => {
    test.use({ viewport: ds.viewport });
    test('the menu button visibility depends on the width', async ({ page }) => {
      await page.goto('/responsive.html');
      const menu = page.getByRole('button', { name: 'Open menu' });
      if (ds.name === 'phone') await expect(menu).toBeVisible();
      else await expect(menu).toBeHidden();
    });
  });
}

// ==== INTERMEDIATE 5: Many rows inside ONE test with test.step ====
// > One test with a loop and steps is faster (one browser page), but a failure stops the remaining rows. Use many tests for independent cases, steps when rows share an expensive setup.
test('all logins in one test with steps', async ({ page }) => {
  for (const row of jsonRows) {
    await test.step(`row: ${row.title}`, async () => {
      await login(page, row.email, row.password);
      await expect(page.getByRole('alert')).toHaveText(row.expected);
    });
  }
});

// ==== HARD 1: Boundary values from a table ====
// > Test the edges of a rule. Each row has the input and the expected outcome. Here the rule is: a product price must be a number of 0 or more.
const priceCases: { price: unknown; status: number }[] = [
  { price: 0, status: 201 },          // lowest valid
  { price: 1, status: 201 },
  { price: 999999, status: 201 },     // big valid
  { price: '10', status: 400 },       // wrong type
  { price: null, status: 400 },       // missing
];
for (const c of priceCases) {
  test(`price boundary: ${JSON.stringify(c.price)} gives ${c.status}`, async ({ request }) => {
    const r = await request.post('/api/products', { data: { name: 'Boundary', price: c.price } });
    expect(r.status()).toBe(c.status);
    if (r.status() === 201) await request.delete(`/api/products/${(await r.json()).id}`);
  });
}

// ==== HARD 2: Every combination (a matrix) ====
// > Build the combinations with nested loops (or a helper). Be careful: 4 x 3 x 2 is already 24 tests. For big matrices use pairwise testing.
const categories = ['all', 'Phone', 'Laptop', 'Audio'];
const searches = ['', 'book'];
const expectedCounts: Record<string, number> = {
  'all|': 12, 'all|book': 2, 'Phone|': 4, 'Phone|book': 0, 'Laptop|': 4, 'Laptop|book': 2, 'Audio|': 4, 'Audio|book': 0,
};
for (const category of categories) {
  for (const search of searches) {
    test(`matrix: category=${category}, search="${search}"`, async ({ page }) => {
      await page.goto('/filter.html');
      await page.getByRole('button', { name: category === 'all' ? 'All' : category }).click();
      await page.getByLabel('Search').fill(search);
      await expect(page.locator('.card').filter({ visible: true })).toHaveCount(expectedCounts[`${category}|${search}`]);
    });
  }
}

// ==== HARD 3: Data from an API, read at run time ====
// > A test file must create its tests BEFORE the run starts, so data from a server cannot be used in a loop at the top. Fetch it inside ONE test and use steps for each item. (For huge data sets, write the data to a file in `globalSetup` and read that file at the top.)
test('products from the API are shown by the UI', async ({ page, request }) => {
  const products: { id: number; name: string; price: number }[] = await (await request.get('/api/products')).json();
  await page.goto('/shop.html');
  for (const p of products) {
    await test.step(`UI shows ${p.name}`, async () => {
      const card = page.getByTestId(`product-${p.id}`);
      await expect(card).toContainText(p.name);
      await expect(card).toContainText(`$${p.price}`);
    });
  }
});

// ==== HARD 4: Data as a fixture option ====
// > Define the data as a fixture OPTION. A describe block can then replace it with `test.use`, and the test body stays identical.
const userTest = test.extend<{ account: { email: string; password: string; expected: string } }>({
  account: [{ email: 'asha@example.com', password: 'secret', expected: 'Welcome, asha@example.com' }, { option: true }],
});

userTest.describe('good account', () => {
  userTest('login with the default account', async ({ page, account }) => {
    await login(page, account.email, account.password);
    await expect(page.getByRole('alert')).toHaveText(account.expected);
  });
});

userTest.describe('bad account', () => {
  userTest.use({ account: { email: 'asha@example.com', password: 'bad', expected: 'Invalid credentials' } });
  userTest('login with a replaced account', async ({ page, account }) => {
    await login(page, account.email, account.password);
    await expect(page.getByRole('alert')).toHaveText(account.expected);
  });
});

// ==== HARD 5: Check the data before using it ====
// > Bad data (an empty cell, a typo) produces confusing failures. Validate rows when the file is loaded and fail with a clear message.
function validateRows(rows: { email?: string; password?: string; expected?: string }[], source: string) {
  rows.forEach((row, i) => {
    for (const key of ['email', 'password', 'expected'] as const) {
      if (!row[key]) throw new Error(`${source}: row ${i + 2} has an empty "${key}"`);
    }
  });
}
test('all data files are valid', async () => {
  expect(() => validateRows(jsonRows, 'logins.json')).not.toThrow();
  expect(() => validateRows(csvRows, 'logins.csv')).not.toThrow();
  expect(() => validateRows(excelLogins, 'users.xlsx')).not.toThrow();
  expect(() => validateRows([{ email: 'a@b.c', password: '' }], 'bad.csv')).toThrow('row 2 has an empty "password"');
});
