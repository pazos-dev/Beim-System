// Client-safe stock role policy: no platform or server runtime imports, so
// Client Components can import it without dragging server modules into the
// browser bundle. Single source for writer gates (use cases + StockHandler).
export type StockRole = "vendedor" | "tecnico" | "caja" | "administrador" | "administrador_principal";

export const STOCK_PRINCIPAL_ROLE: StockRole = "administrador_principal";

export const STOCK_WRITE_ROLES: ReadonlySet<StockRole> = new Set<StockRole>([
  "administrador",
  "administrador_principal"
]);

export const STOCK_OUTFLOW_ROLES: ReadonlySet<StockRole> = new Set<StockRole>([
  "vendedor",
  "tecnico",
  "caja",
  "administrador",
  "administrador_principal"
]);
