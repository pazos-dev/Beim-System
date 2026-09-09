import { describe, expect, it } from "vitest";

import { InsufficientStockError, ValidationError } from "../../errors/taxonomy.js";
import {
  checkAvailability,
  createProduct,
  decrementProduct,
  isLowStock,
  restoreProduct,
  type CreateProductInput,
  type Product
} from "./product.js";
import { createProductId } from "../shared/types.js";

const PRODUCT_ID = createProductId("prod-a15-pantalla");

function stockedProduct(overrides: Partial<CreateProductInput> = {}): Product {
  return createProduct({
    id: PRODUCT_ID,
    productCode: 1001,
    name: "Pantalla A15",
    categoryId: "cat-repuestos",
    priceAmount: 2500,
    priceCurrency: "UYU",
    stock: 5,
    ...overrides
  });
}

describe("Product aggregate (domain slice)", () => {
  describe("createProduct", () => {
    it("creates a product absorbing Equipo via ProductType with a simple stock field", () => {
      const product = stockedProduct({ productType: "equipo" });

      expect(product.id).toBe(PRODUCT_ID);
      expect(product.productType).toBe("equipo");
      expect(product.stock).toBe(5);
      expect(product.price).toEqual({ amount: 2500, currency: "UYU" });
      expect(product.published).toBe(true);
      expect(product.warrantyDays).toBe(30);
    });

    it("rejects a negative price, a negative stock, or an empty name", () => {
      expect(() => stockedProduct({ priceAmount: -1 })).toThrow(ValidationError);
      expect(() => stockedProduct({ stock: -1 })).toThrow(ValidationError);
      expect(() => stockedProduct({ name: "   " })).toThrow(ValidationError);
    });

    it("rejects a product type outside the closed set without mutating input", () => {
      expect(() => stockedProduct({ productType: "inmueble" as never })).toThrow(ValidationError);
    });

    it("rejects a non-integer stock level", () => {
      expect(() => stockedProduct({ stock: 2.5 })).toThrow(ValidationError);
    });
  });

  describe("checkAvailability()", () => {
    it("returns true when stock covers the requested quantity", () => {
      expect(checkAvailability(stockedProduct(), 5)).toBe(true);
      expect(checkAvailability(stockedProduct(), 1)).toBe(true);
    });

    it("returns false when stock falls short or the quantity is not positive", () => {
      const product = stockedProduct();
      expect(checkAvailability(product, 6)).toBe(false);
      expect(checkAvailability(product, 0)).toBe(false);
      expect(checkAvailability(product, -2)).toBe(false);
    });
  });

  describe("decrement()", () => {
    it("reduces stock and keeps every other field unchanged", () => {
      const product = stockedProduct();

      const decremented = decrementProduct(product, 2);

      expect(decremented.stock).toBe(3);
      expect(decremented.price).toEqual(product.price);
      expect(decremented.name).toBe(product.name);
      expect(product.stock).toBe(5);
    });

    it("rejects a quantity above stock with INSUFFICIENT_STOCK and leaves stock at 5", () => {
      const product = stockedProduct();

      expect(() => decrementProduct(product, 6)).toThrow(InsufficientStockError);
      expect(product.stock).toBe(5);
    });

    it("rejects a non-positive quantity as a validation error", () => {
      const product = stockedProduct();
      expect(() => decrementProduct(product, 0)).toThrow(ValidationError);
      expect(() => decrementProduct(product, -1)).toThrow(ValidationError);
    });
  });

  describe("restore()", () => {
    it("adds the quantity back to stock", () => {
      const product = decrementProduct(stockedProduct(), 2);

      expect(restoreProduct(product, 2).stock).toBe(5);
    });

    it("rejects a non-positive quantity as a validation error", () => {
      expect(() => restoreProduct(stockedProduct(), 0)).toThrow(ValidationError);
    });
  });

  describe("isLowStock()", () => {
    it("flags stock at or below the minimum threshold", () => {
      expect(isLowStock(stockedProduct({ stock: 2, minStock: 2 }))).toBe(true);
      expect(isLowStock(stockedProduct({ stock: 5, minStock: 2 }))).toBe(false);
    });
  });
});
