import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.beforeEach(async ({ page }) => { await page.goto('/upload.html'); });

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// ==== BASIC 1: Upload one file from memory ====
// > `setInputFiles` fills a file input without opening the operating system's file picker (which automation cannot control). You can pass a file path OR an object with a name, type and a Buffer.
test('single file from a buffer', async ({ page }) => {
  await page.getByLabel('Photo').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('#single-out')).toHaveText(`Selected: photo.png (${png.length} bytes)`);
});

// ==== BASIC 2: Validation of the file type ====
// > Test the unhappy path too: a wrong type must show an error. The same call is used; only the file changes.
test('wrong file type shows an error', async ({ page }) => {
  await page.getByLabel('Photo').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('text') });
  await expect(page.locator('#single-out')).toHaveText('Error: only png or jpg allowed');
});

// ==== BASIC 3: Upload several files ====
// > Pass an array. The input must have the `multiple` attribute. The list updates and the total size is shown.
test('multiple files', async ({ page }) => {
  await page.getByLabel('Documents').setInputFiles([
    { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('aaaa') },
    { name: 'b.txt', mimeType: 'text/plain', buffer: Buffer.from('bb') },
  ]);
  await expect(page.locator('#multi-list li')).toHaveText(['a.txt', 'b.txt']);
  await expect(page.locator('#multi-total')).toHaveText('2 files, 6 bytes');
});

// ==== BASIC 4: Remove the selected files ====
// > An empty array clears the input, like pressing "Cancel" or removing the file.
test('clear the selection', async ({ page }) => {
  const input = page.getByLabel('Photo');
  await input.setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('#single-out')).toContainText('photo.png');
  await input.setInputFiles([]);
  await expect(page.locator('#single-out')).toHaveText('');
});

// ==== INTERMEDIATE 1: Files from disk ====
// > In real projects you keep sample files in a `test-data` folder. Here we create them in the test's own output folder so the example is self-contained.
test('upload from a real file path', async ({ page }, testInfo) => {
  const file = testInfo.outputPath('resume.txt');
  fs.writeFileSync(file, 'my resume');
  await page.getByLabel('Documents').setInputFiles(file);
  await expect(page.locator('#multi-list li')).toHaveText(['resume.txt']);
  await expect(page.locator('#multi-total')).toHaveText('1 files, 9 bytes');
});

// ==== INTERMEDIATE 2: Upload button that opens a file chooser ====
// > Some pages open the picker from a button or drop zone with no visible input. Listen for the `filechooser` event, click, then give files to the chooser.
test('filechooser event', async ({ page }) => {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Drop files here' }).click();
  const chooser = await chooserPromise;
  expect(chooser.isMultiple()).toBe(true);
  await chooser.setFiles([{ name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }]);
  await expect(page.locator('#drop-out')).toHaveText('Chosen: x.txt');
});

// ==== INTERMEDIATE 3: Hidden file inputs ====
// > `setInputFiles` works on an input that is hidden with CSS, so you can skip the click on the fancy button.
test('hidden input', async ({ page }) => {
  await page.locator('#hidden-input').setInputFiles({ name: 'h.txt', mimeType: 'text/plain', buffer: Buffer.from('h') });
  await expect(page.locator('#drop-out')).toHaveText('Chosen: h.txt');
});

// ==== INTERMEDIATE 4: Upload to the server and check the answer ====
// > After choosing the file, press the Upload button and check what the server received. The server counts bytes of the whole request, so it is a little more than the file.
test('upload to the server', async ({ page }) => {
  const response = page.waitForResponse('**/api/upload');
  await page.getByLabel('File to upload').setInputFiles({ name: 'data.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(2000, 1) });
  await page.getByRole('button', { name: 'Upload', exact: true }).click();     // exact: the file input is also called "File to upload"
  expect((await response).status()).toBe(200);
  await expect(page.locator('#send-out')).toContainText('Uploaded, server received');
  const text = await page.locator('#send-out').innerText();
  expect(Number(text.match(/(\d+) bytes/)![1])).toBeGreaterThan(2000);
});

// ==== INTERMEDIATE 5: Pressing Upload with no file ====
// > Check the error message when nothing is chosen.
test('upload without a file', async ({ page }) => {
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page.locator('#send-out')).toHaveText('Choose a file first');
});

// ==== HARD 1: Real drag and drop of files onto a drop zone ====
// > A drop zone listens to the `drop` event. Build a `DataTransfer` object with files inside the page and dispatch the event on the zone.
test('drop files onto a drop zone', async ({ page }) => {
  const dataTransfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['hello'], 'dropped.txt', { type: 'text/plain' }));
    dt.items.add(new File(['world'], 'second.txt', { type: 'text/plain' }));
    return dt;
  });
  await page.getByRole('button', { name: 'Drop files here' }).dispatchEvent('drop', { dataTransfer });
  await expect(page.locator('#drop-out')).toHaveText('Dropped: dropped.txt, second.txt');
});

// ==== HARD 2: Upload a whole folder ====
// > An input with `webkitdirectory` accepts a directory path. The page sees the relative path of every file. The order comes from the file system, so compare a sorted list.
test('folder upload', async ({ page }, testInfo) => {
  const dir = testInfo.outputPath('reports');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'one.txt'), '1');
  fs.writeFileSync(path.join(dir, 'two.txt'), '22');
  await page.getByLabel('Folder').setInputFiles(dir);
  await expect.poll(async () => (await page.locator('#folder-out').innerText()).split(', ').sort())
    .toEqual(['reports/one.txt', 'reports/two.txt']);
});

// ==== HARD 3: A big file ====
// > Generate large content in memory instead of keeping a huge file in your repository.
test('upload a 2 MB file', async ({ page }) => {
  const big = Buffer.alloc(2 * 1024 * 1024, 'a');
  await page.getByLabel('Documents').setInputFiles({ name: 'big.bin', mimeType: 'application/octet-stream', buffer: big });
  await expect(page.locator('#multi-total')).toHaveText(`1 files, ${big.length} bytes`);
});

// ==== HARD 4: Data-driven file types ====
// > Run the same check for many files with a loop. Each test gets a unique title.
for (const [file, valid] of [['a.png', true], ['b.jpg', true], ['c.gif', false], ['d.pdf', false], ['E.PNG', true]] as const) {
  test(`type check for ${file}`, async ({ page }) => {
    await page.getByLabel('Photo').setInputFiles({ name: file, mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
    await expect(page.locator('#single-out')).toContainText(valid ? 'Selected:' : 'Error:');
  });
}
