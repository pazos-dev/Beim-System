/**
 * Purchase thin handlers (gap-slice G1b, closes G1).
 *
 * Pass-through over the driven `PurchasesStore` port: plain DTO in, store
 * result out. No business rules (the audit-event purchase has no domain
 * aggregate yet), no `UnitOfWork.run`, no error remapping — failures bubble
 * so the edge `toAppError` propagates the catalog code + status. Framework-
 * free: zero `express`/`pg`/`zod` imports. The only transport concern owned
 * here is the audit-actor shape, mirroring the legacy `toAuditActor`
 * (`actorUserId`/`actorRole`, null when unknown): `create` carries it like
 * the legacy `POST /purchases`, `update` carries id plus patch only, exactly
 * like the legacy `PUT /purchases/:id`.
 */

export interface PurchaseAuditActor {
  readonly actorUserId: string | null;
  readonly actorRole: string | null;
}

export interface PurchasesListFilter {
  readonly active?: boolean | "all";
}

export interface PurchaseCreateInput {
  readonly supplierName: string;
  readonly data?: Record<string, unknown>;
}

export interface PurchaseUpdateInput {
  readonly supplierName?: string;
  readonly data?: Record<string, unknown>;
  readonly active?: boolean;
}

/** Driven port; the infrastructure adapter owns SQL at cutover. */
export interface PurchasesStore {
  list(filter: PurchasesListFilter): Promise<unknown>;
  getById(id: string): Promise<unknown | null>;
  create(input: PurchaseCreateInput, actor: PurchaseAuditActor): Promise<unknown>;
  update(id: string, patch: PurchaseUpdateInput): Promise<unknown>;
}

export function makePurchaseHandlers(store: PurchasesStore) {
  return {
    list: (filter: PurchasesListFilter): Promise<unknown> => store.list(filter),
    getById: (id: string): Promise<unknown | null> => store.getById(id),
    create: (input: PurchaseCreateInput, actor: PurchaseAuditActor): Promise<unknown> =>
      store.create(input, actor),
    update: (id: string, patch: PurchaseUpdateInput): Promise<unknown> => store.update(id, patch)
  };
}
