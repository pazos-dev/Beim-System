import { describe, expect, it } from "vitest";

import {
  CLIENTE_HARD_REMOVE_ROLES,
  CLIENTE_WRITE_ROLES,
  clienteMatchesQuery,
  createClienteInputSchema,
  findDuplicateContact
} from "./cliente";

describe("cliente domain (CLI-2)", () => {
  it("validates input with Zod 4 email and requires displayName", () => {
    expect(createClienteInputSchema.safeParse({ displayName: "Ana" }).success).toBe(true);
    expect(createClienteInputSchema.safeParse({ displayName: "" }).success).toBe(false);
    expect(
      createClienteInputSchema.safeParse({ displayName: "Ana", email: "not-an-email" }).success
    ).toBe(false);
  });

  it("exposes write and hard-remove roles", () => {
    expect(CLIENTE_WRITE_ROLES.has("vendedor")).toBe(true);
    expect(CLIENTE_WRITE_ROLES.has("tecnico")).toBe(false);
    expect(CLIENTE_HARD_REMOVE_ROLES.has("administrador")).toBe(true);
    expect(CLIENTE_HARD_REMOVE_ROLES.has("vendedor")).toBe(false);
  });

  it("finds email duplicates case-insensitively before phone", () => {
    const clients = [
      { id: "c_1", displayName: "Ana", email: "ana@mail.com" },
      { id: "c_2", displayName: "Beto", phone: "555" }
    ];
    expect(findDuplicateContact(clients, { email: "ANA@mail.com" })).toBe("email");
    expect(findDuplicateContact(clients, { phone: "555" })).toBe("phone");
    expect(findDuplicateContact(clients, { email: "new@mail.com" })).toBeUndefined();
  });

  it("matches query on displayName and document", () => {
    expect(clienteMatchesQuery({ displayName: "María Gómez" }, "maría")).toBe(true);
    expect(clienteMatchesQuery({ displayName: "Ana", document: "ABC123" }, "abc")).toBe(true);
    expect(clienteMatchesQuery({ displayName: "Ana" }, "zzz")).toBe(false);
  });
});
