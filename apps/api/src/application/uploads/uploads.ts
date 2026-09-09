/**
 * Upload handlers (change `clean-arch-application`, Unit 8).
 *
 * Thin orchestration only: DTO → `UnitOfWork.run` → load `Product` →
 * `StoragePort.putObject` → link image → save on the same `TxClient` →
 * commit. Allowlist (415) and size cap (413) live at the edge (future
 * interface slice); the handler never validates media types. Retries with
 * the same idempotency-Key replay the stored result with no duplicate
 * `putObject` or save. Domain errors pass through untouched.
 */
import { NotFoundError } from "../../domain/shared/errors.js";
import type { TxClient } from "../../domain/shared/ports.js";
import { createProductId } from "../../domain/shared/types.js";
import type { Product } from "../../domain/product/product.js";
import type { StoredUploadResult, UploadDeps } from "./ports.js";

export interface StoreProductImageInput {
  readonly productId: string;
  readonly filename: string;
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly idempotencyKey: string;
}

export type StoreProductImageResult = StoredUploadResult;

function productNotFound(id: string): NotFoundError {
  return new NotFoundError(`Producto no encontrado: ${id}`);
}

export function makeUploadHandlers(deps: UploadDeps) {
  const { uow, products, storage, idempotency } = deps;

  return {
    async storeProductImage(input: StoreProductImageInput): Promise<StoreProductImageResult> {
      // Malformed ids fail here (422) with zero store touch, orders precedent.
      const id = createProductId(input.productId);
      return uow.run(async (tx: TxClient) => {
        const prior = await idempotency.findByKey(tx, input.idempotencyKey);
        if (prior !== null) return prior;
        const found = await products.findProduct(tx, id);
        if (found === null) throw productNotFound(input.productId);
        const url = await storage.putObject(input.filename, input.body, input.contentType);
        const linked: Product = { ...found, image: url };
        await products.saveProduct(tx, linked);
        const result: StoredUploadResult = {
          url,
          filename: input.filename,
          bytes: input.body.byteLength
        };
        await idempotency.save(tx, input.idempotencyKey, result);
        return result;
      });
    }
  };
}
