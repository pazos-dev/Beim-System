/**
 * Product aggregate (domain slice, change `clean-arch-domain`).
 *
 * Pure refactor of `domain-entities.md` v3 §2: `Product` absorbs Equipo via
 * the closed `ProductType` set. Stock in this phase is a simple guarded
 * field (`StockLevel` int >= 0); purpose-segregated lots arrive in Phase 3B
 * (`stock-lot.ts`) and MUST NOT be anticipated here. Framework-free:
 * aggregates are immutable values; every behavior returns a new copy.
 */
import { InsufficientStockError, ValidationError } from "../shared/errors.js";
import {
  createMoney,
  createProductId,
  type Currency,
  type Money,
  type ProductId
} from "../shared/types.js";

/** Closed product-kind set: Equipo is absorbed as one kind of Product. */
export const PRODUCT_TYPES = ["equipo", "accesorio", "repuesto"] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];

export function isProductType(value: string): value is ProductType {
  return (PRODUCT_TYPES as readonly string[]).includes(value);
}

/** Catalog product (`products`); `stock` is a simple field until Phase 3B. */
export interface Product {
  readonly id: ProductId;
  readonly productCode: number;
  readonly name: string;
  readonly categoryId: string;
  readonly brand: string;
  readonly model: string;
  readonly price: Money;
  readonly stock: number;
  readonly badge: string;
  readonly image: string | null;
  readonly description: string;
  readonly productType: ProductType;
  readonly compatibleModels: readonly string[];
  readonly supplierName: string;
  readonly supplierLot: string;
  readonly minStock: number;
  readonly warrantyDays: number;
  readonly published: boolean;
  readonly createdAt: Date | null;
  readonly updatedAt: Date | null;
}

export interface CreateProductInput {
  readonly id: string;
  readonly productCode: number;
  readonly name: string;
  readonly categoryId: string;
  readonly brand?: string;
  readonly model?: string;
  readonly priceAmount: number;
  readonly priceCurrency: string;
  readonly stock: number;
  readonly badge?: string;
  readonly image?: string | null;
  readonly description?: string;
  readonly productType?: string;
  readonly compatibleModels?: readonly string[];
  readonly supplierName?: string;
  readonly supplierLot?: string;
  readonly minStock?: number;
  readonly warrantyDays?: number;
  readonly published?: boolean;
}

function cleanText(value: string, field: string): string {
  const cleaned = value.trim();
  if (cleaned === "") {
    throw new ValidationError(`Producto inválido: ${field} no puede estar vacío`, { field });
  }
  return cleaned;
}

function cleanProductType(value: string | undefined): ProductType {
  if (value === undefined || !isProductType(value)) {
    throw new ValidationError("Producto inválido: tipo fuera del conjunto cerrado", { value });
  }
  return value;
}

function cleanNonNegativeInt(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new ValidationError(`Producto inválido: ${field} debe ser un entero no negativo`, {
      field,
      value
    });
  }
  return value;
}

function cleanQuantity(qty: number, action: string): number {
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new ValidationError(`Producto inválido: cantidad a ${action} debe ser un entero positivo`, {
      qty
    });
  }
  return qty;
}

export function createProduct(input: CreateProductInput): Product {
  return {
    id: createProductId(input.id),
    productCode: cleanNonNegativeInt(input.productCode, "productCode"),
    name: cleanText(input.name, "name"),
    categoryId: cleanText(input.categoryId, "categoryId"),
    brand: input.brand ?? "",
    model: input.model ?? "",
    price: createMoney(input.priceAmount, input.priceCurrency),
    stock: cleanNonNegativeInt(input.stock, "stock"),
    badge: input.badge ?? "Nuevo",
    image: input.image ?? null,
    description: input.description ?? "",
    productType: cleanProductType(input.productType ?? "accesorio"),
    compatibleModels: input.compatibleModels ?? [],
    supplierName: input.supplierName ?? "",
    supplierLot: input.supplierLot ?? "",
    minStock: input.minStock === undefined ? 0 : cleanNonNegativeInt(input.minStock, "minStock"),
    warrantyDays:
      input.warrantyDays === undefined ? 30 : cleanNonNegativeInt(input.warrantyDays, "warrantyDays"),
    published: input.published ?? true,
    createdAt: null,
    updatedAt: null
  };
}

/** True when `qty` is a positive request the current stock can cover. */
export function checkAvailability(product: Product, qty: number): boolean {
  return Number.isInteger(qty) && qty > 0 && product.stock >= qty;
}

/** Guarded sale decrement: shortfall raises `INSUFFICIENT_STOCK` (409). */
export function decrementProduct(product: Product, qty: number): Product {
  const amount = cleanQuantity(qty, "descontar");
  if (product.stock < amount) {
    throw new InsufficientStockError("Stock insuficiente", { currentStock: product.stock });
  }
  return { ...product, stock: product.stock - amount };
}

/** Guarded restore: returns units to the simple stock pile. */
export function restoreProduct(product: Product, qty: number): Product {
  const amount = cleanQuantity(qty, "reponer");
  return { ...product, stock: product.stock + amount };
}

/** Derived flag: at or below the reorder threshold. */
export function isLowStock(product: Product): boolean {
  return product.stock <= product.minStock;
}

/** Currency passthrough for server-side line pricing (single-currency sales). */
export function productCurrency(product: Product): Currency {
  return product.price.currency;
}
