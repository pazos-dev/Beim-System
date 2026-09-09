/**
 * Finance thin handlers (gap-slice G3: financial-state + invoice-settings +
 * stock-movements). Pass-through over driven ports: plain DTO in, store
 * result out. No rules (merge/validation live in the adapter at cutover, like
 * the legacy services), no UnitOfWork, no error remapping — failures bubble
 * so the edge toAppError propagates code + status. Framework-free: zero
 * express/pg/zod imports.
 */

export interface FinanceAuditActor {
  readonly actorUserId: string | null;
  readonly actorRole: string | null;
}

export interface FinancialStatePatch {
  readonly capitalInitial?: number;
  readonly expenses?: unknown[];
  readonly menuItems?: unknown[];
  readonly accountingState?: Record<string, unknown>;
  readonly preferences?: Record<string, unknown>;
}

export interface InvoiceSettingsDoc {
  readonly business?: Record<string, unknown>;
  readonly policies?: string;
  readonly warranty?: string;
  readonly footer?: string;
  readonly customSections?: unknown[];
}

export interface StockMovementInput {
  readonly productId: string;
  readonly movementType: string;
  readonly quantity: number;
  readonly detail?: string;
}

export interface StockMovementsFilter {
  readonly productId?: string;
  readonly from?: string;
  readonly to?: string;
}

/** Driven ports; infrastructure adapters own SQL at cutover. */
export interface FinancialStateStore {
  get(): Promise<unknown>;
  upsert(patch: FinancialStatePatch): Promise<unknown>;
}

export interface InvoiceSettingsStore {
  get(): Promise<unknown>;
  save(doc: InvoiceSettingsDoc): Promise<unknown>;
}

export interface StockMovementsStore {
  list(filter: StockMovementsFilter): Promise<unknown>;
  record(input: StockMovementInput, actor: FinanceAuditActor): Promise<unknown>;
}

export function makeFinancialStateHandlers(store: FinancialStateStore) {
  return {
    get: (): Promise<unknown> => store.get(),
    upsert: (patch: FinancialStatePatch): Promise<unknown> => store.upsert(patch)
  };
}

export function makeInvoiceSettingsHandlers(store: InvoiceSettingsStore) {
  return {
    get: (): Promise<unknown> => store.get(),
    save: (doc: InvoiceSettingsDoc): Promise<unknown> => store.save(doc)
  };
}

export function makeStockMovementHandlers(store: StockMovementsStore) {
  return {
    list: (filter: StockMovementsFilter): Promise<unknown> => store.list(filter),
    record: (input: StockMovementInput, actor: FinanceAuditActor): Promise<unknown> =>
      store.record(input, actor)
  };
}
