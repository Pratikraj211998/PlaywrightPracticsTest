import { test, expect, Locator } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/filter.html');
  await expect(page.locator('.card')).toHaveCount(12);
});

// ==== BASIC 1: Count and list every match ====
// > When a locator matches many elements, `toHaveCount` checks the number and `allTextContents()` lists their text. Wait for the count first so you read a complete list.
test('count and list all product names', async ({ page }) => {
  const titles = page.locator('.card .title');
  await expect(titles).toHaveCount(12);
  const names = await titles.allTextContents();
  expect(names.slice(0, 3)).toEqual(['iPhone 15', 'Galaxy S24', 'Pixel 8']);
});

// ==== BASIC 2: Filter by text ====
// > `filter({ hasText })` keeps only elements that contain the text (a string is a case-insensitive substring; a regex is also allowed).
test('filter by text and regex', async ({ page }) => {
  const cards = page.locator('.card');
  await expect(cards.filter({ hasText: 'Laptop' })).toHaveCount(4);
  await expect(cards.filter({ hasText: /^iphone/i })).toHaveCount(1);
  await expect(cards.filter({ hasNotText: 'Out of stock' })).toHaveCount(9);
});

// ==== BASIC 3: Pick by position ====
// > `first()`, `last()` and `nth()` pick one. Use them when the ORDER is meaningful, for example "the first search result".
test('first, last, nth', async ({ page }) => {
  const cards = page.locator('.card');
  await expect(cards.first().locator('.title')).toHaveText('iPhone 15');
  await expect(cards.last().locator('.title')).toHaveText('Earbuds Lite');
  await expect(cards.nth(4).locator('.title')).toHaveText('MacBook Air');
});

// ==== INTERMEDIATE 1: Filter by a child element ====
// > `filter({ has: locator })` keeps elements that CONTAIN a matching child. `hasNot` keeps the others. This reads like "cards that have an In stock badge".
test('filter by child with has and hasNot', async ({ page }) => {
  const inStock = page.locator('.card').filter({ has: page.getByText('In stock', { exact: true }) });
  const outOfStock = page.locator('.card').filter({ has: page.getByText('Out of stock') });
  await expect(inStock).toHaveCount(9);
  await expect(outOfStock).toHaveCount(3);
  await expect(outOfStock.locator('.title')).toHaveText(['Pixel 8', 'ThinkPad X1', 'JBL Flip']);
  const notInStock = page.locator('.card').filter({ hasNot: page.getByText('In stock', { exact: true }) });
  await expect(notInStock).toHaveCount(3);
});

// ==== INTERMEDIATE 2: Chain several filters (AND) ====
// > Each `.filter()` narrows the result. Chained filters mean AND: Laptop category AND in stock.
test('chained filters: AND logic', async ({ page }) => {
  const laptopsInStock = page.locator('.card')
    .filter({ has: page.getByText('Laptop', { exact: true }) })
    .filter({ has: page.getByText('In stock', { exact: true }) });
  await expect(laptopsInStock.locator('.title')).toHaveText(['MacBook Air', 'Dell XPS 13', 'Chromebook']);
});

// ==== INTERMEDIATE 3: or() for OR logic ====
// > `a.or(b)` matches elements that match either locator. Handy for "Phone cards OR Audio cards".
test('or logic', async ({ page }) => {
  const phones = page.locator('.card').filter({ hasText: 'Phone' });
  const audio = page.locator('.card').filter({ hasText: 'Audio' });
  await expect(phones.or(audio)).toHaveCount(8);
});

// ==== INTERMEDIATE 4: Act on every match ====
// > Loop over `all()` to click or tick many elements. Playwright re-checks each element before the action.
test('tick every Audio card', async ({ page }) => {
  const audio = page.locator('.card').filter({ has: page.getByText('Audio', { exact: true }) });
  for (const card of await audio.all()) {
    await card.getByLabel('Compare').check();
  }
  await expect(page.locator('#selected')).toHaveText('4 selected');
  await expect(page.locator('.pick:checked')).toHaveCount(4);
});

// ==== INTERMEDIATE 5: Visible elements only ====
// > After clicking a category button the other cards are hidden, not removed. `filter({ visible: true })` keeps only what the user can see.
test('visible filter after clicking a category', async ({ page }) => {
  await page.getByRole('button', { name: 'Phone' }).click();
  const visible = page.locator('.card').filter({ visible: true });
  await expect(visible).toHaveCount(4);
  await expect(page.locator('#count')).toHaveText('4 products');
  await expect(page.locator('.card').filter({ visible: false })).toHaveCount(8);
});

// ==== HARD 1: Find the cheapest and most expensive ====
// > Read the prices of all cards, turn them into numbers, find the extreme, then locate the card with that price. `evaluateAll` reads everything in ONE call.
test('cheapest and most expensive product', async ({ page }) => {
  const prices = await page.locator('.card .price').evaluateAll((els) => els.map((e) => Number(e.textContent!.replace('$', ''))));
  const cheapest = Math.min(...prices);
  const dearest = Math.max(...prices);
  expect([cheapest, dearest]).toEqual([29, 1399]);

  const cheapCard = page.locator('.card').filter({ has: page.getByText(`$${cheapest}`, { exact: true }) });
  await expect(cheapCard.locator('.title')).toHaveText('Earbuds Lite');
  const dearCard = page.locator('.card').filter({ has: page.getByText(`$${dearest}`, { exact: true }) });
  await expect(dearCard.locator('.title')).toHaveText('ThinkPad X1');
});

// ==== HARD 2: Filter with your own rule (price under 300 AND in stock) ====
// > When the rule is numeric, build the filter in code: read data from every card, apply your rule, then act on the matching cards.
test('custom rule: in stock and cheaper than $300', async ({ page }) => {
  type Row = { title: string; price: number; inStock: boolean; card: Locator };
  const rows: Row[] = [];
  for (const card of await page.locator('.card').all()) {
    rows.push({
      title: await card.locator('.title').innerText(),
      price: Number((await card.locator('.price').innerText()).replace('$', '')),
      inStock: (await card.locator('.stock').innerText()) === 'In stock',
      card,
    });
  }
  const wanted = rows.filter((r) => r.inStock && r.price < 300);
  expect(wanted.map((r) => r.title)).toEqual(['Nokia 3310', 'Chromebook', 'AirPods Pro', 'Earbuds Lite']);
  for (const r of wanted) await r.card.getByRole('button', { name: 'Add to cart' }).click();
});

// ==== HARD 3: Verify sorting and uniqueness of a list ====
// > Collect the values, then check them with plain code: unique names, sorted ratings, grouped counts.
test('uniqueness and grouping', async ({ page }) => {
  const names = await page.locator('.card .title').allTextContents();
  expect(new Set(names).size).toBe(names.length);

  const categories = await page.locator('.card .cat').allTextContents();
  const counts = categories.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c]: (acc[c] ?? 0) + 1 }), {});
  expect(counts).toEqual({ Phone: 4, Laptop: 4, Audio: 4 });
});

// ==== HARD 4: Type to filter, then wait for the filtered list ====
// > The page filters as you type. A web-first assertion waits for the list to settle, so no sleep is needed.
test('search box filters the list', async ({ page }) => {
  await page.getByLabel('Search').fill('book');
  await expect(page.locator('.card').filter({ visible: true }).locator('.title')).toHaveText(['MacBook Air', 'Chromebook']);
  await page.getByLabel('Search').clear();
  await expect(page.locator('#count')).toHaveText('12 products');
});
