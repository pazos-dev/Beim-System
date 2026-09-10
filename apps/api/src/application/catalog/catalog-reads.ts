/**
 * Catalog read handlers (gap-slice G4).
 *
 * Thin delegation over the catalog read port only: the handler never touches
 * `UnitOfWork.run` and never remaps errors — failures bubble so the edge
 * `toAppError` propagates the catalog code + status. Pagination defaults and
 * bounds (page 1, limit 1..100 default 20) are enforced at the edge by the
 * strict zod DTOs, mirroring the legacy `productListQuerySchema`; the only
 * ownership rule (published-only visibility, unpublished → null → 404) lives
 * in the adapter's SQL at cutover. Framework-free: zero `express`/`pg`/`zod`
 * imports.
 */

export interface CatalogListQuery {
  readonly page?: number;
  readonly limit?: number;
  readonly category?: string;
  readonly search?: string;
}

/** Driven port; the infrastructure adapter owns SQL at cutover. */
export interface CatalogReadsPort {
  listPublished(query: CatalogListQuery): Promise<unknown>;
  getPublishedById(id: string): Promise<unknown | null>;
  listSlides(): Promise<unknown>;
}

export function makeCatalogReadsHandlers(port: CatalogReadsPort) {
  return {
    listPublished: (query: CatalogListQuery): Promise<unknown> => port.listPublished(query),
    getPublishedById: (id: string): Promise<unknown | null> => port.getPublishedById(id),
    listSlides: (): Promise<unknown> => port.listSlides()
  };
}
