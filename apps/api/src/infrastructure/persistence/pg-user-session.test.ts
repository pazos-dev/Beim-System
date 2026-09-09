/**
 * User/Session adapters (slice 2.1, change `clean-arch-infrastructure`).
 *
 * DB-free: mapper unit tests (hashes never cross) + SQL-text asserts against
 * the legacy reference (`modules/gestion/repositories/pg-*.ts`,
 * `modules/webshop/repositories/pg-auth.ts`). Every emitted statement must be
 * byte-identical to its legacy source except `findById` (no hash-free by-id
 * read exists in legacy — flagged delta, see adapter).
 */
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { createUserId } from "../../domain/shared/types.js";
import { createClient, createUser } from "../../domain/user/user.js";
import type { UserRepository } from "../../domain/user/user.repository.js";

const { PgSessionAdapter } = await import("./pg-session.adapter.js");
const { PgUserAdapter } = await import("./pg-user.adapter.js");
const { toDomainUser } = await import("./pg-user.mapper.js");
const { toDomainClient } = await import("./pg-client.mapper.js");

const ID = "123e4567-e89b-12d3-a456-426614174000";
const OTHER_ID = "123e4567-e89b-12d3-a456-426614174001";

function stubClient(captured: string[], rows: unknown[] = []) {
  const client = {
    query: async (text: string) => {
      captured.push(text);
      return { rows };
    }
  } as unknown as PoolClient;
  return client;
}

function adapters() {
  const sessions = new PgSessionAdapter();
  const users = new PgUserAdapter(sessions);
  return { users, sessions };
}

describe("user/client mappers (hashes never cross)", () => {
  it("maps a console row to exactly the public User fields", () => {
    const user = toDomainUser({ id: ID, username: "caja01", name: "Caja Uno", role: "caja", active: true });

    expect(user).toEqual({
      id: createUserId(ID),
      username: "caja01",
      name: "Caja Uno",
      role: "caja",
      active: true,
      webUserId: null,
      lastLoginAt: null
    });
    expect("passwordHash" in user).toBe(false);
  });

  it("maps a webshop row to exactly the public Client fields", () => {
    const client = toDomainClient({
      id: ID,
      name: "Ana",
      email: "ana@example.com",
      phone: null,
      ci: null,
      rut: null,
      company: "ACME",
      is_approved: true
    });

    expect(client).toEqual({
      id: createUserId(ID),
      name: "Ana",
      email: "ana@example.com",
      phone: null,
      ci: null,
      rut: null,
      isApproved: true
    });
    expect("passwordHash" in client).toBe(false);
    expect("company" in client).toBe(false);
  });
});

describe("PgUserAdapter SQL text (byte-identical to legacy)", () => {
  it("findClientById emits the pg-clients getById text", async () => {
    const { users } = adapters();
    const captured: string[] = [];
    const c = stubClient(captured, []);
    const found = await users.findClientById(createUserId(ID), c);

    expect(found).toBeNull();
    expect(captured).toEqual([
      "SELECT id, name, email, phone, ci, rut, company, is_approved\n       FROM users WHERE id = $1 AND role = 'cliente'"
    ]);
  });

  it("save on an active user emits the setRole + setActive texts, no session revoke", async () => {
    const { users } = adapters();
    const captured: string[] = [];
    const user = createUser({ id: ID, username: "caja01", name: "Caja Uno", role: "caja" });
    const c = stubClient(captured, []);

    await users.save(user, c);

    expect(captured).toEqual([
      "UPDATE gestion_users SET role = $2, updated_at = now() WHERE id = $1 RETURNING id, username, name, role, active",
      "UPDATE gestion_users SET active = $2, updated_at = now() WHERE id = $1 RETURNING id, username, name, role, active"
    ]);
  });

  it("save on an inactive user revokes console sessions on the same TxClient", async () => {
    const { users } = adapters();
    const captured: string[] = [];
    const user = { ...createUser({ id: ID, username: "caja01", name: "Caja Uno", role: "caja" }), active: false };
    const c = stubClient(captured, []);

    await users.save(user, c);

    expect(captured).toEqual([
      "UPDATE gestion_users SET role = $2, updated_at = now() WHERE id = $1 RETURNING id, username, name, role, active",
      "UPDATE gestion_users SET active = $2, updated_at = now() WHERE id = $1 RETURNING id, username, name, role, active",
      "DELETE FROM gestion_sessions WHERE gestion_user_id = $1"
    ]);
  });

  it("implements the UserRepository port", () => {
    const users: UserRepository = new PgUserAdapter(new PgSessionAdapter());
    expect(users.findById).toBeDefined();
    expect(users.saveClient).toBeDefined();
  });

  it("saveClient on an unapproved client emits update + disable + webshop revoke", async () => {
    const { users } = adapters();
    const captured: string[] = [];
    const clientValue = { ...createClient({ id: OTHER_ID, name: "Ana" }), isApproved: false };
    const c = stubClient(captured, []);

    await users.saveClient(clientValue, c);

    expect(captured[0]).toBe(
      "UPDATE users SET name = $1, email = $2, phone = $3, updated_at = now()\n         WHERE id = $4 AND role = 'cliente'\n         RETURNING id, name, email, phone, ci, rut, company, is_approved"
    );
    expect(captured.slice(1)).toEqual([
      "UPDATE users SET is_approved = false, updated_at = now() WHERE id = $1 RETURNING id, name, email, username, role, is_approved",
      "DELETE FROM webshop_sessions WHERE user_id = $1"
    ]);
  });

  it("never selects password_hash in any emitted read", async () => {
    const { users } = adapters();
    const captured: string[] = [];
    const c = stubClient(captured, [
      { id: ID, username: "caja01", name: "Caja Uno", role: "caja", active: true }
    ]);

    await users.findById(createUserId(ID), c);
    await users.findClientById(createUserId(ID), c);

    for (const text of captured.filter((t) => t.startsWith("SELECT"))) {
      expect(text).not.toMatch(/password_hash/i);
    }
  });
});

describe("PgSessionAdapter SQL text (byte-identical to pg-auth)", () => {
  it("createWebSession emits revoke-then-insert on the given client", async () => {
    const captured: string[] = [];
    const { sessions } = adapters();
    const c = stubClient(captured, []);

    await sessions.createWebSession(
      { userId: ID, tokenHash: "a".repeat(64), expiresAt: new Date("2030-01-01T00:00:00.000Z") },
      c
    );

    expect(captured).toEqual([
      "DELETE FROM webshop_sessions WHERE user_id = $1",
      "INSERT INTO webshop_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)"
    ]);
  });

  it("resolveWebSession emits the pg-auth live-session join", async () => {
    const captured: string[] = [];
    const { sessions } = adapters();
    const c = stubClient(captured, []);

    const claims = await sessions.resolveWebSession("a".repeat(64), c);

    expect(claims).toBeNull();
    expect(captured).toEqual([
      "SELECT s.user_id, u.role\n        FROM webshop_sessions s\n        JOIN users u ON u.id = s.user_id\n        WHERE s.token_hash = $1 AND s.expires_at > now()"
    ]);
  });

  it("createConsoleSession + resolveConsoleSession emit the gestion texts", async () => {
    const captured: string[] = [];
    const { sessions } = adapters();
    const c = stubClient(captured, []);

    await sessions.createConsoleSession(
      { userId: ID, tokenHash: "b".repeat(64), expiresAt: new Date("2030-01-01T00:00:00.000Z") },
      c
    );
    await sessions.resolveConsoleSession("b".repeat(64), c);

    expect(captured).toEqual([
      "DELETE FROM gestion_sessions WHERE gestion_user_id = $1",
      "INSERT INTO gestion_sessions (token_hash, gestion_user_id, expires_at) VALUES ($1, $2, $3)",
      "SELECT s.gestion_user_id, u.role\n        FROM gestion_sessions s\n        JOIN gestion_users u ON u.id = s.gestion_user_id\n        WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active = true"
    ]);
  });

  it("bridge lookup emits the pg-auth text and drops the token hash", async () => {
    const captured: string[] = [];
    const { sessions } = adapters();
    const c = stubClient(captured, []);

    const found = await sessions.findBridgeToken("c".repeat(64), c);

    expect(found).toBeNull();
    expect(captured).toEqual([
      "SELECT web_user_id, expires_at FROM gestion_web_access_tokens WHERE token_hash = $1 AND expires_at > now()"
    ]);
  });

  it("revoke helpers emit the legacy session deletes", async () => {
    const captured: string[] = [];
    const { sessions } = adapters();
    const c = stubClient(captured, []);

    await sessions.revokeWebSessions(ID, c);
    await sessions.revokeConsoleSessions(ID, c);
    await sessions.deleteWebSession("a".repeat(64), c);
    await sessions.deleteConsoleSession("b".repeat(64), c);
    await sessions.consumeBridgeToken("c".repeat(64), c);

    expect(captured).toEqual([
      "DELETE FROM webshop_sessions WHERE user_id = $1",
      "DELETE FROM gestion_sessions WHERE gestion_user_id = $1",
      "DELETE FROM webshop_sessions WHERE token_hash = $1",
      "DELETE FROM gestion_sessions WHERE token_hash = $1",
      "DELETE FROM gestion_web_access_tokens WHERE token_hash = $1"
    ]);
  });
});
