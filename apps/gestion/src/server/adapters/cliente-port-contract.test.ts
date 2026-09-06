import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ClienteRepositoryPort } from "../ports/cliente";
import { JsonClienteRepository } from "./json-cliente-repository";
import { StubApiClienteRepository } from "../../test/stub-api-cliente-repository";

function clienteInput(id: string, ownerId: string, extra: Record<string, unknown> = {}) {
  return { id, ownerId, version: 1, displayName: `Cliente ${id}`, ...extra };
}

async function runContractSuite(name: string, makePort: () => Promise<ClienteRepositoryPort>) {
  describe(name, () => {
    it("creates and lists with ownership filter", async () => {
      const port = await makePort();
      const mine = { id: "u-mine", hasGlobalAccess: false };
      const other = { id: "u-other", hasGlobalAccess: false };
      const created = await port.create(mine, clienteInput("c_1", "u-mine"));
      expect(created.ok).toBe(true);
      const listedMine = await port.list(mine);
      expect(listedMine.ok && listedMine.value.length).toBe(1);
      const listedOther = await port.list(other);
      expect(listedOther.ok && listedOther.value.length).toBe(0);
      const listedGlobal = await port.list({ id: "u-admin", hasGlobalAccess: true });
      expect(listedGlobal.ok && listedGlobal.value.length).toBe(1);
    });

    it("returns NOT_FOUND_OR_FORBIDDEN for unknown ids", async () => {
      const port = await makePort();
      const actor = { id: "u-mine", hasGlobalAccess: false };
      const found = await port.getById(actor, "missing");
      expect(found.ok).toBe(false);
      if (!found.ok) expect(found.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
    });

    it("enforces optimistic concurrency on update", async () => {
      const port = await makePort();
      const actor = { id: "u-mine", hasGlobalAccess: false };
      const created = await port.create(actor, clienteInput("c_occ", "u-mine"));
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const stale = await port.update(
        actor,
        "c_occ",
        { ...created.value, displayName: "Stale", version: 2 },
        999
      );
      expect(stale.ok).toBe(false);
      if (!stale.ok) expect(stale.error.code).toBe("CONFLICT");
    });

    it("removes an existing cliente", async () => {
      const port = await makePort();
      const actor = { id: "u-mine", hasGlobalAccess: false };
      await port.create(actor, clienteInput("c_del", "u-mine"));
      const removed = await port.remove(actor, "c_del");
      expect(removed.ok).toBe(true);
      const found = await port.getById(actor, "c_del");
      expect(found.ok).toBe(false);
    });
  });
}

const jsonDirs: string[] = [];

runContractSuite("JsonClienteRepository contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gestion-cliente-contract-"));
  jsonDirs.push(directory);
  return new JsonClienteRepository(directory);
});

runContractSuite("StubApiClienteRepository contract", async () => new StubApiClienteRepository());

afterAll(async () => {
  for (const directory of jsonDirs) await rm(directory, { force: true, recursive: true });
});

describe("contract suite wiring", () => {
  beforeAll(() => {});
  it("registers both implementations", () => {
    expect(JsonClienteRepository).toBeDefined();
    expect(StubApiClienteRepository).toBeDefined();
  });
});
