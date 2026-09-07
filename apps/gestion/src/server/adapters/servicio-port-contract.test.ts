import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { JsonStore } from "../data/json-store";
import { auditDocumentSchema, idempotencyDocumentSchema } from "../data/schemas";
import { AuditRepository } from "../handlers/audit";
import { IdempotencyService } from "../handlers/idempotency";
import type { ServicioRepositoryPort } from "../ports/servicio";
import { ServicioUseCases, type ServicioActor } from "../use-cases/servicios";
import { JsonServicioRepository } from "./json-servicio-repository";
import { StubApiServicioRepository } from "../../test/stub-api-servicio-repository";

const SELLER: ServicioActor = { hasGlobalAccess: false, id: "u-vendedor", role: "vendedor" };

function seedRows() {
  return [
    { id: "s_tecnico_1", ownerId: "u-admin", version: 1, displayName: "Soporte tecnico", price: 300, active: true },
    { id: "s_tecnico_2", ownerId: "u-other", version: 2, displayName: "Visita tecnico express", price: 150, active: true },
    { id: "s_hidden", ownerId: "u-admin", version: 1, displayName: "Servicio archivado", price: 50, active: false }
  ];
}

async function writeServicioDocument(directory: string): Promise<void> {
  await writeFile(
    join(directory, "servicios.json"),
    JSON.stringify({ version: 1, servicios: seedRows() }, null, 2),
    "utf8"
  );
  await writeFile(join(directory, "audit.json"), JSON.stringify({ version: 0, events: [] }), "utf8");
  await writeFile(
    join(directory, "idempotency.json"),
    JSON.stringify({ version: 0, records: [] }),
    "utf8"
  );
}

function makeUseCases(port: ServicioRepositoryPort, directory: string): ServicioUseCases {
  return new ServicioUseCases(
    port,
    new AuditRepository(new JsonStore(join(directory, "audit.json"), auditDocumentSchema)),
    new IdempotencyService(new JsonStore(join(directory, "idempotency.json"), idempotencyDocumentSchema))
  );
}

async function runServicioContractSuite(
  name: string,
  makeUseCasesForTest: () => Promise<ServicioUseCases>
) {
  describe(name, () => {
    it("lists only active servicios by default with the page envelope", async () => {
      const useCases = await makeUseCasesForTest();
      const listed = await useCases.list(SELLER, { active: "true", page: 1, pageSize: 25, q: undefined });
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.value.page).toBe(1);
      expect(listed.value.pageSize).toBe(25);
      expect(listed.value.totalItems).toBe(2);
      expect(listed.value.items.map((item) => item.id).sort()).toEqual(["s_tecnico_1", "s_tecnico_2"]);
    });

    it("filters by displayName substring (q)", async () => {
      const useCases = await makeUseCasesForTest();
      const listed = await useCases.list(SELLER, { active: "all", page: 1, pageSize: 25, q: "express" });
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.value.totalItems).toBe(1);
      expect(listed.value.items[0]?.id).toBe("s_tecnico_2");
    });

    it("honours the active filter (false / all)", async () => {
      const useCases = await makeUseCasesForTest();
      const onlyInactive = await useCases.list(SELLER, { active: "false", page: 1, pageSize: 25, q: undefined });
      expect(onlyInactive.ok).toBe(true);
      if (!onlyInactive.ok) return;
      expect(onlyInactive.value.items.map((item) => item.id)).toEqual(["s_hidden"]);
      const everything = await useCases.list(SELLER, { active: "all", page: 1, pageSize: 25, q: undefined });
      expect(everything.ok).toBe(true);
      if (!everything.ok) return;
      expect(everything.value.totalItems).toBe(3);
    });

    it("paginates with page/pageSize slices", async () => {
      const useCases = await makeUseCasesForTest();
      const first = await useCases.list(SELLER, { active: "true", page: 1, pageSize: 1, q: undefined });
      const second = await useCases.list(SELLER, { active: "true", page: 2, pageSize: 1, q: undefined });
      expect(first.ok && second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(first.value.totalItems).toBe(2);
      expect(first.value.items).toHaveLength(1);
      expect(second.value.items).toHaveLength(1);
      expect(first.value.items[0]?.id).not.toBe(second.value.items[0]?.id);
    });

    it("reads any servicio by id for non-global actors (reads open)", async () => {
      const useCases = await makeUseCasesForTest();
      const found = await useCases.getById(SELLER, "s_tecnico_1");
      expect(found.ok).toBe(true);
      if (!found.ok) return;
      expect(found.value.displayName).toBe("Soporte tecnico");
    });

    it("returns NOT_FOUND_OR_FORBIDDEN for unknown ids", async () => {
      const useCases = await makeUseCasesForTest();
      const found = await useCases.getById(SELLER, "missing");
      expect(found.ok).toBe(false);
      if (!found.ok) expect(found.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
    });

    it("hides inactive servicios by default but keeps them readable with active=all", async () => {
      const useCases = await makeUseCasesForTest();
      const hidden = await useCases.getById(SELLER, "s_hidden");
      expect(hidden.ok).toBe(false);
      if (!hidden.ok) expect(hidden.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
      const readable = await useCases.getById(SELLER, "s_hidden", "all");
      expect(readable.ok).toBe(true);
    });
  });
}

const jsonDirs: string[] = [];

runServicioContractSuite("JsonServicioRepository contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gestion-servicio-contract-"));
  jsonDirs.push(directory);
  await writeServicioDocument(directory);
  return makeUseCases(new JsonServicioRepository(directory), directory);
});

runServicioContractSuite("StubApiServicioRepository contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gestion-servicio-stub-"));
  jsonDirs.push(directory);
  await writeServicioDocument(directory);
  const stub = new StubApiServicioRepository();
  stub.seed(seedRows());
  return makeUseCases(stub, directory);
});

afterAll(async () => {
  for (const directory of jsonDirs) await rm(directory, { force: true, recursive: true });
});

describe("servicio contract suite wiring", () => {
  it("registers both implementations", () => {
    expect(JsonServicioRepository).toBeDefined();
    expect(StubApiServicioRepository).toBeDefined();
  });
});
