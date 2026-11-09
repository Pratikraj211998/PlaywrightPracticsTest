import { test as base, expect } from '@playwright/test';
import pdfParse from 'pdf-parse';
import * as XLSX from 'xlsx';
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';

const test = base;

// ==== BASIC 1: Create a PDF of a page and read its text ====
// > `page.pdf()` prints the page to PDF (Chromium only). To check the CONTENT of a PDF, convert it to text with a library such as `pdf-parse`.
test('page.pdf and read the text', async ({ page }, testInfo) => {
  await page.goto('/shop.html');
  await expect(page.locator('.product')).toHaveCount(3);
  const file = testInfo.outputPath('shop.pdf');
  const buffer = await page.pdf({ path: file, format: 'A4' });
  expect(buffer.subarray(0, 4).toString()).toBe('%PDF');                       // every PDF starts with %PDF
  const parsed = await pdfParse(fs.readFileSync(file));
  expect(parsed.numpages).toBeGreaterThanOrEqual(1);
  expect(parsed.text).toContain('Demo Shop');
  expect(parsed.text).toContain('Laptop');
});

// ==== BASIC 2: A PDF that the app lets the user download ====
// > Many apps generate a PDF (invoice, ticket) on the server. Catch it as a download, then parse it. Here the PDF is served by a route handler so the example needs no PDF library on the server.
test('download a PDF and verify its text', async ({ page }, testInfo) => {
  const source = await page.context().newPage();
  await source.setContent('<h1>Invoice 1001</h1><p>Total: $42.00</p>');
  const pdf = await source.pdf();
  await source.close();

  await page.route('**/invoice.pdf', (r) => r.fulfill({ body: pdf, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="invoice-1001.pdf"' } }));
  await page.goto('/');
  await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<a id="inv" href="/invoice.pdf">Download invoice</a>'); });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download invoice' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('invoice-1001.pdf');
  const target = testInfo.outputPath('invoice.pdf');
  await download.saveAs(target);
  const text = (await pdfParse(fs.readFileSync(target))).text;
  expect(text).toContain('Invoice 1001');
  expect(text).toContain('Total: $42.00');
});

// ==== BASIC 3: Read a download as a stream ====
// > `createReadStream()` gives a stream for big files, so you do not load everything into memory. Count bytes or compute a hash on the fly.
test('download stream', async ({ page }) => {
  await page.route('**/big.bin', (r) => r.fulfill({ body: Buffer.alloc(100_000, 7), headers: { 'Content-Disposition': 'attachment; filename="big.bin"', 'Content-Type': 'application/octet-stream' } }));
  await page.goto('/');
  await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<a href="/big.bin">Get big</a>'); });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Get big' }).click();
  const stream = await (await downloadPromise).createReadStream();
  let bytes = 0;
  for await (const chunk of stream!) bytes += (chunk as Buffer).length;
  expect(bytes).toBe(100_000);
});

// ==== INTERMEDIATE 1: Download an Excel file and read it ====
// > The same pattern: catch the download, then open it with the `xlsx` library and assert on the sheet. Here the workbook is created in the test and served by a route.
test('download and verify an Excel file', async ({ page }, testInfo) => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ item: 'Pen', qty: 3 }, { item: 'Book', qty: 5 }]), 'Report');
  const xlsx: Buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  await page.route('**/report.xlsx', (r) => r.fulfill({ body: xlsx, headers: { 'Content-Disposition': 'attachment; filename="report.xlsx"', 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } }));
  await page.goto('/');
  await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<a href="/report.xlsx">Excel report</a>'); });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Excel report' }).click();
  const download = await downloadPromise;
  const target = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(target);

  const read = XLSX.readFile(target);
  expect(read.SheetNames).toEqual(['Report']);
  const rows = XLSX.utils.sheet_to_json<{ item: string; qty: number }>(read.Sheets['Report']);
  expect(rows).toEqual([{ item: 'Pen', qty: 3 }, { item: 'Book', qty: 5 }]);
  expect(rows.reduce((s, r) => s + r.qty, 0)).toBe(8);
});

// ==== INTERMEDIATE 2: Upload a generated file ====
// > Build the file in memory (CSV or Excel) with exactly the rows you need, then upload it with a buffer.
test('upload a generated CSV', async ({ page }) => {
  await page.goto('/upload.html');
  const csv = ['name,qty', ...Array.from({ length: 5 }, (_, i) => `item${i},${i + 1}`)].join('\n');
  await page.getByLabel('Documents').setInputFiles({ name: 'items.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.locator('#multi-list li')).toHaveText(['items.csv']);
  await expect(page.locator('#multi-total')).toHaveText(`1 files, ${csv.length} bytes`);
});

// ==== INTERMEDIATE 3: A database in a fixture ====
// > Tests sometimes prepare or verify data in the database. A fixture opens the connection, seeds the data, hands it to the test, and closes it. This example uses Node's built-in SQLite so it runs anywhere; with PostgreSQL or MySQL the idea is identical (`pg` or `mysql2` instead).
type Db = { query<T>(sql: string, ...params: unknown[]): T[]; run(sql: string, ...params: unknown[]): void };
const dbTest = base.extend<{ db: Db }>({
  db: async ({}, use) => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec('CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price INTEGER)');
    sqlite.exec("INSERT INTO products VALUES (1,'Laptop',900),(2,'Phone',500),(3,'Headphones',100)");
    await use({
      query: <T>(sql: string, ...params: unknown[]) => sqlite.prepare(sql).all(...(params as never[])) as T[],
      run: (sql: string, ...params: unknown[]) => { sqlite.prepare(sql).run(...(params as never[])); },
    });
    sqlite.close();                                                              // teardown
  },
});

dbTest('the UI shows what the database holds', async ({ page, db }) => {
  const rows = db.query<{ id: number; name: string; price: number }>('SELECT * FROM products ORDER BY id');
  await page.route('**/api/products', (r) => r.fulfill({ json: rows }));           // the "API" serves the database rows
  await page.goto('/shop.html');
  await expect(page.locator('.product .name')).toHaveText(rows.map((r) => r.name));
  await expect(page.locator('.product .price')).toHaveText(rows.map((r) => `$${r.price}`));
});

// ==== INTERMEDIATE 4: Verify a change in the database after a UI action ====
// > The classic end-to-end check: do something in the UI, then confirm the right row exists. Always use parameters (`?`) instead of building SQL from text, and a read-only account where possible.
dbTest('verify data after an action', async ({ page, db }) => {
  await page.goto('/shop.html');
  await page.getByTestId('product-2').getByRole('button', { name: 'Add to cart' }).click();
  db.run("INSERT INTO products VALUES (?, ?, ?)", 4, 'Cart marker', 1);          // stands in for what the app would write
  const [{ total }] = db.query<{ total: number }>('SELECT COUNT(*) AS total FROM products WHERE name = ?', 'Cart marker');
  expect(total).toBe(1);
  await expect(page.getByRole('link', { name: /^Cart/ })).toHaveText('Cart (1)');
});
