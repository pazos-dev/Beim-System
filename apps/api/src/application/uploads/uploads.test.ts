import { describe, expect, it } from "vitest";

import type { StoragePort, TxClient, UnitOfWork } from "../../domain/shared/ports.js";
import type { ProductId } from "../../domain/shared/types.js";
import { createProduct, type Product } from "../../domain/product/product.js";
import { makeUploadHandlers } from "./uploads.js";
import type {
  StoredUploadResult,
  UploadIdempotencyStore,
  UploadProductStore
} from "./ports.js";

class FakeUnitOfWork implements UnitOfWork {
  runs = 0;
  readonly tx = {} as TxClient;
  run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    this.runs += 1;
    return fn(this.tx);
  }
}

class FakeProductStore implements UploadProductStore {
  products = new Map<string, Product>();
  saves = 0;
  async findProduct(_tx: TxClient, id: ProductId): Promise<Product | null> {
    return this.products.get(id) ?? null;
  }
  async saveProduct(_tx: TxClient, product: Product): Promise<void> {
    this.saves += 1;
    this.products.set(product.id, product);
  }
}

class FakeStorage implements StoragePort {
  puts = 0;
  fail: Error | null = null;
  async putObject(key: string, _body: Uint8Array, _contentType: string): Promise<string> {
    this.puts += 1;
    if (this.fail !== null) throw this.fail;
    return `https://cdn.test/${key}`;
  }
}

class FakeIdempotency implements UploadIdempotencyStore {
  results = new Map<string, StoredUploadResult>();
  saves = 0;
  async findByKey(_tx: TxClient, key: string): Promise<StoredUploadResult | null> {
    return this.results.get(key) ?? null;
  }
  async save(_tx: TxClient, key: string, result: StoredUploadResult): Promise<void> {
    this.saves += 1;
    this.results.set(key, result);
  }
}

function seedProduct(): Product {
  return createProduct({
    id: "11111111-1111-4111-8111-111111111111",
    productCode: 7,
    name: "Luz de giro",
    categoryId: "cat-1",
    priceAmount: 1200,
    priceCurrency: "UYU",
    stock: 5
  });
}

const KEY = "22222222-2222-4222-8222-222222222222";
const FILENAME = "22222222-2222-4222-8222-222222222222.png";

function setup() {
  const uow = new FakeUnitOfWork();
  const products = new FakeProductStore();
  const storage = new FakeStorage();
  const idempotency = new FakeIdempotency();
  const handlers = makeUploadHandlers({ uow, products, storage, idempotency });
  return { uow, products, storage, idempotency, handlers };
}

describe("uploads handlers", () => {
  it("stores image and links product in one run", async () => {
    const { uow, products, storage, idempotency, handlers } = setup();
    products.products.set(seedProduct().id, seedProduct());

    const result = await handlers.storeProductImage({
      productId: "11111111-1111-4111-8111-111111111111",
      filename: FILENAME,
      body: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
      idempotencyKey: KEY
    });

    expect(result).toEqual({ url: `https://cdn.test/${FILENAME}`, filename: FILENAME, bytes: 3 });
    expect(products.products.get(seedProduct().id)?.image).toBe(`https://cdn.test/${FILENAME}`);
    expect(uow.runs).toBe(1);
    expect(storage.puts).toBe(1);
    expect(products.saves).toBe(1);
    expect(idempotency.saves).toBe(1);
  });

  it("retry replays stored result with no duplicate write", async () => {
    const { products, storage, idempotency, handlers } = setup();
    products.products.set(seedProduct().id, seedProduct());
    const input = {
      productId: "11111111-1111-4111-8111-111111111111",
      filename: FILENAME,
      body: new Uint8Array([9, 9]),
      contentType: "image/png",
      idempotencyKey: KEY
    };

    const first = await handlers.storeProductImage(input);
    const second = await handlers.storeProductImage(input);

    expect(second).toEqual(first);
    expect(storage.puts).toBe(1);
    expect(products.saves).toBe(1);
    expect(idempotency.saves).toBe(1);
  });

  it("missing product rejects 404 with zero storage write", async () => {
    const { storage, products, handlers } = setup();

    await expect(
      handlers.storeProductImage({
        productId: "33333333-3333-4333-8333-333333333333",
        filename: FILENAME,
        body: new Uint8Array([1]),
        contentType: "image/png",
        idempotencyKey: KEY
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN", status: 404 });
    expect(storage.puts).toBe(0);
    expect(products.saves).toBe(0);
  });

  it("storage failure passes through with no save", async () => {
    const { products, storage, idempotency, handlers } = setup();
    products.products.set(seedProduct().id, seedProduct());
    storage.fail = Object.assign(new Error("s3 caído"), { code: "STORAGE_DOWN", status: 503 });

    await expect(
      handlers.storeProductImage({
        productId: "11111111-1111-4111-8111-111111111111",
        filename: FILENAME,
        body: new Uint8Array([1]),
        contentType: "image/png",
        idempotencyKey: KEY
      })
    ).rejects.toMatchObject({ code: "STORAGE_DOWN", status: 503 });
    expect(products.saves).toBe(0);
    expect(idempotency.saves).toBe(0);
  });

  it("empty product id rejects before any store touch", async () => {
    const { uow, storage, products, handlers } = setup();

    await expect(
      handlers.storeProductImage({
        productId: "   ",
        filename: FILENAME,
        body: new Uint8Array([1]),
        contentType: "image/png",
        idempotencyKey: KEY
      })
    ).rejects.toMatchObject({ status: 422 });
    expect(uow.runs).toBe(0);
    expect(storage.puts).toBe(0);
    expect(products.saves).toBe(0);
  });
});
