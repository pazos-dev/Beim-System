import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { AuthActor } from "../handlers/auth";
import { createStockUseCases } from "../composition/stock";
import { createSeedDirectory } from "../../test/seed-dir";
import { compraListQuerySchema, toStockActor } from "./stock";

function actor(username: string, role: AuthActor["role"], id: string): AuthActor {
  return { id, username, displayName: username, role };
}

const admin = actor("administrador", "administrador", "u-administrador");
const principal = actor("administrador_principal", "administrador_principal", "u-administrador_principal");
const seller = actor("vendedor", "vendedor", "u-vendedor");

async function seedTwoPurchases(): Promise<string> {
  const directory = await createSeedDirectory("gestion-compras-list-");
  const useCases = createStockUseCases(directory);
  const first = await useCases.recordPurchase(toStockActor(admin), {
    productoId: "p_1",
    cantidad: 2,
    costoUnitario: 50,
    proveedor: "Proveedor Andina",
    comprobante: "FAC-001"
  }, "key-compra-andina");
  expect(first.ok).toBe(true);
  const second = await useCases.recordPurchase(toStockActor(admin), {
    productoId: "p_2",
    cantidad: 1,
    costoUnitario: 70,
    proveedor: "Proveedor Boreal",
    comprobante: "FAC-002"
  }, "key-compra-boreal");
  expect(second.ok).toBe(true);
  return directory;
}

describe("compras reads use cases (CMP-a2)", () => {
  it("parses list query defaults and rejects bad pagination", () => {
    const defaults = compraListQuerySchema.safeParse({});
    expect(defaults.success).toBe(true);
    if (defaults.success) expect(defaults.data).toMatchObject({ page: 1, pageSize: 25 });
    expect(compraListQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(compraListQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });

  it("lists seeded purchases with the envelope contract and no owner leak", async () => {
    const directory = await seedTwoPurchases();
    try {
      const useCases = createStockUseCases(directory);
      const listed = await useCases.listCompras(toStockActor(admin), { page: 1, pageSize: 25 });
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.value).toMatchObject({ page: 1, pageSize: 25, totalItems: 2 });
      expect(listed.value.items).toHaveLength(2);
      expect(JSON.stringify(listed.value)).not.toMatch(/ownerId/);
      const principalListed = await useCases.listCompras(toStockActor(principal), { page: 1, pageSize: 25 });
      expect(principalListed.ok).toBe(true);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("filters by proveedor and matches q across proveedor, comprobante, and producto displayName", async () => {
    const directory = await seedTwoPurchases();
    try {
      const useCases = createStockUseCases(directory);
      const bySupplier = await useCases.listCompras(toStockActor(admin), {
        proveedor: "Proveedor Andina",
        page: 1,
        pageSize: 25
      });
      expect(bySupplier.ok).toBe(true);
      if (!bySupplier.ok) return;
      expect(bySupplier.value.totalItems).toBe(1);
      expect(bySupplier.value.items[0]?.proveedor).toBe("Proveedor Andina");
      const byVoucher = await useCases.listCompras(toStockActor(admin), { q: "FAC-002", page: 1, pageSize: 25 });
      expect(byVoucher.ok).toBe(true);
      if (!byVoucher.ok) return;
      expect(byVoucher.value.totalItems).toBe(1);
      expect(byVoucher.value.items[0]?.comprobante).toBe("FAC-002");
      const byProduct = await useCases.listCompras(toStockActor(admin), { q: "cargador", page: 1, pageSize: 25 });
      expect(byProduct.ok).toBe(true);
      if (!byProduct.ok) return;
      expect(byProduct.value.totalItems).toBe(1);
      expect(byProduct.value.items[0]?.productoId).toBe("p_2");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("paginates with page slices and returns NOT_FOUND_OR_FORBIDDEN for unknown ids", async () => {
    const directory = await seedTwoPurchases();
    try {
      const useCases = createStockUseCases(directory);
      const second = await useCases.listCompras(toStockActor(admin), { page: 2, pageSize: 1 });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.value.totalItems).toBe(2);
      expect(second.value.items).toHaveLength(1);
      const missing = await useCases.getCompraById(toStockActor(admin), "missing");
      expect(missing.ok).toBe(false);
      if (!missing.ok) expect(missing.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
      const blank = await useCases.getCompraById(toStockActor(admin), "  ");
      expect(blank.ok).toBe(false);
      const listed = await useCases.listCompras(toStockActor(admin), { page: 1, pageSize: 25 });
      if (!listed.ok) return;
      const found = await useCases.getCompraById(toStockActor(admin), listed.value.items[0]?.id);
      expect(found.ok).toBe(true);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("forbids non-admin reads with zero writes and ignores client-sent totals", async () => {
    const directory = await seedTwoPurchases();
    try {
      const useCases = createStockUseCases(directory);
      const before = {
        compras: await readFile(join(directory, "compras.json"), "utf8"),
        audit: await readFile(join(directory, "audit.json"), "utf8")
      };
      const denied = await useCases.listCompras(toStockActor(seller), { page: 1, pageSize: 25 });
      expect(denied.ok).toBe(false);
      if (denied.ok) return;
      expect(denied.error.code).toBe("FORBIDDEN");
      const deniedDetail = await useCases.getCompraById(toStockActor(seller), "co_anything");
      expect(deniedDetail.ok).toBe(false);
      expect(await readFile(join(directory, "compras.json"), "utf8")).toBe(before.compras);
      expect(await readFile(join(directory, "audit.json"), "utf8")).toBe(before.audit);
      const sealed = await useCases.recordPurchase(toStockActor(admin), {
        productoId: "p_1",
        cantidad: 1,
        costoUnitario: 40,
        proveedor: "Proveedor Andina",
        total: 1,
        fecha: "2000-01-01T00:00:00.000Z"
      }, "key-compra-sealed");
      expect(sealed.ok).toBe(true);
      if (!sealed.ok) return;
      expect(sealed.value.compra.total).toBe(40);
      expect(sealed.value.compra.fecha).not.toBe("2000-01-01T00:00:00.000Z");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
