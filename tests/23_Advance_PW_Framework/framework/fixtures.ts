import { test as base, mergeTests } from '@playwright/test';
import { loadEnv, TestEnv } from './env';
import { Logger } from './logger';
import { newProduct } from './factories';
import { Product, ProductsApi } from './ApiClient';

type Services = { env: TestEnv; log: Logger; api: ProductsApi; product: Product };
type Guards = { consoleGuard: void; allowConsoleErrors: boolean };

const services = base.extend<Services>({
  env: async ({}, use) => { await use(loadEnv()); },
  log: async ({}, use, testInfo) => { await use(new Logger(testInfo.title.slice(0, 30), 'warn')); },
  api: async ({ request }, use) => { await use(new ProductsApi(request)); },
  // Owns its data: created before the test, removed after, even if the test fails.
  product: async ({ api }, use) => {
    const product = await api.create(newProduct());
    await use(product);
    await api.remove(product.id).catch(() => { /* the test may have deleted it */ });
  },
});

const guards = base.extend<Guards>({
  allowConsoleErrors: [false, { option: true }],
  consoleGuard: [async ({ page, allowConsoleErrors }, use) => {
    const problems: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
    await use();
    if (!allowConsoleErrors && problems.length) throw new Error(`Unexpected browser errors:\n${problems.join('\n')}`);
  }, { auto: true }],
});

export const test = mergeTests(services, guards);
