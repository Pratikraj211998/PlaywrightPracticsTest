import { test as base, expect, Locator, Page, APIRequestContext } from '@playwright/test';

// ==== LEVEL 1: Without a Page Object (and why it hurts) ====
// > Every test repeats the same locators. If the button text changes, you must edit every test. This is the problem the Page Object Model solves.
base.describe('level 1: no page object', () => {
  base('login (copy 1)', async ({ page }) => {
    await page.goto('/shop.html');
    await page.getByLabel('Email').fill('asha@example.com');
    await page.getByLabel('Password').fill('secret');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('Welcome');
  });
  base('login (copy 2: the same lines again)', async ({ page }) => {
    await page.goto('/shop.html');
    await page.getByLabel('Email').fill('asha@example.com');
    await page.getByLabel('Password').fill('wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Invalid credentials');
  });
});

// ==== LEVEL 2: Your first Page Object ====
// > A class for one page. The constructor receives `page` and builds the locators ONCE. Methods are the things a user can do. The test now reads like a sentence.
class SimpleLoginPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly signIn: Locator;
  readonly message: Locator;

  constructor(private readonly page: Page) {
    this.email = page.getByLabel('Email');
    this.password = page.getByLabel('Password');
    this.signIn = page.getByRole('button', { name: 'Sign in' });
    this.message = page.getByRole('alert');
  }

  async open() { await this.page.goto('/shop.html'); }

  async login(email: string, password: string) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.signIn.click();
  }
}

base('level 2: simple page object', async ({ page }) => {
  const loginPage = new SimpleLoginPage(page);
  await loginPage.open();
  await loginPage.login('asha@example.com', 'secret');
  await expect(loginPage.message).toContainText('Welcome');         // the assertion stays in the TEST
});

// ==== LEVEL 3: A base class for shared behaviour ====
// > Things every page needs (opening a path, reading the title, waiting for load) live in `BasePage`. Page objects `extend` it. Mark the shared `page` as `protected` so tests cannot reach into it.
class BasePage {
  constructor(protected readonly page: Page) {}
  protected async goto(path: string) { await this.page.goto(path); }
  async title() { return this.page.title(); }
  async reload() { await this.page.reload(); }
}

class LoginPage extends BasePage {
  readonly email = this.page.getByLabel('Email');
  readonly password = this.page.getByLabel('Password');
  readonly signIn = this.page.getByRole('button', { name: 'Sign in' });
  readonly message = this.page.getByRole('alert');

  async open() { await this.goto('/shop.html'); }
  async login(email: string, password: string) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.signIn.click();
  }
}

base('level 3: inheritance from BasePage', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.open();
  expect(await loginPage.title()).toBe('Demo Shop');
  await loginPage.login('asha@example.com', 'secret');
  await expect(loginPage.message).toHaveText('Welcome, asha@example.com');
});

// ==== LEVEL 4: Components for reusable pieces ====
// > A navigation bar or a table appears on many pages. Give each its own small class and USE it inside page objects (composition: "a page HAS a nav bar").
class NavBar {
  readonly cart: Locator;
  constructor(private readonly page: Page) { this.cart = page.getByRole('link', { name: /^Cart/ }); }
  async cartCount() { return Number((await this.cart.innerText()).match(/\d+/)![0]); }
}

class ShopPage extends BasePage {
  readonly nav = new NavBar(this.page);
  readonly products = this.page.locator('.product');
  async open() { await this.goto('/shop.html'); await expect(this.products).toHaveCount(3); }
  async addToCart(name: string) {
    await this.products.filter({ has: this.page.getByText(name, { exact: true }) }).getByRole('button', { name: 'Add to cart' }).click();
  }
}

base('level 4: components inside pages', async ({ page, request }) => {
  await request.post('/api/reset');
  const shop = new ShopPage(page);
  await shop.open();
  await shop.addToCart('Phone');
  await shop.addToCart('Laptop');
  expect(await shop.nav.cartCount()).toBe(2);
});

// ==== LEVEL 5: A generic table component ====
// > One `DataTable` class works for every table in the project. Tests ask for a cell by row text and column name.
class DataTable {
  constructor(private readonly root: Locator) {}
  rows() { return this.root.locator('tbody tr'); }
  row(text: string) { return this.root.locator('tbody tr', { hasText: text }); }
  async headers() { return (await this.root.locator('thead th').allInnerTexts()).map((h) => h.trim()); }
  async cell(rowText: string, column: string) {
    const index = (await this.headers()).indexOf(column);
    return this.row(rowText).locator('td').nth(index);
  }
  async toObjects(): Promise<Record<string, string>[]> {
    const headers = await this.headers();
    return this.rows().evaluateAll((trs, hs) =>
      trs.map((tr) => Object.fromEntries([...tr.querySelectorAll('td')].map((td, i) => [hs[i], td.textContent!.trim()]))), headers);
  }
}

class TablesPage extends BasePage {
  readonly employees = new DataTable(this.page.locator('#employees'));
  readonly orders = new DataTable(this.page.locator('#orders'));
  async open() { await this.goto('/tables.html'); }
}

base('level 5: reusable table component', async ({ page }) => {
  const tables = new TablesPage(page);
  await tables.open();
  await expect(await tables.employees.cell('Meena', 'Department')).toHaveText('Dev');
  const orders = await (async () => { await expect(tables.orders.rows()).toHaveCount(5); return tables.orders.toObjects(); })();
  expect(orders[0]).toEqual({ 'Order ID': '101', Customer: 'Ann', Amount: '250', Status: 'Paid' });
});

// ==== LEVEL 6: Page objects delivered by fixtures ====
// > Instead of writing `new ShopPage(page)` in every test, let a fixture create it. The test asks for `shopPage` by name (dependency injection).
const test = base.extend<{ loginPage: LoginPage; shopPage: ShopPage; tablesPage: TablesPage }>({
  loginPage: async ({ page }, use) => { await use(new LoginPage(page)); },
  shopPage: async ({ page }, use) => { await use(new ShopPage(page)); },
  tablesPage: async ({ page }, use) => { await use(new TablesPage(page)); },
});

test('level 6: fixtures give you page objects', async ({ loginPage, shopPage }) => {
  await loginPage.open();
  await loginPage.login('asha@example.com', 'secret');
  await expect(loginPage.message).toContainText('Welcome');
  await shopPage.open();
  expect(await shopPage.nav.cartCount()).toBe(0);
});

// ==== LEVEL 7: Fluent style: methods that return the next object ====
// > Returning `this` lets you chain steps. Returning another page object models navigation, so the compiler tells you where you are.
class HomePage extends BasePage {
  async open() { await this.goto('/'); return this; }
  async goToShop() {
    await this.page.getByRole('link', { name: 'Shop' }).click();
    return new FluentShopPage(this.page);
  }
}
class FluentShopPage extends BasePage {
  readonly nav = new NavBar(this.page);
  async add(name: string) {
    await this.page.locator('.product').filter({ has: this.page.getByText(name, { exact: true }) }).getByRole('button').click();
    return this;                                                    // chainable
  }
}

test('level 7: fluent navigation and chaining', async ({ page }) => {
  const home = await new HomePage(page).open();
  const shop = await home.goToShop();
  await expect(page.locator('.product')).toHaveCount(3);
  await (await shop.add('Laptop')).add('Phone');
  expect(await shop.nav.cartCount()).toBe(2);
});

// ==== LEVEL 8: Dynamic locators with methods ====
// > A locator that depends on data is a METHOD with a parameter. A fixed locator is a field. This keeps the class small even for tables with hundreds of rows.
class FilterPage extends BasePage {
  readonly search = this.page.getByLabel('Search');
  async open() { await this.goto('/filter.html'); }
  card(name: string) { return this.page.locator('.card').filter({ has: this.page.getByText(name, { exact: true }) }); }
  category(name: string) { return this.page.getByRole('button', { name }); }
  visibleCards() { return this.page.locator('.card').filter({ visible: true }); }
}

test('level 8: locator methods with parameters', async ({ page }) => {
  const filter = new FilterPage(page);
  await filter.open();
  await filter.category('Audio').click();
  await expect(filter.visibleCards()).toHaveCount(4);
  await expect(filter.card('AirPods Pro').locator('.price')).toHaveText('$249');
});

// ==== LEVEL 9: Page objects plus an API helper for test data ====
// > Create data through the API (fast and reliable), then use the page object only for what the UI should show. A fixture creates and deletes the data.
class ProductsApi {
  constructor(private readonly request: APIRequestContext) {}
  async create(name: string, price: number) {
    const r = await this.request.post('/api/products', { data: { name, price } });
    return (await r.json()) as { id: number; name: string; price: number };
  }
  async remove(id: number) { await this.request.delete(`/api/products/${id}`); }
}

const apiTest = test.extend<{ productsApi: ProductsApi; newProduct: { id: number; name: string; price: number } }>({
  productsApi: async ({ request }, use) => { await use(new ProductsApi(request)); },
  newProduct: async ({ productsApi }, use) => {
    const product = await productsApi.create(`POM Item ${Date.now()}`, 42);
    await use(product);
    await productsApi.remove(product.id);                          // teardown
  },
});

apiTest('level 9: API creates the data, the page object checks it', async ({ page, newProduct }) => {
  await page.goto('/shop.html');
  await expect(page.getByTestId(`product-${newProduct.id}`)).toContainText(newProduct.name);
});

// ==== LEVEL 10: A registry of all pages ====
// > When a flow touches many pages, create them all from one class. Tests then use `app.login`, `app.shop`, `app.tables`.
class App {
  readonly login: LoginPage;
  readonly shop: ShopPage;
  readonly tables: TablesPage;
  constructor(page: Page) {
    this.login = new LoginPage(page);
    this.shop = new ShopPage(page);
    this.tables = new TablesPage(page);
  }
}
const appTest = base.extend<{ app: App }>({ app: async ({ page }, use) => { await use(new App(page)); } });

appTest('level 10: one app object with all pages', async ({ app }) => {
  await app.login.open();
  await app.login.login('asha@example.com', 'secret');
  await expect(app.login.message).toContainText('Welcome');
  await app.tables.open();
  await expect(app.tables.employees.rows()).toHaveCount(6);
});

// ==== LEVEL 11: Locator fields or getters? ====
// > A field is built once in the constructor. A getter builds a fresh locator each time. Both are lazy, so either works; fields are simpler. Use a getter when the locator depends on state of the object.
class GetterPage extends BasePage {
  private current = 'Phone';
  get currentCategory() { return this.page.getByRole('button', { name: this.current }); }     // depends on object state
  select(name: string) { this.current = name; return this; }
}
base('level 11: getters depend on state', async ({ page }) => {
  await page.goto('/filter.html');
  const p = new GetterPage(page);
  await p.select('Laptop').currentCategory.click();
  await expect(page.locator('#count')).toHaveText('4 products');
});

// ==== LEVEL 12: Rules to keep your Page Objects healthy ====
// > (1) Keep ASSERTIONS in tests, not in page objects (a page object that asserts is hard to reuse for a negative test). (2) Name methods after what the USER does (`login`, not `clickSubmitButton`). (3) One class per page or component, never one giant class. (4) No `waitForTimeout` anywhere. (5) Do not expose raw `page` to tests; expose actions and locators. (6) Return values (a number, a list), not locators, when the test needs data. The test below shows a page object that gives DATA and a test that makes the DECISION.
class CartPage extends BasePage {
  readonly nav = new NavBar(this.page);
  async productNames() { return this.page.locator('.product .name').allInnerTexts(); }   // data, no assertion
}
base('level 12: page object gives data, test decides', async ({ page }) => {
  await page.goto('/shop.html');
  await expect(page.locator('.product')).toHaveCount(3);
  const cart = new CartPage(page);
  expect(await cart.productNames()).toEqual(['Laptop', 'Phone', 'Headphones']);
});
