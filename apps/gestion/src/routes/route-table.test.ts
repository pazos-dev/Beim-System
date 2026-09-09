import { describe, expect, it } from "vitest";

import { ROLE_VALUES } from "../kernel/role";
import { canAccess, findRoute, ROUTES, selectVisibleRoutes } from "./route-table";

const EXPECTED_PATHS = [
  "/app/ordenes",
  "/app/clientes",
  "/app/ventas",
  "/app/compras",
  "/app/stock",
  "/app/servicios",
  "/app/caja",
  "/app/reportes",
  "/app/configuracion",
  "/app/audit"
] as const;

describe("route table", () => {
  it("covers all ten spec paths with roles and labels", () => {
    expect(ROUTES).toHaveLength(10);
    for (const path of EXPECTED_PATHS) {
      const entry = findRoute(path);
      expect(entry?.path).toBe(path);
      expect(entry!.roles.length).toBeGreaterThan(0);
      expect(entry!.label.length).toBeGreaterThan(0);
    }
  });

  it("rejects unknown paths", () => {
    expect(findRoute("/app/unknown")).toBeUndefined();
  });

  it("grants caja to caja roles and denies vendedor", () => {
    const caja = findRoute("/app/caja")!;

    expect(canAccess(caja, "caja")).toBe(true);
    expect(canAccess(caja, "administrador_principal")).toBe(true);
    expect(canAccess(caja, "vendedor")).toBe(false);
    expect(canAccess(caja, undefined)).toBe(false);
  });

  it("pins the full per-path role matrix with no empty sets", () => {
    const allRoles: readonly string[] = [...ROLE_VALUES];
    const expected: Readonly<Record<string, readonly string[]>> = {
      "/app/audit": ["administrador", "administrador_principal"],
      "/app/caja": ["caja", "administrador", "administrador_principal"],
      "/app/clientes": allRoles,
      "/app/compras": ["administrador", "administrador_principal"],
      "/app/configuracion": allRoles,
      "/app/ordenes": allRoles,
      "/app/reportes": allRoles,
      "/app/servicios": allRoles,
      "/app/stock": allRoles,
      "/app/ventas": ["vendedor", "caja", "administrador", "administrador_principal"]
    };

    for (const [path, roles] of Object.entries(expected)) {
      const entry = findRoute(path);
      expect(entry, path).toBeDefined();
      expect([...entry!.roles].sort()).toEqual([...roles].sort());
    }
  });

  it("filters visible routes by role", () => {    const admin = selectVisibleRoutes("administrador_principal").map((entry) => entry.path);
    const vendedor = selectVisibleRoutes("vendedor").map((entry) => entry.path);

    expect(admin).toHaveLength(10);
    expect(vendedor).toContain("/app/ordenes");
    expect(vendedor).not.toContain("/app/caja");
    expect(vendedor).not.toContain("/app/audit");
    expect(selectVisibleRoutes(undefined)).toHaveLength(0);
  });
});
