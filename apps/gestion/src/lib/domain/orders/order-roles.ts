// Módulo client-safe: sin imports de runtime de plataforma ni de server.
// Define los roles con permiso de creación de órdenes para que las
// Client Components ("use client") puedan importarlo sin arrastrar
// módulos de plataforma (criptografía) al bundle del navegador a través
// del contexto de órdenes del servidor (auditoría / idempotencia).
export type OrderRole = "vendedor" | "tecnico" | "caja" | "administrador" | "administrador_principal";

export const ORDER_CREATE_ROLES: ReadonlySet<OrderRole> = new Set<OrderRole>([
  "vendedor",
  "tecnico",
  "administrador",
  "administrador_principal"
]);
