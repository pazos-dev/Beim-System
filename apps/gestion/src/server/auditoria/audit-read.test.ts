import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

import type { AuditEvent } from "../data/schemas";
import type { AuditReadFilters, AuditReadPort } from "./audit-read-port";
import { HttpAuditRepository } from "./http-audit-repository";
import { JsonAuditReadRepository } from "./json-audit-read-repository";
import {
  createAuditReadPort,
  isAuditHttpEnabled
} from "../composition/auditoria";

function auditFixture(
  id: string,
  actorId: string | null,
  accion: string,
  instante: string
): AuditEvent {
  return {
    id,
    actorId,
    accion,
    entidad: "venta",
    entidadId: null,
    instante,
    resultado: "ok",
    detalles: {}
  };
}

function seedEvents(): AuditEvent[] {
  return [
    auditFixture("a_1", "user-1", "venta.create", "2026-03-01T10:00:00.000Z"),
    auditFixture("a_2", "user-2", "venta.create", "2026-03-05T10:00:00.000Z"),
    auditFixture("a_3", "user-1", "caja.abrir", "2026-03-10T10:00:00.000Z")
  ];
}

const jsonDirs: string[] = [];

async function makeJsonPort(): Promise<AuditReadPort> {
  const directory = await mkdtemp(join(tmpdir(), "gestion-audit-read-"));
  jsonDirs.push(directory);
  await writeFile(
    join(directory, "audit.json"),
    JSON.stringify({ version: 1, events: seedEvents() }),
    "utf8"
  );
  return new JsonAuditReadRepository(directory);
}

interface RecordedCall {
  url: string;
  headers: Record<string, string>;
}

/** Mocked remote: filters like the real API (actor/action/from/to/page/limit). */
function mockApiFetch(events: AuditEvent[]) {
  const calls: RecordedCall[] = [];
  const impl = async (url: string, init: { headers: Record<string, string> }) => {
    calls.push({ url, headers: init.headers });
    const parsed = new URL(url);
    const actor = parsed.searchParams.get("actor");
    const action = parsed.searchParams.get("action");
    const from = parsed.searchParams.get("from");
    const to = parsed.searchParams.get("to");
    const filtered = events.filter((event) => {
      if (actor !== null && event.actorId !== actor) return false;
      if (action !== null && event.accion !== action) return false;
      if (from !== null && event.instante < from) return false;
      if (to !== null && event.instante > to) return false;
      return true;
    });
    const page = Number(parsed.searchParams.get("page") ?? "1");
    const limit = Number(parsed.searchParams.get("limit") ?? String(filtered.length));
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit).map((event) => ({
      id: event.id,
      actorUserId: event.actorId,
      actorRole: "admin",
      action: event.accion,
      entity: event.entidad,
      entityId: event.entidadId,
      timestamp: event.instante,
      result: event.resultado,
      details: event.detalles
    }));
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { items, total: filtered.length, page, limit } })
    };
  };
  return { calls, impl };
}

async function runReadContract(name: string, makePort: () => Promise<AuditReadPort>) {
  describe(name, () => {
    it("lists every record with the total when no filters are given", async () => {
      const port = await makePort();
      const result = await port.list({});
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.total).toBe(3);
      expect(result.value.items.map((item) => item.id).sort()).toEqual(["a_1", "a_2", "a_3"]);
    });

    it("filters by actor with exact match", async () => {
      const port = await makePort();
      const result = await port.list({ actorId: "user-1" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.total).toBe(2);
      expect(result.value.items.map((item) => item.id).sort()).toEqual(["a_1", "a_3"]);
    });

    it("filters by action with exact match", async () => {
      const port = await makePort();
      const result = await port.list({ action: "venta.create" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.total).toBe(2);
    });

    it("filters by inclusive date range", async () => {
      const filters: AuditReadFilters = {
        from: "2026-03-02T00:00:00.000Z",
        to: "2026-03-06T00:00:00.000Z"
      };
      const port = await makePort();
      const result = await port.list(filters);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.total).toBe(1);
      expect(result.value.items[0]?.id).toBe("a_2");
    });

    it("paginates while preserving the total", async () => {
      const port = await makePort();
      const result = await port.list({ page: 2, limit: 2 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.total).toBe(3);
      expect(result.value.items).toHaveLength(1);
    });
  });
}

await runReadContract("JsonAuditReadRepository contract", makeJsonPort);
await runReadContract("HttpAuditRepository contract", async () => {
  const { impl } = mockApiFetch(seedEvents());
  return new HttpAuditRepository({ baseUrl: "http://localhost:4000", token: "test-token", fetchImpl: impl });
});

describe("HttpAuditRepository mapping", () => {
  it("sends gestion filters as API query params with a Bearer token", async () => {
    const { calls, impl } = mockApiFetch(seedEvents());
    const port = new HttpAuditRepository({
      baseUrl: "http://localhost:4000/",
      token: "test-token",
      fetchImpl: impl
    });
    const result = await port.list({
      actorId: "user-1",
      action: "venta.create",
      from: "2026-03-01T00:00:00.000Z",
      to: "2026-03-31T00:00:00.000Z",
      page: 1,
      limit: 25
    });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    const url = new URL(call.url);
    expect(`${url.origin}${url.pathname}`).toBe("http://localhost:4000/api/v1/audit-logs");
    expect(url.searchParams.get("actor")).toBe("user-1");
    expect(url.searchParams.get("action")).toBe("venta.create");
    expect(url.searchParams.get("from")).toBe("2026-03-01T00:00:00.000Z");
    expect(url.searchParams.get("to")).toBe("2026-03-31T00:00:00.000Z");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(call.headers.Authorization).toBe("Bearer test-token");
  });

  it("maps API actor fields to gestion actorId fields", async () => {
    const impl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: {
          items: [
            {
              id: "log-1",
              actorUserId: "11111111-1111-4111-8111-111111111111",
              actorRole: "admin",
              action: "venta.create",
              entity: "venta",
              entityId: null,
              timestamp: "2026-03-01T10:00:00.000Z",
              result: "ok",
              details: {}
            }
          ],
          total: 1,
          page: 1,
          limit: 25
        }
      })
    });
    const port = new HttpAuditRepository({
      baseUrl: "http://localhost:4000",
      token: "test-token",
      fetchImpl: impl
    });
    const result = await port.list({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.total).toBe(1);
    expect(result.value.items[0]).toMatchObject({
      id: "log-1",
      actorId: "11111111-1111-4111-8111-111111111111",
      accion: "venta.create"
    });
  });

  it("never touches the network when a fetch implementation is injected", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const { impl } = mockApiFetch(seedEvents());
    const port = new HttpAuditRepository({
      baseUrl: "http://localhost:4000",
      token: "test-token",
      fetchImpl: impl
    });
    await port.list({});
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("maps 401 to AUTHENTICATION_REQUIRED", async () => {
    const port = new HttpAuditRepository({
      baseUrl: "http://localhost:4000",
      token: "stale-token",
      fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ ok: false }) })
    });
    const result = await port.list({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("maps 404 without identity to AUTHENTICATION_REQUIRED (live API rule)", async () => {
    const port = new HttpAuditRepository({
      baseUrl: "http://localhost:4000",
      token: "invalid-token",
      fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({ ok: false }) })
    });
    const result = await port.list({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("maps 403 to FORBIDDEN", async () => {
    const port = new HttpAuditRepository({
      baseUrl: "http://localhost:4000",
      token: "non-admin-token",
      fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ ok: false }) })
    });
    const result = await port.list({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FORBIDDEN");
  });

  it("maps server errors and rejected envelopes to DEPENDENCY_UNAVAILABLE", async () => {
    const failing = new HttpAuditRepository({
      baseUrl: "http://localhost:4000",
      token: "test-token",
      fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({ ok: false }) })
    });
    const failed = await failing.list({});
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error.code).toBe("DEPENDENCY_UNAVAILABLE");

    const nonEnvelope = new HttpAuditRepository({
      baseUrl: "http://localhost:4000",
      token: "test-token",
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: null }) })
    });
    const rejected = await nonEnvelope.list({});
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error.code).toBe("DEPENDENCY_UNAVAILABLE");

    const unreachable = new HttpAuditRepository({
      baseUrl: "http://localhost:4000",
      token: "test-token",
      fetchImpl: async () => {
        throw new Error("connection refused");
      }
    });
    const down = await unreachable.list({});
    expect(down.ok).toBe(false);
    if (!down.ok) expect(down.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });
});

describe("audit reader wiring", () => {
  it("keeps the Json behavior by default (no env set)", () => {
    expect(isAuditHttpEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    const port = createAuditReadPort("/tmp/gestion-data", {} as NodeJS.ProcessEnv);
    expect(port).toBeInstanceOf(JsonAuditReadRepository);
  });

  it("selects the HTTP repository only when both settings are present", () => {
    const both = {
      BEIM_API_BASE_URL: "http://localhost:4000",
      BEIM_API_TOKEN: "test-token"
    } as NodeJS.ProcessEnv;
    expect(isAuditHttpEnabled(both)).toBe(true);
    expect(createAuditReadPort("/tmp/gestion-data", both)).toBeInstanceOf(HttpAuditRepository);

    const tokenOnly = { BEIM_API_TOKEN: "test-token" } as NodeJS.ProcessEnv;
    expect(isAuditHttpEnabled(tokenOnly)).toBe(false);
    expect(createAuditReadPort("/tmp/gestion-data", tokenOnly)).toBeInstanceOf(JsonAuditReadRepository);

    const baseOnly = { BEIM_API_BASE_URL: "http://localhost:4000" } as NodeJS.ProcessEnv;
    expect(isAuditHttpEnabled(baseOnly)).toBe(false);
    expect(createAuditReadPort("/tmp/gestion-data", baseOnly)).toBeInstanceOf(JsonAuditReadRepository);
  });
});

afterAll(async () => {
  for (const directory of jsonDirs) await rm(directory, { force: true, recursive: true });
});

describe("contract suite wiring", () => {
  it("registers both implementations", () => {
    expect(JsonAuditReadRepository).toBeDefined();
    expect(HttpAuditRepository).toBeDefined();
  });
});
