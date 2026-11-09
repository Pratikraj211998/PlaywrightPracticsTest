// Test data factories: unique data per call, so parallel tests never clash.
let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export interface NewProduct { name: string; price: number; category?: string }

export function newProduct(overrides: Partial<NewProduct> = {}): NewProduct {
  return { name: `Item ${unique()}`, price: 10, category: 'test-data', ...overrides };
}

export function newEmail(prefix = 'user') {
  return `${prefix}.${unique()}@example.com`;
}
