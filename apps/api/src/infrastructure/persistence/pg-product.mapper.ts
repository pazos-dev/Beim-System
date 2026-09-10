import { ValidationError } from "../../errors/taxonomy.js";
import type { Product } from "../../domain/product/product.js";
import { isProductType } from "../../domain/product/product.js";
import { createStockLot, type StockLot } from "../../domain/product/stock-lot.js";
import { createMoney, createProductId } from "../../domain/shared/types.js";

/**
 * Legacy `products` row. `price` arrives as text (pg `numeric` has no JS
 * counterpart — same passthrough convention as `pg-reports`'
 * `price::text`); the mapper coerces with `Number`, never reformats.
 */
export interface ProductRow {
  id: string;
  product_code: number;
  name: string;
  category_id: string;
  brand: string;
  model: string;
  price: string | number;
  currency: string;
  stock: number;
  badge: string;
  image: string | null;
  description: string;
  product_type: string;
  compatible_models: string[] | null;
  supplier_name: string;
  supplier_lot: string;
  min_stock: number;
  warranty_days: number;
  published: boolean;
  created_at: string | Date;
  updated_at: string | Date;
}

/** Row → `Product`. Rejects rows outside the closed `ProductType` set. */
export function toDomainProduct(row: ProductRow): Product {
  if (!isProductType(row.product_type)) {
    throw new ValidationError("Producto inválido: tipo fuera del conjunto cerrado", {
      value: row.product_type
    });
  }
  return {
    id: createProductId(row.id),
    productCode: row.product_code,
    name: row.name,
    categoryId: row.category_id,
    brand: row.brand,
    model: row.model,
    price: createMoney(Number(row.price), row.currency),
    stock: row.stock,
    badge: row.badge,
    image: row.image,
    description: row.description,
    productType: row.product_type,
    compatibleModels: row.compatible_models ?? [],
    supplierName: row.supplier_name,
    supplierLot: row.supplier_lot,
    minStock: row.min_stock,
    warrantyDays: row.warranty_days,
    published: row.published,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

/**
 * Legacy `stock_lots` row (created by `0006-stock-lots.sql`). Money columns
 * arrive as text when they are `numeric`; `sale_price` null means no
 * override (`salePriceOverride` null).
 */
export interface StockLotRow {
  id: string;
  product_id: string;
  initial_qty: number;
  remaining_qty: number;
  unit_cost: string | number;
  currency: string;
  sale_price: string | number | null;
  sale_price_currency: string;
  purpose: string;
  acquired_via: string;
  supplier_lot: string;
  created_at: string | Date;
}

/** Row → `StockLot` via the domain constructor (purpose set enforced). */
export function toDomainLot(row: StockLotRow): StockLot {
  return createStockLot({
    id: row.id,
    productId: row.product_id,
    initialQty: row.initial_qty,
    remainingQty: row.remaining_qty,
    unitCostAmount: Number(row.unit_cost),
    unitCostCurrency: row.currency,
    ...(row.sale_price === null
      ? {}
      : { salePriceAmount: Number(row.sale_price), salePriceCurrency: row.sale_price_currency }),
    purpose: row.purpose,
    acquiredVia: row.acquired_via,
    supplierLot: row.supplier_lot,
    createdAt: new Date(row.created_at)
  });
}
