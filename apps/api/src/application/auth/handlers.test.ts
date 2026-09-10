import { describe, expect, it } from "vitest";

import type { TxClient, UnitOfWork } from "../../domain/shared/ports.js";
import { createUserId } from "../../domain/shared/types.js";
import { AuthError, NotFoundError, ValidationError } from "../../domain/shared/errors.js";
import {
  approveClient,
  createClient,
  createSession,
  createUser,
  type Client,
  type Session,
  type User
} from "../../domain/user/user.js";
import { makeAuthHandlers } from "./handlers.js";
import type { AuthUserStore, ConsoleSessionBridge, PasswordCrypto } from "./ports.js";

const UID = "123e4567-e89b-12d3-a456-426614174000";
const OTHER_UID = "223e4567-e89b-12d3-a456-426614174000";

/** DB-free stand-in: runs the callback against one dummy client, counts runs. */
class FakeUnitOfWork implements UnitOfWork {
  runs = 0;
  readonly tx = {} as TxClient;

  run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    this.runs += 1;
    return fn(this.tx);
  }
}

class FakeAuthStore implements AuthUserStore {
  users = new Map<string, User>();
  hashes = new Map<string, string>();
  clients = new Map<string, Client>();
  sessions: Session[] = [];
  seenTx: TxClient[] = [];
  saves = 0;

  private touch(tx: TxClient): void {
    this.seenTx.push(tx);
  }

  async findUserById(tx: TxClient, id: string): Promise<User | null> {
    this.touch(tx);
    return this.users.get(id) ?? null;
  }

  async findUserByUsername(tx: TxClient, username: string): Promise<{ user: User; passwordHash: string } | null> {
    this.touch(tx);
    const user = [...this.users.values()].find((u) => u.username === username) ?? null;
    if (user === null) return null;
    return { user, passwordHash: this.hashes.get(user.id) ?? "" };
  }

  async saveUser(tx: TxClient, user: User): Promise<void> {
    this.touch(tx);
    this.saves += 1;
    this.users.set(user.id, user);
  }

  async savePasswordHash(tx: TxClient, id: string, passwordHash: string): Promise<void> {
    this.touch(tx);
    this.saves += 1;
    this.hashes.set(id, passwordHash);
  }

  async findClientById(tx: TxClient, id: string): Promise<Client | null> {
    this.touch(tx);
    return this.clients.get(id) ?? null;
  }

  async saveClient(tx: TxClient, client: Client): Promise<void> {
    this.touch(tx);
    this.saves += 1;
    this.clients.set(client.id, client);
  }

  async findSessionsByUser(tx: TxClient, userId: string): Promise<Session[]> {
    this.touch(tx);
    return this.sessions.filter((s) => s.userId === userId);
  }

  async saveSession(tx: TxClient, session: Session): Promise<void> {
    this.touch(tx);
    this.saves += 1;
    this.sessions = [...this.sessions.filter((s) => s.tokenHash !== session.tokenHash), session];
  }
}

const stubCrypto: PasswordCrypto = {
  hash: async (password: string) => `hashed:${password}`,
  verify: async (password: string, storedHash: string | null) =>
    storedHash !== null && storedHash !== "" && storedHash === `hashed:${password}`
};

const stubBridge: ConsoleSessionBridge = {
  issueToken: () => ({ token: "opaque-token", tokenHash: "hash-of-token" }),
  sessionExpiry: (now: Date) => new Date(now.getTime() + 3_600_000)
};

function setup() {
  const uow = new FakeUnitOfWork();
  const store = new FakeAuthStore();
  const handlers = makeAuthHandlers({
    uow,
    store,
    crypto: stubCrypto,
    bridge: stubBridge,
    clock: { now: () => new Date("2026-01-01T00:00:00.000Z") }
  });
  return { uow, store, handlers };
}

function seedConsoleUser(store: FakeAuthStore, overrides: { id?: string; active?: boolean; username?: string } = {}): User {
  const id = overrides.id ?? UID;
  const user = createUser({ id, username: overrides.username ?? "caja01", name: "Caja Uno", role: "caja" });
  const stored = overrides.active === false ? { ...user, active: false } : user;
  store.users.set(id, stored);
  store.hashes.set(id, "hashed:secret");
  return stored;
}

function seedSession(store: FakeAuthStore, userId = UID, tokenHash = "a".repeat(64)): Session {
  const session = createSession({ tokenHash, userId, expiresAt: new Date("2030-01-01T00:00:00.000Z") });
  store.sessions.push(session);
  return session;
}

describe("auth handlers (DB-free)", () => {
  it("activates an inactive console user in one run on the same tx", async () => {
    const { uow, store, handlers } = setup();
    seedConsoleUser(store, { active: false });

    const user = await handlers.activate({ userId: UID });

    expect(user.active).toBe(true);
    expect(uow.runs).toBe(1);
    expect(store.seenTx.length).toBeGreaterThan(0);
    expect(store.seenTx.every((tx) => tx === uow.tx)).toBe(true);
  });

  it("deactivates and revokes only the owned sessions", async () => {
    const { uow, store, handlers } = setup();
    seedConsoleUser(store);
    seedSession(store, UID, "a".repeat(64));
    seedSession(store, OTHER_UID, "b".repeat(64));

    const result = await handlers.deactivate({ userId: UID });

    expect(result.user.active).toBe(false);
    expect(result.revokedSessions).toBe(1);
    expect(store.sessions.find((s) => s.tokenHash === "a".repeat(64))?.revoked).toBe(true);
    expect(store.sessions.find((s) => s.tokenHash === "b".repeat(64))?.revoked).toBe(false);
    expect(uow.runs).toBe(1);
  });

  it("changes role and lets domain validation pass through with zero saves", async () => {
    const { store, handlers } = setup();
    seedConsoleUser(store);

    const user = await handlers.changeRole({ userId: UID, role: "vendedor" });
    expect(user.role).toBe("vendedor");

    const savesBefore = store.saves;
    await expect(handlers.changeRole({ userId: UID, role: "owner" })).rejects.toBeInstanceOf(ValidationError);
    expect(store.saves).toBe(savesBefore);
  });

  it("rotates the password hash without ever returning it", async () => {
    const { uow, store, handlers } = setup();
    seedConsoleUser(store);

    const user = await handlers.rotatePassword({ userId: UID, newPassword: "nueva-clave" });

    expect(user.id).toBe(createUserId(UID));
    expect(store.hashes.get(UID)).toBe("hashed:nueva-clave");
    expect(JSON.stringify(user)).not.toContain("hashed:");
    expect(uow.runs).toBe(1);
  });

  it("approves a webshop client idempotently; unknown ids stay 404", async () => {
    const { store, handlers } = setup();
    store.clients.set(UID, createClient({ id: UID, name: "Web Uno", email: "w@beim.test" }));

    const first = await handlers.approve({ userId: UID });
    expect(first.isApproved).toBe(true);
    const second = await handlers.approve({ userId: UID });
    expect(second.isApproved).toBe(true);

    try {
      await handlers.approve({ userId: OTHER_UID });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
      expect((err as NotFoundError).code).toBe("NOT_FOUND_OR_FORBIDDEN");
      expect((err as NotFoundError).status).toBe(404);
    }
  });

  it("disables a client restoring unapproved and revoking its sessions", async () => {
    const { uow, store, handlers } = setup();
    store.clients.set(UID, approveClient(createClient({ id: UID, name: "Web Uno", email: "w@beim.test" })));
    seedSession(store, UID, "c".repeat(64));

    const client = await handlers.disable({ userId: UID });

    expect(client.isApproved).toBe(false);
    expect(store.sessions.find((s) => s.tokenHash === "c".repeat(64))?.revoked).toBe(true);
    expect(uow.runs).toBe(1);
  });

  it("grants console login and keeps 401 uniform for unknown, inactive, or wrong password", async () => {
    const { uow, store, handlers } = setup();
    seedConsoleUser(store);
    seedConsoleUser(store, { id: OTHER_UID, username: "baja01", active: false });

    const granted = await handlers.grantConsoleLogin({ username: "caja01", password: "secret" });
    expect(granted.token).toBe("opaque-token");
    expect(granted.user.username).toBe("caja01");
    expect(JSON.stringify(granted)).not.toContain("hashed:");
    expect(uow.runs).toBe(1);

    for (const input of [
      { username: "nadie", password: "secret" },
      { username: "caja01", password: "otra" },
      { username: "baja01", password: "secret" }
    ]) {
      try {
        await handlers.grantConsoleLogin(input);
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(AuthError);
        expect((err as AuthError).code).toBe("AUTHENTICATION_REQUIRED");
        expect((err as AuthError).status).toBe(401);
        expect((err as AuthError).message).toBe("Credenciales inválidas");
      }
    }
  });

  it("propagates malformed ids as 422 without touching the store", async () => {
    const { store, handlers } = setup();

    await expect(handlers.activate({ userId: "not-a-uuid" })).rejects.toBeInstanceOf(ValidationError);
    expect(store.saves).toBe(0);
    expect(store.seenTx).toHaveLength(0);
  });
});
