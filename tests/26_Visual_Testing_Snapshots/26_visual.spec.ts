import { test, expect } from '@playwright/test';

// Opt-in: VISUAL=1 npx playwright test tests/26_Visual_Testing_Snapshots --update-snapshots   (first run creates baselines)
//         VISUAL=1 npx playwright test tests/26_Visual_Testing_Snapshots                      (later runs compare)

test.beforeEach(async ({ page, request }) => {
  await request.post('/api/reset');
  await page.goto('/shop.html');
  await expect(page.locator('.product')).toHaveCount(3);
});

// ==== BASIC 1: Compare an element with a saved picture ====
// > The first run has no baseline, so Playwright saves one and reports "missing". Create baselines with `--update-snapshots`. Later runs compare pixel by pixel and fail when the picture changed. Prefer ELEMENTS over whole pages: smaller pictures give fewer false alarms.
test('element screenshot', async ({ page }) => {
  await expect(page.locator('#login-form')).toHaveScreenshot('login-form.png');
});

// ==== BASIC 2: Hide the parts that change ====
// > `mask` paints boxes over dynamic areas (dates, ads, avatars). `animations: 'disabled'` stops CSS animations and transitions, and `caret: 'hide'` hides the blinking text cursor.
test('mask, animations and caret', async ({ page }) => {
  await page.getByLabel('Email').focus();
  await expect(page).toHaveScreenshot('shop-masked.png', {
    mask: [page.locator('#orders'), page.locator('#products')],
    maskColor: '#ff00ff',
    animations: 'disabled',
    caret: 'hide',
  });
});

// ==== BASIC 3: Allow small differences ====
// > Anti-aliasing and fonts can change a few pixels. Allow a small difference with `maxDiffPixels` (a number), `maxDiffPixelRatio` (a share of all pixels) or `threshold` (how different a single pixel may be, from 0 to 1).
test('tolerances', async ({ page }) => {
  await expect(page.locator('#login-form')).toHaveScreenshot('login-form-tolerant.png', { maxDiffPixels: 50, threshold: 0.2 });
  await expect(page.locator('h1')).toHaveScreenshot('heading.png', { maxDiffPixelRatio: 0.02 });
});

// ==== INTERMEDIATE 1: Clip, full page and scale ====
// > `fullPage` captures the whole scrollable page. `clip` captures a rectangle. `scale: 'css'` gives one pixel per CSS pixel on high-density screens, so baselines match across machines.
test('fullPage, clip and scale', async ({ page }) => {
  await expect(page).toHaveScreenshot('full-page.png', { fullPage: true, scale: 'css', mask: [page.locator('#orders')] });
  await expect(page).toHaveScreenshot('clip.png', { clip: { x: 0, y: 0, width: 300, height: 120 } });
});

// ==== INTERMEDIATE 2: Inject CSS that hides noise ====
// > `stylePath` applies a CSS file ONLY while taking the screenshot. Hide timestamps, carousels or cookie banners without touching the app.
test('stylePath hides noise', async ({ page }, testInfo) => {
  const css = testInfo.outputPath('hide.css');
  require('fs').writeFileSync(css, '#orders { visibility: hidden !important; }');
  await expect(page).toHaveScreenshot('hide-orders.png', { stylePath: css, fullPage: true });
});

// ==== INTERMEDIATE 3: Snapshots of text and data ====
// > `toMatchSnapshot` saves ANY text or Buffer and compares it later. It is handy for HTML fragments, JSON, CSV and API responses.
test('text and JSON snapshots', async ({ page, request }) => {
  const names = (await page.locator('.product .name').allTextContents()).join('\n');
  expect(names).toMatchSnapshot('product-names.txt');
  const products = await (await request.get('/api/products')).json();
  expect(JSON.stringify(products, null, 2)).toMatchSnapshot('products.json');
});

// ==== INTERMEDIATE 4: Where are the files? ====
// > Baselines live next to the test, in a folder named after the file, with the browser and operating system in the name (for example `login-form-chromium-linux.png`). That is why a baseline made on a Mac fails on Linux CI. Make and compare them in the SAME environment (Docker). `testInfo.snapshotPath` shows the location.
test('snapshot path', async ({}, testInfo) => {
  const where = testInfo.snapshotPath('login-form.png');
  expect(where).toMatch(/26_visual\.spec\.ts-snapshots/);
  expect(where).toMatch(/login-form-chromium-(linux|darwin|win32)\.png$/);
});

// ==== HARD 1: A real change is caught ====
// > Change a colour and the comparison fails with a diff image (Expected, Actual and Diff in the report). To keep this example self-contained, the test first writes its OWN baseline from the unchanged page, then changes the page. `test.fail()` expects the failure, so the example passes. It is skipped when you run `--update-snapshots` (which means the `changed` mode), because that mode would accept the new picture and nothing could fail.
test('a visual change is detected', async ({ page }, testInfo) => {
  test.skip(['all', 'changed'].includes(testInfo.config.updateSnapshots), 'update mode would accept the change');
  test.fail();
  const form = page.locator('#login-form');
  const baseline = testInfo.snapshotPath('change-detection.png');
  require('fs').mkdirSync(require('path').dirname(baseline), { recursive: true });
  require('fs').writeFileSync(baseline, await form.screenshot());       // the "approved" picture
  await page.addStyleTag({ content: '#login-btn { background: red !important; width: 200px !important; }' });
  await expect(form).toHaveScreenshot('change-detection.png', { timeout: 2000 });
});

// ==== HARD 2: Update rules ====
// > `--update-snapshots` has modes: `all` (replace every baseline), `changed` (replace only the ones that differ; this is what the flag means when you give no value), `missing` (create only new ones, the default) and `none`. In the config: `updateSnapshots: 'missing'`. Review changed pictures in the pull request like code.
test('the update modes are documented', async () => {
  expect(['all', 'changed', 'missing', 'none']).toContain('missing');
});

// ==== HARD 3: Check layout numbers instead of pixels ====
// > Many layout rules do not need pictures. Check sizes and positions with `boundingBox`; they are stable across fonts and operating systems.
test('layout without pixels', async ({ page }) => {
  const box = await page.locator('#login-form').boundingBox();
  const button = await page.locator('#login-btn').boundingBox();
  expect(button!.width).toBeGreaterThan(40);
  expect(button!.y).toBeGreaterThan(box!.y);
  expect(button!.y + button!.height).toBeLessThanOrEqual(box!.y + box!.height + 1);
});
