import { expect as baseExpect, Locator } from '@playwright/test';

// Domain-specific assertions. Wrapping a web-first assertion keeps the automatic retry.
export const expect = baseExpect.extend({
  async toHaveProductCount(cards: Locator, expected: number) {
    let pass = true;
    let message = '';
    try {
      await baseExpect(cards).toHaveCount(expected);
    } catch (error) {
      pass = false;
      message = (error as Error).message;
    }
    return { pass, message: () => (pass ? `expected NOT ${expected} products` : `toHaveProductCount: ${message}`) };
  },
});
