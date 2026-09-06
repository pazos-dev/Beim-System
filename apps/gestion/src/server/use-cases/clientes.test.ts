import { describe, expect, it } from "vitest";

import type { AuthActor } from "../handlers/auth";
import { JsonClienteRepository } from "../adapters/json-cliente-repository";
import { ClienteUseCases, clienteListQuerySchema, toClienteActor } from "./clientes";

function actor(id = "u-administrador"): AuthActor {
  return { id, username: "administrador", displayName: "Admin", role: "administrador" };
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
    const useCases = new ClienteUseCases(new JsonClienteRepository(directory));
    const listed = await useCases.list(toClienteActor(actor()), {
      active: "true",
      page: 1,
      pageSize: 25
    });
    expect(listed.ok).toBe(true);
  });
});
