import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

const { Given, When, Then } = createBdd();

Given('the shop page is open', async ({ page }) => {
  await page.goto('/shop.html');
});

When('I sign in as {string} with password {string}', async ({ page }, email: string, password: string) => {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
});

Then('I see the message {string}', async ({ page }, text: string) => {
  await expect(page.getByRole('alert')).toHaveText(text);
});

When('I add the product {string} to the cart', async ({ page }, product: string) => {
  await page.locator('.product').filter({ has: page.getByText(product, { exact: true }) }).getByRole('button', { name: 'Add to cart' }).click();
});

Then('the cart shows {int} item', async ({ page }, count: number) => {
  await expect(page.getByRole('link', { name: /^Cart/ })).toHaveText(`Cart (${count})`);
});
