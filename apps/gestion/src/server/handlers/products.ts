import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { JsonStore, JSON_STORE_ERROR_REASONS, type JsonStoreError } from "../data/json-store";
import { productoSchema, productosDocumentSchema, type GestionError, type Producto } from "../data/schemas";
import { EntityRepository, type RepositoryActor, type RepositoryCollection, type RepositoryStore } from "../data/repositories";
import type { AuthActor, Role } from "./auth";
import { createGestionError, ERROR_CODES } from "./errors";
import { err, ok, type Result } from "./result";
import { orderValidationError, type ProductosDocument } from "./order-context";

export interface ProductActor extends RepositoryActor {
  role: Role;
}

export function toProductActor(auth: AuthActor): ProductActor {
  return {
    hasGlobalAccess: auth.role === "administrador" || auth.role === "administrador_principal",
    id: auth.id,
    role: auth.role
  };
}

const PRODUCT_WRITE_ROLES: ReadonlySet<Role> = new Set(["administrador", "administrador_principal"]);

const createProductSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  price: z.number().min(0),
  cost: z.number().min(0).default(0),
  stock: z.number().int().min(0).default(0),
  minimum: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  categoriaId: z.string().min(1).max(100).optional()
});

class ProductosCollectionStore implements RepositoryStore<RepositoryCollection<Producto>> {
  public constructor(private readonly inner: JsonStore<ProductosDocument>) {}
  public async read(): Promise<Result<RepositoryCollection<Producto>, JsonStoreError>> {
    const current = await this.inner.read();
    if (!current.ok) {
      if (current.error.reason === JSON_STORE_ERROR_REASONS.NOT_FOUND) return ok({ items: [], version: 0 });
      return err(current.error);
    }
    return ok({ items: current.value.productos, version: current.value.version });
  }
  public async write(document: RepositoryCollection<Producto>, expectedVersion?: number): Promise<Result<RepositoryCollection<Producto>, JsonStoreError>> {
    const written = await this.inner.write({ productos: document.items, version: document.version }, expectedVersion);
    if (!written.ok) return err(written.error);
    return ok({ items: written.value.productos, version: written.value.version });
  }
}

export function createProductRepository(dataDirectory: string): EntityRepository<Producto> {
  const document = new JsonStore(join(dataDirectory, "productos.json"), productosDocumentSchema);
  return new EntityRepository({ entitySchema: productoSchema, store: new ProductosCollectionStore(document) });
}

export class ProductHandler {
  public constructor(private readonly productos: EntityRepository<Producto>) {}
  public async list(actor: ProductActor): Promise<Result<Producto[], GestionError>> {
    return this.productos.list(actor);
  }
  public async getById(actor: ProductActor, id: string): Promise<Result<Producto, GestionError>> {
    return this.productos.getById(actor, id);
  }
  public async create(actor: ProductActor, input: unknown): Promise<Result<Producto, GestionError>> {
    const parsed = createProductSchema.safeParse(input);
    if (!parsed.success) return err(orderValidationError(parsed.error.issues));
    if (!PRODUCT_WRITE_ROLES.has(actor.role)) return err(createGestionError(ERROR_CODES.FORBIDDEN));
    return this.productos.create(actor, { ...parsed.data, id: `p_${randomUUID()}`, ownerId: actor.id, version: 1 });
  }
}
