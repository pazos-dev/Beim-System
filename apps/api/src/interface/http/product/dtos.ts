import { z } from "zod";
import { CURRENCIES } from "../../../domain/shared/types.js";
import { PRODUCT_TYPES } from "../../../domain/product/product.js";

/**
 * Product edge DTOs (interface layer, Unidad 3 catalog slice).
 *
 * Strict zod only: unknown keys 422, bounds mirror the domain guards
 * (`cleanText`, `cleanNonNegativeInt`, `createMoney`, closed product types).
 * Product ids stay lax non-empty strings: `products.id` is TEXT and legacy
 * rows predate uuid (same reason as the webshop `paramOrderIdSchema`);
 * uuid enforcement would reject valid legacy ids at cutover.
 */
export const productIdParamSchema = z
  .strictObject({ id: z.string().trim().min(1, "Identificador requerido").max(120) })
  .strict();

const qtySchema = z.strictObject({ qty: z.number().int().positive("qty debe ser un entero positivo") }).strict();

export const productSellBodySchema = qtySchema;
export const productConsumeBodySchema = qtySchema;

export const productRestoreBodySchema = z
  .strictObject({
    allocations: z
      .array(
        z
          .strictObject({ lotId: z.string().trim().min(1, "lotId requerido"), qty: qtySchema.shape.qty })
          .strict()
      )
      .min(1, "allocations no puede estar vacío")
  })
  .strict();

export const productCreateBodySchema = z
  .strictObject({
    id: z.string().trim().min(1, "Identificador requerido").max(120),
    productCode: z.number().int().min(0),
    name: z.string().trim().min(1, "name requerido"),
    categoryId: z.string().trim().min(1, "categoryId requerido"),
    brand: z.string().trim().min(1).optional(),
    model: z.string().trim().min(1).optional(),
    priceAmount: z.number().nonnegative(),
    priceCurrency: z.enum(CURRENCIES),
    stock: z.number().int().min(0),
    badge: z.string().trim().min(1).optional(),
    image: z.string().trim().min(1).nullable().optional(),
    description: z.string().optional(),
    productType: z.enum(PRODUCT_TYPES).optional(),
    compatibleModels: z.array(z.string().trim().min(1)).optional(),
    supplierName: z.string().trim().min(1).optional(),
    supplierLot: z.string().trim().min(1).optional(),
    minStock: z.number().int().min(0).optional(),
    warrantyDays: z.number().int().min(0).optional(),
    published: z.boolean().optional()
  })
  .strict();

export type ProductCreateBody = z.infer<typeof productCreateBodySchema>;
