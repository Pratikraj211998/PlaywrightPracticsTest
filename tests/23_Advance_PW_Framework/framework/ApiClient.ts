import { APIRequestContext, APIResponse, expect } from '@playwright/test';
import { NewProduct } from './factories';

export interface Product { id: number; name: string; price: number; category: string }

// A typed API layer. It checks status codes with helpful messages, and tests stay readable.
export class ProductsApi {
  constructor(private readonly request: APIRequestContext) {}

  private async json<T>(response: APIResponse, expected: number): Promise<T> {
    const body = await response.text();
    expect(response.status(), `${response.url()} answered: ${body}`).toBe(expected);
    return JSON.parse(body) as T;
  }

  list() { return this.request.get('/api/products').then((r) => this.json<Product[]>(r, 200)); }
  create(data: NewProduct) { return this.request.post('/api/products', { data }).then((r) => this.json<Product>(r, 201)); }
  async remove(id: number) { expect((await this.request.delete(`/api/products/${id}`)).status()).toBe(204); }
}
