import { test, expect } from '@playwright/test';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import crypto from 'crypto';

test.beforeEach(async ({ page }) => { await page.goto('/download.html'); });

// ==== BASIC 1: Catch a download and save it ====
// > Start waiting for the `download` event BEFORE the click, then click, then use the Download object: `suggestedFilename()` and `saveAs()`.
test('download a file and save it', async ({ page }, testInfo) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Server text report' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('report.txt');
  const target = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(target);
  expect(fs.readFileSync(target, 'utf-8')).toBe('Quarterly report\nTotal: 42\n');
});

// ==== BASIC 2: Where is the file? path() and url() ====
// > Playwright first saves the download in a temporary folder. `path()` waits until it is complete and returns that location. `url()` shows where it came from.
test('path and url of a download', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Server text report' }).click();
  const download = await downloadPromise;
  const tempPath = await download.path();
  expect(fs.existsSync(tempPath)).toBe(true);
  expect(download.url()).toContain('/download/report.txt');
  expect(await download.failure()).toBeNull();
});

// ==== BASIC 3: A file created by the browser (Blob) ====
// > Many apps build the file in JavaScript and download it from a `blob:` URL. The test is exactly the same.
test('blob CSV download', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV (made in the browser)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('export.csv');
  expect(download.url()).toMatch(/^blob:/);
});

// ==== INTERMEDIATE 1: Read and verify a CSV ====
// > Parse the CSV with a library, then assert on rows and columns instead of comparing one long string.
test('parse the downloaded CSV', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV (made in the browser)' }).click();
  const download = await downloadPromise;
  const rows = parse(fs.readFileSync(await download.path(), 'utf-8'), { columns: true, skip_empty_lines: true }) as { name: string; qty: string }[];
  expect(rows).toEqual([{ name: 'Pen', qty: '3' }, { name: 'Book', qty: '5' }]);
  expect(rows.reduce((sum, r) => sum + Number(r.qty), 0)).toBe(8);
});

// ==== INTERMEDIATE 2: Read and verify JSON ====
// > Same idea for JSON: parse, then assert on the structure.
test('parse the downloaded JSON', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON (made in the browser)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('export.json');
  const data = JSON.parse(fs.readFileSync(await download.path(), 'utf-8'));
  expect(data).toEqual({ items: [1, 2, 3], ok: true });
});

// ==== INTERMEDIATE 3: Server sends a download header ====
// > A normal link becomes a download when the server answers with `Content-Disposition: attachment`. The browser does not navigate; the `download` event fires.
test('attachment header makes a download', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Server CSV (attachment header)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('products.csv');
  const rows = parse(fs.readFileSync(await download.path(), 'utf-8'), { columns: true }) as { name: string }[];
  expect(rows.map((r) => r.name)).toEqual(['Laptop', 'Phone', 'Headphones']);
  await expect(page).toHaveURL(/download\.html/);                                  // still on the same page
});

// ==== INTERMEDIATE 4: Slow downloads ====
// > `path()` waits until the file is complete, so you do not need a sleep. If you want a stricter limit, wrap the wait in a timeout.
test('slow download waits for completion', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  const started = Date.now();
  await page.getByRole('link', { name: 'Slow file (1.5 s)' }).click();
  const download = await downloadPromise;
  const file = await download.path();
  expect(Date.now() - started).toBeGreaterThan(1000);
  expect(fs.readFileSync(file, 'utf-8')).toBe('slow file content');
});

// ==== INTERMEDIATE 5: Click and wait together with Promise.all ====
// > A popular pattern: both steps in one expression, so the listener always exists before the click.
test('Promise.all pattern', async ({ page }) => {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export JSON (made in the browser)' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('export.json');
});

// ==== HARD 1: A download that opens in a NEW TAB ====
// > Some buttons call `window.open(url)`. The new tab never shows a page; it starts a download. In Playwright the `download` event arrives on the ORIGINAL page (not on the new tab), and the new tab stays open and blank, so close it.
test('download started from a new tab', async ({ page, context }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download in a new tab' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('products.csv');
  for (const extra of context.pages().filter((p) => p !== page)) await extra.close();      // the blank new tab, if still open
});

// ==== HARD 2: Two downloads from one click ====
// > Collect every download with `page.on('download')` and wait until the count is right.
test('collect several downloads', async ({ page }) => {
  const names: string[] = [];
  page.on('download', (d) => names.push(d.suggestedFilename()));
  await page.getByRole('button', { name: 'Download two files' }).click();
  await expect.poll(() => names.sort()).toEqual(['a.txt', 'b.txt']);
});

// ==== HARD 3: Verify content with a checksum ====
// > For binary files (PDF, ZIP, images) compare a hash and the size instead of the text.
test('checksum and size of the download', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Server text report' }).click();
  const file = await (await downloadPromise).path();
  const bytes = fs.readFileSync(file);
  expect(bytes.length).toBe(27);
  expect(crypto.createHash('sha1').update(bytes).digest('hex')).toBe(crypto.createHash('sha1').update('Quarterly report\nTotal: 42\n').digest('hex'));
});

// ==== HARD 4: A reusable helper ====
// > Wrap the pattern in one function and every test becomes one line.
async function downloadText(trigger: () => Promise<void>, page: import('@playwright/test').Page) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  return { name: download.suggestedFilename(), content: fs.readFileSync(await download.path(), 'utf-8') };
}

test('download helper function', async ({ page }) => {
  const file = await downloadText(() => page.getByRole('link', { name: 'Server text report' }).click(), page);
  expect(file).toEqual({ name: 'report.txt', content: 'Quarterly report\nTotal: 42\n' });
});

// ==== HARD 5: Downloads switched off ====
// > A context created with `acceptDownloads: false` refuses downloads. `failure()` then returns an error message instead of null. Use it to test what your app shows when downloads are blocked.
test('acceptDownloads false cancels the download', async ({ browser }) => {
  const context = await browser.newContext({ acceptDownloads: false });
  const page = await context.newPage();
  await page.goto('/download.html');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Server text report' }).click();
  const download = await downloadPromise;
  expect(await download.failure()).toContain('acceptDownloads');
  await context.close();
});
