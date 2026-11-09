import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => { await request.post('/api/reset'); });

// ==== BASIC 1: URL patterns: glob, regex and predicate ====
// > The first argument of `route` can be a glob (`**` any path, `*` any text except `/`), a regular expression, or a function. Use the narrowest pattern that works. Handlers run from the NEWEST to the OLDEST, and each one passes the request on with `fallback()`.
test('glob, regex and function patterns', async ({ page }) => {
  const seen: string[] = [];
  await page.route('**/api/products', (r) => { seen.push('glob'); return r.fallback(); });
  await page.route(/\/api\/products$/, (r) => { seen.push('regex'); return r.fallback(); });
  await page.route((url) => url.pathname === '/api/products' && url.search === '', (r) => { seen.push('function'); return r.fallback(); });
  await page.goto('/shop.html');
  await expect(page.locator('.product')).toHaveCount(3);
  expect(seen).toEqual(['function', 'regex', 'glob']);                  // the LAST registered handler runs FIRST
});

// ==== BASIC 2: The last route wins, fallback passes the request on ====
// > Handlers are tried from the newest to the oldest. `route.fallback()` hands the request to the next handler; `route.continue()` stops the chain and sends it to the network; `route.fulfill()` answers it yourself.
test('handler order and fallback', async ({ page }) => {
  await page.route('**/api/products', (r) => r.fulfill({ json: [{ id: 1, name: 'From the first handler', price: 1 }] }));
  await page.route('**/api/products', async (r) => {
    const response = await r.fetch();                                      // would go to the real server...
    void response;
    await r.fallback();                                                    // ...but we pass on to the older handler
  });
  await page.goto('/shop.html');
  await expect(page.getByText('From the first handler')).toBeVisible();
});

// ==== BASIC 3: Run a handler only N times ====
// > The `times` option removes the handler after N uses. Great for "fail once, then succeed" tests of retry logic.
test('times: fail the first call only', async ({ page }) => {
  await page.route('**/api/products', (r) => r.fulfill({ status: 500, json: {} }), { times: 1 });
  await page.goto('/shop.html');
  await expect(page.getByText('Could not load products')).toBeVisible();
  await page.reload();                                                     // handler is gone: the real answer
  await expect(page.locator('.product')).toHaveCount(3);
});

// ==== BASIC 4: Remove handlers ====
// > `unroute` removes one pattern, `unrouteAll` removes every handler (and can wait for running ones to finish).
test('unroute and unrouteAll', async ({ page }) => {
  await page.route('**/api/products', (r) => r.fulfill({ json: [] }));
  await page.goto('/shop.html');
  await expect(page.getByText('No products found')).toBeVisible();
  await page.unrouteAll({ behavior: 'wait' });
  await page.reload();
  await expect(page.locator('.product')).toHaveCount(3);
});

// ==== INTERMEDIATE 1: Change a request on its way ====
// > `continue` can override the url, method, headers and body. The server sees your version; the page does not know.
test('continue with overrides', async ({ page }) => {
  let echoed: { customHeader: string; method: string } | undefined;
  await page.goto('/');
  await page.route('**/api/echo', (r) => r.continue({ headers: { ...r.request().headers(), 'x-demo': 'injected' }, method: 'POST', postData: '{"changed":true}' }));
  echoed = await page.evaluate(async () => (await fetch('/api/echo')).json());
  expect(echoed).toMatchObject({ customHeader: 'injected', method: 'POST' });
});

// ==== INTERMEDIATE 2: Read what the page sent ====
// > A `Request` object tells the method, url, headers, resource type, and the body (`postData`, `postDataJSON`, `postDataBuffer`). `isNavigationRequest()` is true for page loads.
test('inspect a request', async ({ page }) => {
  await page.goto('/');
  const [request] = await Promise.all([
    page.waitForRequest('**/api/echo'),
    page.evaluate(() => fetch('/api/echo', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Demo': 'abc' }, body: JSON.stringify({ n: 1 }) })),
  ]);
  expect(request.method()).toBe('POST');
  expect(request.resourceType()).toBe('fetch');
  expect(request.postData()).toBe('{"n":1}');
  expect(request.postDataJSON()).toEqual({ n: 1 });
  expect(request.postDataBuffer()!.length).toBe(7);
  expect(request.isNavigationRequest()).toBe(false);
  expect((await request.allHeaders())['x-demo']).toBe('abc');
  expect((await request.headersArray()).some((h) => h.name.toLowerCase() === 'x-demo')).toBe(true);     // async, unlike APIResponse.headersArray
});

// ==== INTERMEDIATE 3: Read what the server answered ====
// > A `Response` gives status, statusText, headers, body, the originating request, the server address, and for HTTPS the certificate details (for plain HTTP there are none; in 1.56 an empty object came back).
test('inspect a response', async ({ page }) => {
  const [response] = await Promise.all([page.waitForResponse('**/api/products'), page.goto('/shop.html')]);
  expect(response.status()).toBe(200);
  expect(response.statusText()).toBe('OK');
  expect(response.ok()).toBe(true);
  expect(Object.keys((await response.securityDetails()) ?? {})).toEqual([]);   // http, not https: no certificate
  expect((await response.serverAddr())?.port).toBe(3000);
  expect((await response.allHeaders())['content-type']).toContain('json');
  expect(await response.headerValue('content-type')).toContain('json');
  expect(response.request().url()).toBe(response.url());
  expect((await response.json()).length).toBe(3);
});

// ==== INTERMEDIATE 4: Redirects as seen by the browser ====
// > After a redirect, the final request knows where it came from through `redirectedFrom()`, and the first one knows its `redirectedTo()`.
test('redirect chain', async ({ page }) => {
  await page.goto('/');
  const [response] = await Promise.all([
    page.waitForResponse('**/api/products'),
    page.evaluate(() => fetch('/api/redirect-chain')),
  ]);
  const final = response.request();
  expect(final.redirectedFrom()).not.toBeNull();
  expect(final.redirectedFrom()!.url()).toContain('/api/redirect');
  expect(final.redirectedFrom()!.redirectedTo()).toBe(final);
});

// ==== INTERMEDIATE 5: Extra headers for every request ====
// > `page.setExtraHTTPHeaders` and `context.setExtraHTTPHeaders` add headers to all requests (for example a test-run id). They are cheaper than a route handler.
test('extra HTTP headers', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-demo': 'on-every-request' });
  await page.goto('/');
  const echoed = await page.evaluate(async () => (await fetch('/api/echo')).json());
  expect(echoed.customHeader).toBe('on-every-request');
});

// ==== INTERMEDIATE 6: Watch traffic without changing it ====
// > The events `request`, `response`, `requestfinished` and `requestfailed` let you log or assert on all traffic. `request.timing()` gives the timings of a finished request.
test('traffic events and timing', async ({ page }) => {
  const finished: string[] = [];
  const failed: string[] = [];
  const timings: number[] = [];
  page.on('requestfinished', (r) => { finished.push(new URL(r.url()).pathname); if (r.url().endsWith('/api/products')) timings.push(r.timing().responseEnd); });
  page.on('requestfailed', (r) => failed.push(r.url()));
  await page.route('**/api/status/500', (r) => r.abort('failed'));
  await page.goto('/shop.html');
  await expect(page.locator('.product')).toHaveCount(3);
  await page.evaluate(() => fetch('/api/status/500').catch(() => {}));
  await expect.poll(() => finished).toContain('/api/products');
  await expect.poll(() => failed.length).toBe(1);
  expect(timings[0]).toBeGreaterThan(0);                                   // milliseconds until the response ended
});

// ==== HARD 1: context.route covers every page and popup ====
// > A route on the context applies to all pages of that context, including tabs opened later.
test('context.route applies to new tabs', async ({ page, context }) => {
  await context.route('**/api/products', (r) => r.fulfill({ json: [{ id: 7, name: 'Context mock', price: 7 }] }));
  await page.goto('/shop.html');
  await expect(page.getByText('Context mock')).toBeVisible();
  const second = await context.newPage();
  await second.goto('/shop.html');
  await expect(second.getByText('Context mock')).toBeVisible();
});

// ==== HARD 2: Fulfil from a file or with custom headers ====
// > `fulfill` can also take a `path` to a file, a `body` string or Buffer, custom `headers` and `contentType`.
test('fulfill with body and headers', async ({ page }) => {
  await page.route('**/api/products', (r) => r.fulfill({
    status: 200,
    headers: { 'x-mocked': 'yes', 'content-type': 'application/json' },
    body: JSON.stringify([{ id: 1, name: 'Header mock', price: 1 }]),
  }));
  const [response] = await Promise.all([page.waitForResponse('**/api/products'), page.goto('/shop.html')]);
  expect(response.headers()['x-mocked']).toBe('yes');
  await expect(page.getByText('Header mock')).toBeVisible();
});

// ==== HARD 3: Simulate a slow network for ONE call ====
// > Delay inside the handler, then continue. The UI should show its waiting state and then the data.
test('delay one request', async ({ page }) => {
  const started = Date.now();
  await page.route('**/api/products', async (r) => { await new Promise((res) => setTimeout(res, 1000)); await r.continue(); });
  await page.goto('/shop.html');
  await expect(page.locator('.product')).toHaveCount(3);
  expect(Date.now() - started).toBeGreaterThanOrEqual(1000);
});

// ==== HARD 4: Block everything except what you allow ====
// > An allow-list keeps tests fast and independent of third-party scripts. Abort everything that is not your own origin or API.
test('allow-list of requests', async ({ page }) => {
  const blocked: string[] = [];
  await page.route('**/*', (route) => {
    const { hostname, pathname } = new URL(route.request().url());
    if (hostname === 'localhost' && !pathname.startsWith('/tracking')) return route.continue();
    blocked.push(route.request().url());
    return route.abort();
  });
  await page.goto('/shop.html');
  await page.evaluate(() => fetch('/tracking/pixel').catch(() => {}));
  await expect(page.locator('.product')).toHaveCount(3);
  expect(blocked).toEqual(['http://localhost:3000/tracking/pixel']);
});

// ==== HARD 5: WebSocket route details ====
// > `routeWebSocket` can answer messages, or `connectToServer()` to forward and spy. React to the close with `onClose`.
test('websocket onClose', async ({ page }) => {
  let closed = false;
  await page.routeWebSocket('ws://localhost:3000/ws', (ws) => {
    ws.onMessage((m) => ws.send(`pong:${m}`));
    ws.onClose(() => { closed = true; });
  });
  await page.goto('/extras.html');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.locator('#ws-log li')).toHaveText('pong:hello');
  await page.goto('/');                                                    // leaving the page closes the socket
  await expect.poll(() => closed).toBe(true);
});
