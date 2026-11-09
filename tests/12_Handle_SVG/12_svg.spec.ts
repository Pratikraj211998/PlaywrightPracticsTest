import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/svg.html'); });

// ==== BASIC 1: SVG elements are normal elements ====
// > Shapes like `rect`, `circle` and `path` are part of the page. CSS selectors find them, and `click()` works on them.
test('click a region of an SVG map by id', async ({ page }) => {
  await page.locator('svg#map #north').click();
  await expect(page.locator('#map-out')).toHaveText('Selected: north');
  await page.locator('#map rect.region').nth(1).click();
  await expect(page.locator('#map-out')).toHaveText('Selected: south');
});

// ==== BASIC 2: Find shapes by their title or aria-label ====
// > A `<title>` inside the shape (or an `aria-label`) gives it a name. `getByTitle` only looks at the HTML `title` ATTRIBUTE and did not match an SVG `<title>` element in Playwright 1.56, so filter by the child `<title>` instead. Names are better than positions because they do not change when the picture is redrawn.
test('locate by title and aria-label', async ({ page }) => {
  const east = page.locator('#map .region').filter({ has: page.locator('title', { hasText: 'East' }) });
  await expect(east).toHaveCount(1);
  await east.click();
  await expect(page.locator('#map-out')).toHaveText('Selected: east');
  await page.locator('#map [aria-label="South"]').click();
  await expect(page.locator('#map-out')).toHaveText('Selected: south');
});

// ==== BASIC 3: Count shapes and read text ====
// > `<text>` elements hold the labels. `allTextContents()` reads them.
test('count shapes and read labels', async ({ page }) => {
  await expect(page.locator('#chart rect.bar')).toHaveCount(4);
  await expect(page.locator('#chart text.x-label')).toHaveText(['Q1', 'Q2', 'Q3', 'Q4']);
  expect(await page.locator('#map text.map-label').textContent()).toBe('North zone');
});

// ==== INTERMEDIATE 1: XPath for SVG ====
// > In XPath, SVG elements live in another namespace, so plain `//rect` finds nothing. Use `name()` or `local-name()`.
test('XPath needs name() for SVG', async ({ page }) => {
  await expect(page.locator('xpath=//rect[@class="bar"]')).toHaveCount(0);                              // wrong
  await expect(page.locator('xpath=//*[name()="svg"]//*[name()="rect" and @class="bar"]')).toHaveCount(4);
  await expect(page.locator('xpath=//*[local-name()="rect"][@data-label="Q3"]')).toHaveCount(1);
});

// ==== INTERMEDIATE 2: Read attributes of shapes ====
// > Charts keep their data in attributes (`data-value`, `fill`, `height`). Read them to verify the chart.
test('read data from chart bars', async ({ page }) => {
  const bars = page.locator('#chart rect.bar');
  const values = await bars.evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-value'))));
  expect(values).toEqual([30, 80, 55, 95]);
  expect(Math.max(...values)).toBe(95);
  await expect(bars.first()).toHaveAttribute('fill', '#48f');
  expect(await bars.nth(3).getAttribute('data-label')).toBe('Q4');
});

// ==== INTERMEDIATE 3: Hover to see a tooltip ====
// > Hovering a bar shows a tooltip. Hover, then assert the text, then move away and check it hides.
test('hover a bar shows a tooltip', async ({ page }) => {
  const tip = page.locator('#tip');
  await expect(tip).toBeHidden();
  await page.locator('#chart rect.bar[data-label="Q2"]').hover();
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText('Q2: 80');
  await page.locator('#chart rect.bar[data-label="Q4"]').hover();
  await expect(tip).toHaveText('Q4: 95');
  await page.mouse.move(0, 0);
  await expect(tip).toBeHidden();
});

// ==== INTERMEDIATE 4: Icon buttons made from SVG ====
// > A button that contains only an icon is named by `aria-label` or by the SVG `<title>`. Use `getByRole('button', { name })`.
test('icon buttons by accessible name', async ({ page }) => {
  await page.getByRole('button', { name: 'Delete item' }).click();
  await expect(page.locator('#icon-out')).toHaveText('Deleted');
  await page.getByRole('button', { name: 'Like' }).click();                           // name comes from <title>
  await expect(page.locator('#icon-out')).toHaveText('Liked');
});

// ==== INTERMEDIATE 5: The whole SVG as an image ====
// > An SVG with `role="img"` and an `aria-label` can be found as an image. Good for checking that the chart exists.
test('chart as an accessible image', async ({ page }) => {
  await expect(page.getByRole('img', { name: 'Sales chart' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Region map' })).toBeVisible();
});

// ==== HARD 1: Star rating drawn with polygons ====
// > Click the 4th star, then check the stars that changed colour. A shape's colour is an attribute, so `toHaveAttribute` works.
test('star rating', async ({ page }) => {
  await page.getByRole('radio', { name: '4 star' }).click();
  await expect(page.locator('#rating-out')).toHaveText('Rating: 4');
  await expect(page.locator('#stars polygon[fill="gold"]')).toHaveCount(4);
  await expect(page.locator('#stars polygon.star').last()).toHaveAttribute('fill', '#ccc');
});

// ==== HARD 2: Click at a position inside an SVG ====
// > When a shape has no id, click by coordinates relative to the shape or the whole SVG. `boundingBox` gives the size; `position` is relative to the element.
test('click by position', async ({ page }) => {
  const south = page.locator('#south');
  const box = await south.boundingBox();
  expect(box!.width).toBeGreaterThan(100);
  await page.locator('#map').click({ position: { x: 60, y: 90 } });                // inside the south rectangle
  await expect(page.locator('#map-out')).toHaveText('Selected: south');
});

// ==== HARD 3: A reusable helper to check a chart ====
// > Put chart checks in a function so every test reads the same way: labels and values in one object.
test('chart data helper', async ({ page }) => {
  const chartData: Record<string, number> = await page.locator('#chart rect.bar').evaluateAll((bars) =>
    Object.fromEntries(bars.map((b) => [b.getAttribute('data-label'), Number(b.getAttribute('data-value'))])));
  expect(chartData).toEqual({ Q1: 30, Q2: 80, Q3: 55, Q4: 95 });
  const best = Object.entries(chartData).sort((a, b) => b[1] - a[1])[0];
  expect(best).toEqual(['Q4', 95]);
});

// ==== HARD 4: Bar height matches the value ====
// > Visual data should match the real data. Compare the drawn height with the value to catch rendering bugs.
test('drawn height matches the value', async ({ page }) => {
  const bars = await page.locator('#chart rect.bar').evaluateAll((els) =>
    els.map((e) => ({ value: Number(e.getAttribute('data-value')), height: Number(e.getAttribute('height')) })));
  for (const b of bars) expect(b.height).toBe(b.value);
});
