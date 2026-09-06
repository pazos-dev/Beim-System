import { rm } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import type { AuthActor } from "../handlers/auth";
import { createStockUseCases } from "../composition/stock";
import { createSeedDirectory } from "../../test/seed-dir";
import { stockListQuerySchema, toStockActor } from "./stock";

function admin(): AuthActor {
  return { id: "u-administrador", username: "administrador", displayName: "Admin", role: "administrador" };
}

describe("stock use cases getLevels (STK-1)", () => {
  it("parses list query defaults and rejects bad pagination", () => {
    expect(stockListQuerySchema.safeParse({}).success).toBe(true);
    expect(stockListQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it("maps admin session actor to global access", () => {
    expect(toStockActor(admin()).hasGlobalAccess).toBe(true);
    expect(toStockActor({ ...admin(), id: "u-v", role: "vendedor" }).hasGlobalAccess).toBe(false);
  });

  it("lists taller levels with the envelope contract and server lowStock", async () => {
    const directory = await createSeedDirectory("gestion-stock-levels-");
    try {
      const useCases = createStockUseCases(directory);
      const listed = await useCases.getLevels(toStockActor(admin()), {
        deposito: "taller",
        page: 1,
        pageSize: 25
      });
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.value.page).toBe(1);
      expect(listed.value.pageSize).toBe(25);
      expect(typeof listed.value.totalItems).toBe("number");
      for (const item of listed.value.items) {
        expect(item.lowStock).toBe(item.balance < item.minimum);
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("returns NOT_FOUND_OR_FORBIDDEN for unknown productoId", async () => {
    const directory = await createSeedDirectory("gestion-stock-levels-404-");
    try {
      const useCases = createStockUseCases(directory);
      const listed = await useCases.getLevels(toStockActor(admin()), {
        productoId: "missing",
        page: 1,
        pageSize: 25
      });
      expect(listed.ok).toBe(false);
      if (listed.ok) return;
      expect(listed.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("checks availability read-only without writing", async () => {
    const directory = await createSeedDirectory("gestion-stock-availability-");
    try {
      const useCases = createStockUseCases(directory);
      const blocked = await useCases.checkAvailability(toStockActor(admin()), "p_2", 999);
      expect(blocked.ok).toBe(false);
      if (blocked.ok) return;
      expect(blocked.error.code).toBe("CONFLICT");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
