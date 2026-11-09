import { test, expect, Locator, Page } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/tables.html'); });

// ==== BASIC 1: Count rows and columns, read headers ====
// > A table has `thead` (headers) and `tbody` (data rows). Use `getByRole('row')` for rows (the header and footer count as rows too). For header cells use `thead th`: in Playwright 1.56 a plain `<th>` was reported as a `cell`, not a `columnheader`, unless the page sets `role` or `scope`.
test('rows, columns and headers', async ({ page }) => {
  const table = page.locator('#employees');
  await expect(table.getByRole('row')).toHaveCount(8);                 // header + 6 data + footer
  await expect(table.locator('tbody tr')).toHaveCount(6);
  await expect(table.locator('thead th')).toHaveText(['', 'Name', 'Department', 'Salary', 'Status', 'Actions']);
  expect(await table.locator('thead th').count()).toBe(6);
});

// ==== BASIC 2: Read one cell ====
// > Pick the row, then the cell by position (zero-based) or by column. `nth(1)` is the second cell of that row.
test('read a cell by row and column', async ({ page }) => {
  const table = page.locator('#employees');
  const meenaRow = table.getByRole('row', { name: 'Meena' });
  await expect(meenaRow.getByRole('cell').nth(2)).toHaveText('Dev');
  await expect(meenaRow.getByRole('cell').nth(3)).toHaveText('120000');
  await expect(table.locator('tbody tr').nth(0).locator('td').nth(1)).toHaveText('Asha');
});

// ==== BASIC 3: Act on the row that contains a value ====
// > Find the row by the text it contains, then click the button INSIDE that row. This never clicks the wrong person.
test('edit and delete a specific row', async ({ page }) => {
  const table = page.locator('#employees');
  await table.getByRole('row', { name: 'Raj' }).getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('#action-result')).toHaveText('Editing Raj');
  await table.getByRole('row', { name: 'John' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('#action-result')).toHaveText('Deleted John');
  await expect(table.getByRole('row', { name: 'John' })).toHaveCount(0);
});

// ==== INTERMEDIATE 1: Convert a table into data ====
// > A reusable helper turns any table into an array of objects. Then you can assert with plain JavaScript.
async function tableToObjects(table: Locator): Promise<Record<string, string>[]> {
  const headers = (await table.locator('thead th').allInnerTexts()).map((h) => h.trim());
  return table.locator('tbody tr').evaluateAll((rows, hs) =>
    rows.map((row) => Object.fromEntries([...row.querySelectorAll('td')].map((td, i) => [hs[i], (td.textContent ?? '').trim()]))), headers);
}

test('table to an array of objects', async ({ page }) => {
  const rows = await tableToObjects(page.locator('#employees'));
  expect(rows).toHaveLength(6);
  expect(rows[2]).toMatchObject({ Name: 'Meena', Department: 'Dev', Salary: '120000', Status: 'Active' });
  const devs = rows.filter((r) => r.Department === 'Dev').map((r) => r.Name);
  expect(devs).toEqual(['Meena', 'John', 'Priya']);
});

// ==== INTERMEDIATE 2: Sum a column and compare with the total ====
// > Real tests often verify totals. Read the column, convert to numbers, add them, and compare with the footer.
test('sum of the salary column equals the footer total', async ({ page }) => {
  const salaries = await page.locator('#employees tbody tr td:nth-child(4)').allInnerTexts();
  const sum = salaries.map(Number).reduce((a, b) => a + b, 0);
  expect(sum).toBe(570000);
  await expect(page.locator('#total-salary')).toHaveText(String(sum));
});

// ==== INTERMEDIATE 3: Checkboxes in rows ====
// > Tick one row, tick all with the header checkbox, then count the checked boxes.
test('row checkboxes and select all', async ({ page }) => {
  const table = page.locator('#employees');
  await table.getByRole('row', { name: 'Asha' }).getByRole('checkbox').check();
  await expect(table.locator('tbody input:checked')).toHaveCount(1);
  await page.getByLabel('Select all').check();
  await expect(table.locator('tbody input:checked')).toHaveCount(6);
  await page.getByLabel('Select all').uncheck();
  await expect(table.locator('tbody input:checked')).toHaveCount(0);
});

// ==== INTERMEDIATE 4: Filter rows by a column value ====
// > Rows whose Status cell says Inactive: filter by a cell that contains exactly that text.
test('rows by column value', async ({ page }) => {
  const inactive = page.locator('#employees tbody tr').filter({ has: page.getByRole('cell', { name: 'Inactive', exact: true }) });
  await expect(inactive).toHaveCount(2);
  await expect(inactive.locator('td:nth-child(2)')).toHaveText(['Raj', 'Priya']);
});

// ==== INTERMEDIATE 5: Rows that arrive late ====
// > The orders table is filled by JavaScript after a short delay. Assertions wait until rows exist, so you never read an empty table.
test('dynamic rows', async ({ page }) => {
  const rows = page.locator('#orders tbody tr');
  await expect(rows).toHaveCount(5);                                     // page 1 of 3
  await expect(page.locator('#page-info')).toHaveText('Page 1 of 3');
});

// ==== INTERMEDIATE 6: Sort by clicking a header ====
// > Click the header, then read the column and compare it with a sorted copy. `aria-sort` tells the current direction.
test('click a header to sort', async ({ page }) => {
  const amountHeader = page.getByRole('columnheader', { name: 'Amount' });
  await expect(page.locator('#orders tbody tr')).toHaveCount(5);
  await amountHeader.click();
  await expect(amountHeader).toHaveAttribute('aria-sort', 'ascending');
  const asc = (await page.locator('#orders tbody td:nth-child(3)').allInnerTexts()).map(Number);
  expect(asc).toEqual([...asc].sort((a, b) => a - b));
  await amountHeader.click();
  await expect(amountHeader).toHaveAttribute('aria-sort', 'descending');
  const desc = (await page.locator('#orders tbody td:nth-child(3)').allInnerTexts()).map(Number);
  expect(desc).toEqual([...desc].sort((a, b) => b - a));
});

// ==== HARD 1: Collect rows from every page ====
// > Loop: read the page, click Next while it is enabled. This gets ALL data of a paginated table.
async function readAllOrders(page: Page): Promise<string[][]> {
  const all: string[][] = [];
  await expect(page.locator('#orders tbody tr')).not.toHaveCount(0);
  for (;;) {
    const rows = await page.locator('#orders tbody tr').evaluateAll((trs) =>
      trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent!.trim())));
    all.push(...rows);
    const next = page.getByRole('button', { name: 'Next' });
    if (await next.isDisabled()) break;
    const before = await page.locator('#page-info').innerText();
    await next.click();
    await expect(page.locator('#page-info')).not.toHaveText(before);   // wait for the next page
  }
  return all;
}

test('read all pages of the orders table', async ({ page }) => {
  const orders = await readAllOrders(page);
  expect(orders).toHaveLength(12);
  expect(orders[0]).toEqual(['101', 'Ann', '250', 'Paid']);
  expect(orders.at(-1)).toEqual(['112', 'Lee', '275', 'Paid']);
  const paidTotal = orders.filter((o) => o[3] === 'Paid').reduce((s, o) => s + Number(o[2]), 0);
  expect(paidTotal).toBe(3134);
});

// ==== HARD 2: Find a record on whichever page it is ====
// > Search page by page until the customer is found, then act on that row.
test('find a customer on any page', async ({ page }) => {
  await expect(page.locator('#orders tbody tr')).toHaveCount(5);
  const target = page.locator('#orders tbody tr', { hasText: 'Jon' });
  while (!(await target.count())) {
    const before = await page.locator('#page-info').innerText();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('#page-info')).not.toHaveText(before);
  }
  await expect(target.locator('td').nth(3)).toHaveText('Pending');
  await expect(page.locator('#page-info')).toHaveText('Page 2 of 3');
});

// ==== HARD 3: A table made of divs (ARIA roles) ====
// > Some "tables" have no `<table>` tag. If they use `role="table"`, `row` and `cell`, the same role locators work.
test('div-based table with ARIA roles', async ({ page }) => {
  const grid = page.getByRole('table', { name: 'Scores' });
  await expect(grid.getByRole('row')).toHaveCount(3);
  await expect(grid.getByRole('row', { name: 'Blues' }).getByRole('cell').nth(1)).toHaveText('37');
  await expect(grid.getByRole('columnheader')).toHaveText(['Team', 'Points']);
});

// ==== HARD 4: Reusable Table component class ====
// > Wrap the table logic in a class once and reuse it for every table in the project (this idea returns in the Page Object Model chapter).
class DataTable {
  constructor(private readonly root: Locator) {}
  rows() { return this.root.locator('tbody tr'); }
  row(text: string) { return this.root.locator('tbody tr', { hasText: text }); }
  async cell(rowText: string, column: string) {
    const headers = await this.root.locator('thead th').allInnerTexts();
    return this.row(rowText).locator('td').nth(headers.findIndex((h) => h.trim() === column));
  }
  async columnValues(column: string) {
    const headers = await this.root.locator('thead th').allInnerTexts();
    const index = headers.findIndex((h) => h.trim() === column);
    return this.root.locator(`tbody tr td:nth-child(${index + 1})`).allInnerTexts();
  }
}

test('DataTable helper class', async ({ page }) => {
  const employees = new DataTable(page.locator('#employees'));
  await expect(employees.rows()).toHaveCount(6);
  await expect(await employees.cell('Priya', 'Salary')).toHaveText('130000');
  expect(await employees.columnValues('Department')).toEqual(['QA', 'QA', 'Dev', 'Dev', 'Dev', 'Ops']);
});
