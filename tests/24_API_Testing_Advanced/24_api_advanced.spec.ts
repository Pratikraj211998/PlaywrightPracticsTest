import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('/api/reset');
  await request.post('/api/flaky-reset');
});

// ==== BASIC 1: What is inside an APIResponse ====
// > Besides `status()` and `json()` you can read `statusText()`, `ok()`, `url()`, all headers, and the raw `body()` bytes.
test('everything in an APIResponse', async ({ request }) => {
  const r = await request.get('/api/products');
  expect(r.status()).toBe(200);
  expect(r.statusText()).toBe('OK');
  expect(r.ok()).toBe(true);
  expect(r.url()).toBe('http://localhost:3000/api/products');
  expect(r.headers()['content-type']).toContain('json');                 // lower-case names, one value each
  expect(r.headersArray().some((h) => h.name.toLowerCase() === 'content-type')).toBe(true);   // keeps repeated headers
  expect((await r.body()).length).toBeGreaterThan(50);
  expect(await r.text()).toContain('Laptop');
});

// ==== BASIC 2: Query parameters, headers and the request body ====
// > `params` becomes the query string. `headers` adds headers. `data` can be an object (sent as JSON), a string or a Buffer. The echo endpoint shows exactly what the server received.
test('params, headers and data types', async ({ request }) => {
  const a = await request.get('/api/echo', { params: { q: 'phone', page: 2 }, headers: { 'X-Demo': 'hello' } });
  expect(await a.json()).toMatchObject({ method: 'GET', query: { q: 'phone', page: '2' }, customHeader: 'hello' });

  const objectBody = await (await request.post('/api/echo', { data: { a: 1 } })).json();
  expect(objectBody).toMatchObject({ contentType: 'application/json', body: '{"a":1}' });

  const stringBody = await (await request.post('/api/echo', { data: 'plain text', headers: { 'content-type': 'text/plain' } })).json();
  expect(stringBody).toMatchObject({ contentType: 'text/plain', body: 'plain text' });
});

// ==== BASIC 3: Form data (application/x-www-form-urlencoded) ====
// > Older systems and login forms often expect `form` data, not JSON. Use the `form` option.
test('form data', async ({ request }) => {
  const r = await request.post('/api/form', { form: { username: 'asha', remember: 'yes' } });
  expect(await r.json()).toEqual({ contentType: 'application/x-www-form-urlencoded', fields: { username: 'asha', remember: 'yes' } });
});

// ==== BASIC 4: Test error statuses without exceptions ====
// > By default a 4xx or 5xx response is NOT an exception, so you can assert on it. Ask for exceptions with `failOnStatusCode` when a failure should stop the test.
test('error statuses and failOnStatusCode', async ({ request }) => {
  const notFound = await request.get('/api/status/404');
  expect(notFound.status()).toBe(404);
  expect(notFound.ok()).toBe(false);
  await expect(request.get('/api/status/500', { failOnStatusCode: true })).rejects.toThrow(/500/);
});

// ==== INTERMEDIATE 1: Redirects ====
// > Redirects are followed by default (up to 20). Turn them off with `maxRedirects: 0` to check the 302 itself and its `Location` header.
test('redirects', async ({ request }) => {
  const followed = await request.get('/api/redirect');
  expect(followed.status()).toBe(200);
  expect(followed.url()).toContain('/api/products');

  const raw = await request.get('/api/redirect', { maxRedirects: 0 });
  expect(raw.status()).toBe(302);
  expect(raw.headers()['location']).toBe('/api/products');
});

// ==== INTERMEDIATE 2: Timeouts ====
// > A request that takes longer than `timeout` throws. Use it to test slow endpoints and to keep tests from hanging.
test('request timeout', async ({ request }) => {
  await expect(request.get('/api/slow', { timeout: 200 })).rejects.toThrow(/Timeout 200ms exceeded/);
  const ok = await request.get('/api/slow', { timeout: 5000 });
  expect(ok.status()).toBe(200);
});

// ==== INTERMEDIATE 3: Automatic retries for flaky services ====
// > `maxRetries` retries network errors such as connection resets (NOT HTTP error statuses). For status-based retries write your own loop, like the one below.
test('retry on 503 with a loop', async ({ request }) => {
  let response = await request.get('/api/flaky');
  let attempts = 1;
  while (response.status() === 503 && attempts < 5) {
    await new Promise((r) => setTimeout(r, 50 * attempts));
    response = await request.get('/api/flaky');
    attempts++;
  }
  expect(response.status()).toBe(200);
  expect(attempts).toBe(3);                                  // two failures, then success
});

// ==== INTERMEDIATE 4: Binary responses ====
// > `body()` returns a Buffer. Compare bytes, sizes or checksums for images, PDFs and zip files.
test('binary body', async ({ request }) => {
  const body = await (await request.get('/api/binary')).body();
  expect(body.length).toBe(256);
  expect(body[0]).toBe(0);
  expect(body[255]).toBe(255);
});

// ==== INTERMEDIATE 5: request.fetch with any method ====
// > `fetch` is the general form behind `get`, `post`, `put` and so on. Use it when the method comes from data.
test('request.fetch with a method name', async ({ request }) => {
  for (const method of ['GET', 'DELETE', 'PUT']) {
    const r = await request.fetch('/api/echo', { method, data: method === 'GET' ? undefined : { x: 1 } });
    expect((await r.json()).method).toBe(method);
  }
});

// ==== INTERMEDIATE 6: A separate API context ====
// > `playwright.request.newContext` creates a client with its own base URL and default headers, independent of any browser. Dispose it when finished.
test('dedicated API context with default headers', async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:3000', extraHTTPHeaders: { 'X-Demo': 'from-context' } });
  expect((await (await api.get('/api/echo')).json()).customHeader).toBe('from-context');
  expect((await (await api.get('/api/echo', { headers: { 'X-Demo': 'override' } })).json()).customHeader).toBe('override');
  await api.dispose();
});

// ==== HARD 1: Cookies are shared between the page and its request context ====
// > `page.request` uses the SAME cookie jar as the browser. Log in with the API and the page is logged in too. A request context made with `playwright.request.newContext` has its OWN jar.
test('page.request shares cookies with the browser', async ({ page }) => {
  await page.goto('/storage.html');
  await page.request.get('/api/set-secure-cookie');
  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.name === 'sid')).toBe(true);
});

test('a separate context has its own cookies', async ({ page, playwright }) => {
  const other = await playwright.request.newContext({ baseURL: 'http://localhost:3000' });
  await other.get('/api/set-secure-cookie');
  expect((await other.storageState()).cookies.some((c) => c.name === 'sid')).toBe(true);
  await page.goto('/storage.html');
  expect((await page.context().cookies()).some((c) => c.name === 'sid')).toBe(false);   // the browser did not get it
  await other.dispose();
});

// ==== HARD 2: Save a login from the API and reuse it in the browser ====
// > The request context can write a `storageState` too. That file can start a browser context that is already logged in, with no UI steps.
test('API login becomes a browser session', async ({ browser, playwright }, testInfo) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:3000' });
  await api.post('/api/login', { data: { email: 'asha@example.com', password: 'secret' } });
  const file = testInfo.outputPath('api-state.json');
  await api.storageState({ path: file });
  await api.dispose();

  const context = await browser.newContext({ storageState: file });
  const cookies = await context.cookies('http://localhost:3000');
  expect(cookies.find((c) => c.name === 'session')?.value).toBe('abc123');
  await context.close();
});

// ==== HARD 3: GraphQL: one URL, the query is in the body ====
// > A GraphQL call is a normal POST. The operation is in the body (`query`, `variables`, `operationName`). Errors often come back with status 200, so always check the `errors` field.
test('GraphQL query and mutation', async ({ request }) => {
  const list = await request.post('/api/graphql', {
    data: { operationName: 'Products', query: 'query Products { products { id name } }' },
  });
  const body = await list.json();
  expect(body.errors).toBeUndefined();
  expect(body.data.products.map((p: { name: string }) => p.name)).toContain('Laptop');

  const add = await request.post('/api/graphql', {
    data: { operationName: 'AddProduct', query: 'mutation AddProduct($name: String!, $price: Int!) { addProduct(name: $name, price: $price) { id name } }', variables: { name: 'GQL Item', price: 5 } },
  });
  const created = (await add.json()).data.addProduct;
  expect(created.name).toBe('GQL Item');
  await request.delete(`/api/products/${created.id}`);
});

test('GraphQL errors arrive with status 200', async ({ request }) => {
  const r = await request.post('/api/graphql', { data: { operationName: 'Nope', query: '{ nope }' } });
  expect(r.status()).toBe(200);
  expect((await r.json()).errors[0].message).toBe('Unknown operation Nope');
});

// ==== HARD 4: Mock a GraphQL call by operation name ====
// > All GraphQL requests use the same URL, so decide inside the route handler by reading `operationName` from the body.
test('mock one GraphQL operation and pass the others through', async ({ page }) => {
  await page.goto('/');
  await page.route('**/api/graphql', async (route) => {
    const { operationName } = route.request().postDataJSON();
    if (operationName === 'Products') {
      await route.fulfill({ json: { data: { products: [{ id: 1, name: 'Mocked' }] } } });
    } else {
      await route.fallback();                                          // real server answers
    }
  });
  const call = (operationName: string) => page.evaluate(async (op) => {
    const r = await fetch('/api/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operationName: op, query: '{}' }) });
    return r.json();
  }, operationName);
  expect(await call('Products')).toEqual({ data: { products: [{ id: 1, name: 'Mocked' }] } });
  expect((await call('Nope')).errors[0].message).toBe('Unknown operation Nope');
});

// ==== HARD 5: A reusable typed API client with helpful errors ====
// > Put the status check in one place so every failure message includes the URL and the body.
class Api {
  constructor(private readonly request: import('@playwright/test').APIRequestContext) {}
  async json<T>(path: string, expected = 200): Promise<T> {
    const r = await this.request.get(path);
    const text = await r.text();
    expect(r.status(), `GET ${path} answered: ${text}`).toBe(expected);
    return JSON.parse(text) as T;
  }
}
test('typed client with an informative message', async ({ request }) => {
  const api = new Api(request);
  const products = await api.json<{ id: number; name: string }[]>('/api/products');
  expect(products.length).toBeGreaterThan(0);
  const missing = await api.json<{ error: string }>('/api/products/999', 404);
  expect(missing.error).toBe('Not found');
});
