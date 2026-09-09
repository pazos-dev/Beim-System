import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createSeedDirectory } from "../../test/seed-dir";
import { ERROR_CODES } from "../shared/errors";
import { createOrderStores, type OrderActor } from "../shared/order-context";
import { JsonOrdenRepository } from "./json-orden-repository";
import { OrderHandler, type OrderListViewQuery } from "./orders-handler";
import type { OrdenPortActor } from "./orden-port";

const admin: OrderActor = { id: "u-administrador", role: "administrador", hasGlobalAccess: true };
const principal: OrderActor = {
  id: "u-principal",
  role: "administrador_principal",
  hasGlobalAccess: true
};
const vendedor: OrderActor = { id: "u-vendedor", role: "vendedor", hasGlobalAccess: false };

function toPortActor(actor: OrderActor): OrdenPortActor {
  return { hasGlobalAccess: actor.hasGlobalAccess, id: actor.id, role: actor.role };
}

const LIST_ALL: OrderListViewQuery = {
  dir: "asc",
  estado: "todas",
  page: 1,
  pageSize: 25,
  sort: "numero"
};

let directory = "";
let repository: JsonOrdenRepository;

beforeEach(async () => {
  directory = await createSeedDirectory("gestion-orden-adapter-");
  repository = new JsonOrdenRepository(directory);
});

afterEach(async () => {
  await rm(directory, { force: true, recursive: true });
});

describe("JsonOrdenRepository list", () => {
  it("matches the frozen handler envelope for the same seed", async () => {
    const frozen = new OrderHandler(createOrderStores(directory));
    const expected = await frozen.listView(admin, LIST_ALL);
    const actual = await repository.list(toPortActor(admin), LIST_ALL);
    expect(actual).toEqual(expected);
  });

  it("exposes boleta numbers only to administrador_principal", async () => {
    const asAdmin = await repository.list(toPortActor(admin), LIST_ALL);
    const asPrincipal = await repository.list(toPortActor(principal), LIST_ALL);
    expect(asAdmin.ok && asAdmin.value.canViewBoleta).toBe(false);
    expect(asPrincipal.ok && asPrincipal.value.canViewBoleta).toBe(true);
  });

  it("filters by ownership for non-global actors", async () => {
    const listed = await repository.list(toPortActor(vendedor), LIST_ALL);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.items).toEqual([]);
    expect(listed.value.totalItems).toBe(0);
  });

  it("rejects unknown estado filters with VALIDATION_ERROR", async () => {
    const listed = await repository.list(toPortActor(admin), {
      ...LIST_ALL,
      estado: "no-existe"
    });
    expect(listed).toMatchObject({ ok: false, error: { code: ERROR_CODES.VALIDATION_ERROR } });
  });
});

describe("JsonOrdenRepository getById", () => {
  it("returns the same order as the frozen handler", async () => {
    const frozen = new OrderHandler(createOrderStores(directory));
    const expected = await frozen.getById(admin, "o_1");
    const actual = await repository.getById(toPortActor(admin), "o_1");
    expect(actual).toEqual(expected);
  });

  it("returns NOT_FOUND_OR_FORBIDDEN for unknown ids", async () => {
    const found = await repository.getById(toPortActor(admin), "missing");
    expect(found).toMatchObject({ ok: false, error: { code: ERROR_CODES.NOT_FOUND_OR_FORBIDDEN } });
  });
});

describe("JsonOrdenRepository create", () => {
  it("persists sale-less orders with the frozen envelope", async () => {
    const created = await repository.create(toPortActor(vendedor), {
      clienteId: "c_1",
      total: 900
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value).toMatchObject({
      ownerId: "u-vendedor",
      version: 1,
      clienteId: "c_1",
      estado: "en_diagnostico",
      paymentStatus: "pendiente",
      total: 900
    });
    const detail = await repository.getById(toPortActor(vendedor), created.value.id);
    expect(detail.ok).toBe(true);
    const listed = await repository.list(toPortActor(vendedor), LIST_ALL);
    expect(listed.ok && listed.value.totalItems).toBe(1);
  });

  it("matches frozen auto-numero assignment on identical seeds", async () => {
    const frozenDirectory = await createSeedDirectory("gestion-orden-frozen-");
    try {
      const frozen = new OrderHandler(createOrderStores(frozenDirectory));
      const expected = await frozen.create(admin, { clienteId: "c_1", total: 100 });
      const actual = await repository.create(toPortActor(admin), { clienteId: "c_1", total: 100 });
      expect(actual.ok && expected.ok).toBe(true);
      if (!actual.ok || !expected.ok) return;
      expect(actual.value.numero).toBe(expected.value.numero);
      expect(actual.value.estado).toBe(expected.value.estado);
      expect(actual.value.paymentStatus).toBe(expected.value.paymentStatus);
      expect(actual.value.version).toBe(expected.value.version);
    } finally {
      await rm(frozenDirectory, { force: true, recursive: true });
    }
  });

  it("rejects duplicated numero with CONFLICT without persisting", async () => {
    const before = await readFile(join(directory, "ordenes.json"), "utf8");
    const duplicated = await repository.create(toPortActor(vendedor), {
      clienteId: "c_1",
      numero: "0001-000001",
      total: 100
    });
    expect(duplicated).toMatchObject({ ok: false, error: { code: ERROR_CODES.CONFLICT } });
    expect(await readFile(join(directory, "ordenes.json"), "utf8")).toBe(before);
  });

  it("rejects unknown clienteId with NOT_FOUND_OR_FORBIDDEN", async () => {
    const created = await repository.create(toPortActor(vendedor), {
      clienteId: "c_missing",
      total: 100
    });
    expect(created).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.NOT_FOUND_OR_FORBIDDEN }
    });
  });
});

describe("JsonOrdenRepository corrupt storage", () => {
  it("returns STORAGE_ERROR without throwing", async () => {
    await writeFile(join(directory, "ordenes.json"), "{ corrupt", "utf8");
    await expect(repository.list(toPortActor(admin), LIST_ALL)).resolves.toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.STORAGE_ERROR }
    });
    await expect(repository.getById(toPortActor(admin), "o_1")).resolves.toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.STORAGE_ERROR }
    });
    await expect(
      repository.create(toPortActor(vendedor), { clienteId: "c_1", total: 10 })
    ).resolves.toMatchObject({ ok: false, error: { code: ERROR_CODES.STORAGE_ERROR } });
  });
});
