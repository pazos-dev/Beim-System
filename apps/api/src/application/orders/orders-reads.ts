/**
 * Orders read handlers (gap-slice G4b).
 *
 * Thin delegation over the orders read port only: the handler never touches
 * `UnitOfWork.run` and never remaps errors — 404 (foreign/missing order) and
 * 409 (already paid, cancel conflict) bubble so the edge `toAppError`
 * propagates the legacy code + status. Ownership scoping (`userId` first,
 * like the legacy `ordersService.listMine/getMine/cancel`) lives in the
 * adapter's SQL at cutover. Framework-free: zero `express`/`pg`/`zod`
 * imports.
 */

export interface OrdersReadsQuery {
  readonly page?: number;
  readonly limit?: number;
}

/** Driven port; the infrastructure adapter owns SQL at cutover. */
export interface OrdersReadsPort {
  listMine(userId: string, query: OrdersReadsQuery): Promise<unknown>;
  getMine(userId: string, orderId: string): Promise<unknown | null>;
  cancel(userId: string, orderId: string): Promise<{ order: unknown }>;
}

export function makeOrdersReadsHandlers(port: OrdersReadsPort) {
  return {
    listMine: (userId: string, query: OrdersReadsQuery): Promise<unknown> =>
      port.listMine(userId, query),
    getMine: (userId: string, orderId: string): Promise<unknown | null> =>
      port.getMine(userId, orderId),
    cancel: (userId: string, orderId: string): Promise<{ order: unknown }> =>
      port.cancel(userId, orderId)
  };
}
