import { rm } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { createVentaUseCases } from "../composition/ventas";
import type { AuthActor } from "../handlers/auth";
import type { PortActor } from "../ports/actor";
import { createSeedDirectory } from "../../test/seed-dir";
import { toVentaActor } from "./ventas";

function actor(username: string, role: AuthActor["role"], id: string): AuthActor {
  return { id, username, displayName: username, role };
}

const seller = actor("vendedor", "vendedor", "u-vendedor");
const listAdmin: PortActor = { id: "u-administrador", hasGlobalAccess: true };

function saleInput(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    items: [{ productoId: "p_1", cantidad: 1 }],
    pagos: [{ metodo: "efectivo", monto: 1200 }],
    ...overrides
  };
}

describe("Venta fecha end-to-end (VTA-1 server-stamped fecha)", () => {
  it("stamps server time on create", async () => {
    const directory = await createSeedDirectory("gestion-ventas-fecha-stamp-");
    try {
      const before = Date.parse(new Date().toISOString());
      const created = await createVentaUseCases(directory).create(
        toVentaActor(seller),
        saleInput(),
        "key-fecha-stamp"
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(typeof created.value.fecha).toBe("string");
      const stamped = Date.parse(created.value.fecha as string);
      expect(Number.isNaN(stamped)).toBe(false);
      expect((created.value.fecha as string).endsWith("Z")).toBe(true);
      expect(stamped).toBeGreaterThanOrEqual(before - 60_000);
      expect(stamped).toBeLessThanOrEqual(Date.now() + 60_000);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("ignores client-sent fecha on create", async () => {
    const directory = await createSeedDirectory("gestion-ventas-fecha-ignore-");
    try {
      const created = await createVentaUseCases(directory).create(
        toVentaActor(seller),
        saleInput({ fecha: "2000-01-01T00:00:00.000Z" }),
        "key-fecha-ignore"
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.value.fecha).not.toBe("2000-01-01T00:00:00.000Z");
      expect(Date.parse(created.value.fecha as string)).toBeGreaterThan(Date.parse("2020-01-01T00:00:00.000Z"));
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("returns fecha in list items and detail", async () => {
    const directory = await createSeedDirectory("gestion-ventas-fecha-list-");
    try {
      const useCases = createVentaUseCases(directory);
      const created = await useCases.create(toVentaActor(seller), saleInput(), "key-fecha-list");
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(typeof created.value.fecha).toBe("string");
      const listed = await useCases.list(
        { id: "u-administrador", hasGlobalAccess: true },
        { page: 1, pageSize: 25 }
      );
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      const row = listed.value.items.find((item) => item.id === created.value.id);
      expect(row).toBeDefined();
      expect(row?.fecha).toBe(created.value.fecha);
      const detail = await useCases.getById({ id: "u-administrador", hasGlobalAccess: true }, created.value.id);
      expect(detail.ok).toBe(true);
      if (!detail.ok) return;
      expect(detail.value.fecha).toBe(created.value.fecha);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("reads legacy sales without fecha with fecha absent (never failing)", async () => {
    const directory = await createSeedDirectory("gestion-ventas-fecha-legacy-");
    try {
      const useCases = createVentaUseCases(directory);
      const listed = await useCases.list(listAdmin, { page: 1, pageSize: 25 });
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.value.items.length).toBe(2);
      for (const item of listed.value.items) expect(item.fecha).toBeUndefined();
      const detail = await useCases.getById(listAdmin, "v_1");
      expect(detail.ok).toBe(true);
      if (!detail.ok) return;
      expect(detail.value.fecha).toBeUndefined();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
