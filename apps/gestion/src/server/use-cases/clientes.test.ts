import { readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { AuthActor } from "../handlers/auth";
import { createClienteUseCases } from "../composition/clientes";
import { createSeedDirectory } from "../../test/seed-dir";
import { clienteListQuerySchema, toClienteActor } from "./clientes";

function actor(id = "u-administrador"): AuthActor {
  return { id, username: "administrador", displayName: "Admin", role: "administrador" };
}

function sellerActor(): AuthActor {
  return { id: "u-vendedor", username: "vendedor", displayName: "Vendedor", role: "vendedor" };
}

function technicianActor(): AuthActor {
  return { id: "u-tecnico", username: "tecnico", displayName: "Tecnico", role: "tecnico" };
}

async function auditEventCount(directory: string): Promise<number> {
  const raw = await readFile(join(directory, "audit.json"), "utf8");
  return (JSON.parse(raw) as { events: unknown[] }).events.length;
}

describe("cliente use cases list/get (CLI-5)", () => {
  it("parses list query defaults and rejects overlong q", () => {
    expect(clienteListQuerySchema.safeParse({}).success).toBe(true);
    expect(clienteListQuerySchema.safeParse({ q: "x".repeat(121) }).success).toBe(false);
  });

  it("maps admin session actor to global access", () => {
    expect(toClienteActor(actor()).hasGlobalAccess).toBe(true);
    expect(
      toClienteActor({ ...actor(), id: "u-vendedor", role: "vendedor" }).hasGlobalAccess
    ).toBe(false);
  });

  it("paginates seeded clientes with ownership", async () => {
    const directory = process.env.GESTION_DATA_DIR ?? process.cwd();
    const useCases = createClienteUseCases(directory);
    const listed = await useCases.list(toClienteActor(actor()), {
      active: "true",
      page: 1,
      pageSize: 25
    });
    expect(listed.ok).toBe(true);
  });
});

describe("cliente use cases create (CLI-7)", () => {
  it("creates with a fresh key and records exactly one audit entry", async () => {
    const directory = await createSeedDirectory("gestion-clientes-create-");
    try {
      const useCases = createClienteUseCases(directory);
      const before = await auditEventCount(directory);
      const created = await useCases.create(
        toClienteActor(sellerActor()),
        { displayName: "Nuevo Cliente" },
        `key-${randomUUID()}`
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.value.cliente.displayName).toBe("Nuevo Cliente");
      expect(created.value.duplicateWarning).toBeUndefined();
      expect(await auditEventCount(directory)).toBe(before + 1);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("warns on duplicate email case-insensitively without blocking", async () => {
    const directory = await createSeedDirectory("gestion-clientes-dup-email-");
    try {
      const useCases = createClienteUseCases(directory);
      const first = await useCases.create(
        toClienteActor(sellerActor()),
        { displayName: "Ana", email: "ana@mail.com" },
        `key-${randomUUID()}`
      );
      expect(first.ok).toBe(true);
      const second = await useCases.create(
        toClienteActor(sellerActor()),
        { displayName: "Ana bis", email: "ANA@mail.com" },
        `key-${randomUUID()}`
      );
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.value.duplicateWarning).toBe("email");
      const listed = await useCases.list(toClienteActor(actor()), {
        active: "all",
        page: 1,
        pageSize: 25
      });
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      const anaMails = listed.value.items.filter(
        (item) => item.email?.toLowerCase() === "ana@mail.com"
      );
      expect(anaMails.length).toBe(2);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("warns on duplicate phone", async () => {
    const directory = await createSeedDirectory("gestion-clientes-dup-phone-");
    try {
      const useCases = createClienteUseCases(directory);
      const first = await useCases.create(
        toClienteActor(sellerActor()),
        { displayName: "Uno", phone: "555-1" },
        `key-${randomUUID()}`
      );
      expect(first.ok).toBe(true);
      const second = await useCases.create(
        toClienteActor(sellerActor()),
        { displayName: "Dos", phone: "555-1" },
        `key-${randomUUID()}`
      );
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.value.duplicateWarning).toBe("phone");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects non-writer roles without auditing", async () => {
    const directory = await createSeedDirectory("gestion-clientes-forbidden-");
    try {
      const useCases = createClienteUseCases(directory);
      const before = await auditEventCount(directory);
      const created = await useCases.create(
        toClienteActor(technicianActor()),
        { displayName: "Bloqueado" },
        `key-${randomUUID()}`
      );
      expect(created.ok).toBe(false);
      if (created.ok) return;
      expect(created.error.code).toBe("FORBIDDEN");
      expect(await auditEventCount(directory)).toBe(before);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects invalid bodies without auditing", async () => {
    const directory = await createSeedDirectory("gestion-clientes-invalid-");
    try {
      const useCases = createClienteUseCases(directory);
      const before = await auditEventCount(directory);
      const missing = await useCases.create(
        toClienteActor(sellerActor()),
        { email: "no-name@mail.com" },
        `key-${randomUUID()}`
      );
      expect(missing.ok).toBe(false);
      if (missing.ok) return;
      expect(missing.error.code).toBe("VALIDATION_ERROR");
      const malformed = await useCases.create(
        toClienteActor(sellerActor()),
        { displayName: "X", email: "not-an-email" },
        `key-${randomUUID()}`
      );
      expect(malformed.ok).toBe(false);
      expect(await auditEventCount(directory)).toBe(before);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("requires an idempotency key", async () => {
    const directory = await createSeedDirectory("gestion-clientes-key-");
    try {
      const useCases = createClienteUseCases(directory);
      const before = await auditEventCount(directory);
      const missing = await useCases.create(
        toClienteActor(sellerActor()),
        { displayName: "Sin clave" },
        undefined
      );
      expect(missing.ok).toBe(false);
      if (missing.ok) return;
      expect(missing.error.code).toBe("VALIDATION_ERROR");
      expect(await auditEventCount(directory)).toBe(before);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("replays the same key without a second effect or audit entry", async () => {
    const directory = await createSeedDirectory("gestion-clientes-replay-");
    try {
      const useCases = createClienteUseCases(directory);
      const key = `key-${randomUUID()}`;
      const before = await auditEventCount(directory);
      const first = await useCases.create(
        toClienteActor(sellerActor()),
        { displayName: "Replay" },
        key
      );
      const second = await useCases.create(
        toClienteActor(sellerActor()),
        { displayName: "Replay" },
        key
      );
      expect(first.ok && second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(second.value.cliente.id).toBe(first.value.cliente.id);
      expect(await auditEventCount(directory)).toBe(before + 1);
      const listed = await useCases.list(toClienteActor(actor()), {
        active: "all",
        page: 1,
        pageSize: 25
      });
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.value.items.filter((item) => item.displayName === "Replay").length).toBe(1);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("conflicts and audits when the same key carries a different payload", async () => {
    const directory = await createSeedDirectory("gestion-clientes-key-conflict-");
    try {
      const useCases = createClienteUseCases(directory);
      const key = `key-${randomUUID()}`;
      const before = await auditEventCount(directory);
      const first = await useCases.create(
        toClienteActor(sellerActor()),
        { displayName: "Original" },
        key
      );
      expect(first.ok).toBe(true);
      const second = await useCases.create(
        toClienteActor(sellerActor()),
        { displayName: "Distinto" },
        key
      );
      expect(second.ok).toBe(false);
      if (second.ok) return;
      expect(second.error.code).toBe("CONFLICT");
      expect(await auditEventCount(directory)).toBe(before + 2);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("returns AUDIT_FAILURE when the audit store is broken after the write", async () => {
    const directory = await createSeedDirectory("gestion-clientes-audit-fail-");
    try {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(join(directory, "audit.json"), "not-json", "utf8");
      const useCases = createClienteUseCases(directory);
      const created = await useCases.create(
        toClienteActor(sellerActor()),
        { displayName: "Sin auditoria" },
        `key-${randomUUID()}`
      );
      expect(created.ok).toBe(false);
      if (created.ok) return;
      expect(created.error.code).toBe("AUDIT_FAILURE");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

describe("cliente use cases update/remove (CLI-7)", () => {
  it("updates with the current version and bumps it", async () => {
    const directory = await createSeedDirectory("gestion-clientes-update-");
    try {
      const useCases = createClienteUseCases(directory);
      const before = await auditEventCount(directory);
      const updated = await useCases.update(
        toClienteActor(sellerActor()),
        "c_1",
        { phone: "555-9" },
        1,
        `key-${randomUUID()}`
      );
      expect(updated.ok).toBe(true);
      if (!updated.ok) return;
      expect(updated.value.phone).toBe("555-9");
      expect(updated.value.version).toBe(2);
      expect(await auditEventCount(directory)).toBe(before + 1);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("deactivates through writers and hides the row from default lists", async () => {
    const directory = await createSeedDirectory("gestion-clientes-deactivate-");
    try {
      const useCases = createClienteUseCases(directory);
      const updated = await useCases.update(
        toClienteActor(sellerActor()),
        "c_1",
        { active: false },
        1,
        `key-${randomUUID()}`
      );
      expect(updated.ok).toBe(true);
      if (!updated.ok) return;
      expect(updated.value.active).toBe(false);
      const visible = await useCases.list(toClienteActor(actor()), {
        active: "true",
        page: 1,
        pageSize: 25
      });
      expect(visible.ok).toBe(true);
      if (!visible.ok) return;
      expect(visible.value.items.some((item) => item.id === "c_1")).toBe(false);
      const all = await useCases.list(toClienteActor(actor()), {
        active: "all",
        page: 1,
        pageSize: 25
      });
      expect(all.ok).toBe(true);
      if (!all.ok) return;
      expect(all.value.items.some((item) => item.id === "c_1")).toBe(true);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("conflicts on stale versions and audits the attempt", async () => {
    const directory = await createSeedDirectory("gestion-clientes-stale-");
    try {
      const useCases = createClienteUseCases(directory);
      const before = await auditEventCount(directory);
      const stale = await useCases.update(
        toClienteActor(sellerActor()),
        "c_1",
        { phone: "555-0" },
        999,
        `key-${randomUUID()}`
      );
      expect(stale.ok).toBe(false);
      if (stale.ok) return;
      expect(stale.error.code).toBe("CONFLICT");
      expect(await auditEventCount(directory)).toBe(before + 1);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("returns NOT_FOUND_OR_FORBIDDEN for unknown ids and audits it", async () => {
    const directory = await createSeedDirectory("gestion-clientes-update-404-");
    try {
      const useCases = createClienteUseCases(directory);
      const before = await auditEventCount(directory);
      const updated = await useCases.update(
        toClienteActor(actor()),
        "missing",
        { phone: "555-0" },
        0,
        `key-${randomUUID()}`
      );
      expect(updated.ok).toBe(false);
      if (updated.ok) return;
      expect(updated.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
      expect(await auditEventCount(directory)).toBe(before + 1);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects updates from non-writers and from missing keys or versions", async () => {
    const directory = await createSeedDirectory("gestion-clientes-update-guards-");
    try {
      const useCases = createClienteUseCases(directory);
      const before = await auditEventCount(directory);
      const forbidden = await useCases.update(
        toClienteActor(technicianActor()),
        "c_1",
        { phone: "555-0" },
        1,
        `key-${randomUUID()}`
      );
      expect(forbidden.ok).toBe(false);
      if (forbidden.ok) return;
      expect(forbidden.error.code).toBe("FORBIDDEN");
      const noVersion = await useCases.update(
        toClienteActor(sellerActor()),
        "c_1",
        { phone: "555-0" },
        undefined,
        `key-${randomUUID()}`
      );
      expect(noVersion.ok).toBe(false);
      const noKey = await useCases.update(
        toClienteActor(sellerActor()),
        "c_1",
        { phone: "555-0" },
        1,
        undefined
      );
      expect(noKey.ok).toBe(false);
      if (noKey.ok) return;
      expect(noKey.error.code).toBe("VALIDATION_ERROR");
      expect(await auditEventCount(directory)).toBe(before);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("hard-removes as admin and audits once", async () => {
    const directory = await createSeedDirectory("gestion-clientes-remove-");
    try {
      const useCases = createClienteUseCases(directory);
      const before = await auditEventCount(directory);
      const removed = await useCases.remove(
        toClienteActor(actor()),
        "c_2",
        `key-${randomUUID()}`
      );
      expect(removed.ok).toBe(true);
      expect(await auditEventCount(directory)).toBe(before + 1);
      const found = await useCases.getById(toClienteActor(actor()), "c_2");
      expect(found.ok).toBe(false);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects hard-remove from non-admins without auditing", async () => {
    const directory = await createSeedDirectory("gestion-clientes-remove-403-");
    try {
      const useCases = createClienteUseCases(directory);
      const before = await auditEventCount(directory);
      const removed = await useCases.remove(
        toClienteActor(sellerActor()),
        "c_1",
        `key-${randomUUID()}`
      );
      expect(removed.ok).toBe(false);
      if (removed.ok) return;
      expect(removed.error.code).toBe("FORBIDDEN");
      expect(await auditEventCount(directory)).toBe(before);
      const found = await useCases.getById(toClienteActor(actor()), "c_1");
      expect(found.ok).toBe(true);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("audits remove attempts on unknown ids", async () => {
    const directory = await createSeedDirectory("gestion-clientes-remove-404-");
    try {
      const useCases = createClienteUseCases(directory);
      const before = await auditEventCount(directory);
      const removed = await useCases.remove(
        toClienteActor(actor()),
        "missing",
        `key-${randomUUID()}`
      );
      expect(removed.ok).toBe(false);
      if (removed.ok) return;
      expect(removed.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
      expect(await auditEventCount(directory)).toBe(before + 1);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
