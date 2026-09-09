// Frozen-source mirror: pinned copy of ROLE_VALUES from
// src/server/shared/auth.ts (read-only). The server module pulls
// node:crypto + JsonStore and must never leak into the client bundle,
// so the kernel duplicates the literal and a Vitest equality test
// (role.test.ts) guards against drift. Never edit independently.

export const ROLE_VALUES = [
  "vendedor",
  "tecnico",
  "caja",
  "administrador",
  "administrador_principal"
] as const;

export type Role = (typeof ROLE_VALUES)[number];

export function isRole(value: unknown): value is Role {
  return (
    typeof value === "string" &&
    (ROLE_VALUES as readonly string[]).includes(value)
  );
}
