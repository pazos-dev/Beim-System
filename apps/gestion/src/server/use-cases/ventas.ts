// Backward-compatible re-export: canonical home is now src/server/ventas/ventas-use-cases.ts.
// TODO: point new imports at the domain folder; this shim stays until callers migrate.
// TODO(ventas-collapse): sale creation exists 3x (legacy SalesHandler in
// ventas/sales-handler.ts, VentaUseCases here, legacy orders handler). Collapse
// into one path after the external API migration; do NOT add a fourth.
export * from "../ventas/ventas-use-cases";
