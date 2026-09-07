import { rm } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createVentaUseCases } from "../composition/ventas";
import type { PortActor } from "../ports/actor";
import { createSeedDirectory } from "../../test/seed-dir";
import { ventaMatchesQuery } from "./ventas";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
let directory = "";

const seller: PortActor = { id: "u-vendedor", hasGlobalAccess: false };
const admin: PortActor = { id: "u-administrador", hasGlobalAccess: true };

describe("VentaUseCases.list (VTA-1)", () => {
  it("returns the envelope with only matching estado", async () => {
    const listed = await createVentaUseCases(directory).list(seller, {
      page: 1,
      pageSize: 25,
      estado: "confirmada"
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.items.map((item) => item.id)).toEqual(["v_1"]);
    expect(listed.value.page).toBe(1);
    expect(listed.value.pageSize).toBe(25);
    expect(listed.value.totalItems).toBe(1);
  });

  it("filters by numero with q", async () => {
    const listed = await createVentaUseCases(directory).list(admin, {
      page: 1,
      pageSize: 25,
      q: "0001-000102"
    });
    expect(listed.ok && listed.value.items.map((item) => item.id)).toEqual(["v_2"]);
  });

  it("paginates across the visible set", async () => {
    const second = await createVentaUseCases(directory).list(admin, { page: 2, pageSize: 1 });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.items.map((item) => item.id)).toEqual(["v_2"]);
    expect(second.value.totalItems).toBe(2);
  });

  it("strips ownerId from list items", async () => {
    const listed = await createVentaUseCases(directory).list(admin, { page: 1, pageSize: 25 });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.items.length).toBe(2);
    expect(JSON.stringify(listed.value)).not.toMatch(/ownerId/);
  });
});

describe("VentaUseCases.getById (VTA-1)", () => {
  it("hides foreign sales with NOT_FOUND_OR_FORBIDDEN", async () => {
    const found = await createVentaUseCases(directory).getById(seller, "v_2");
    expect(found.ok).toBe(false);
    if (!found.ok) expect(found.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
  });

  it("returns NOT_FOUND_OR_FORBIDDEN for unknown ids", async () => {
    const found = await createVentaUseCases(directory).getById(admin, "missing");
    expect(found.ok).toBe(false);
    if (!found.ok) expect(found.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
  });

  it("rejects blank ids with VALIDATION_ERROR", async () => {
    const found = await createVentaUseCases(directory).getById(admin, "  ");
    expect(found.ok).toBe(false);
    if (!found.ok) expect(found.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("ventaMatchesQuery", () => {
  it("matches numero substrings case-insensitively", () => {
    expect(ventaMatchesQuery({ numero: "0001-000101" }, "000101")).toBe(true);
    expect(ventaMatchesQuery({ numero: "0001-000101" }, "0001")).toBe(true);
    expect(ventaMatchesQuery({ numero: "0001-000101" }, "9999")).toBe(false);
  });

  it("treats a blank query as a match", () => {
    expect(ventaMatchesQuery({ numero: "0001-000101" }, "   ")).toBe(true);
  });
});

beforeAll(async () => {
  directory = await createSeedDirectory("gestion-ventas-usecases-");
});

afterAll(async () => {
  if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
  else process.env.GESTION_DATA_DIR = previousDataDirectory;
  await rm(directory, { force: true, recursive: true });
});
