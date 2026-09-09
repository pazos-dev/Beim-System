import { describe, expect, it } from "vitest";

import { ValidationError } from "../../errors/taxonomy.js";
import {
  changeUserRole,
  createClient,
  createSession,
  createUser,
  deactivateUser,
  isSessionExpired,
  reassignClientDocument,
  renameClient,
  type Client,
  type Session,
  type User
} from "./user.js";
import { createUserId } from "../shared/types.js";

const USER_ID = createUserId("123e4567-e89b-12d3-a456-426614174000");

function activeUser(overrides: Partial<User> = {}): User {
  return createUser({ id: USER_ID, username: "caja01", name: "Caja Uno", role: "caja", ...overrides });
}

function liveSession(overrides: Partial<Session> = {}): Session {
  return createSession({
    tokenHash: "a".repeat(64),
    userId: USER_ID,
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    ...overrides
  });
}

describe("User aggregate (domain slice)", () => {
  describe("createUser", () => {
    it("creates an active user with trimmed username", () => {
      const user = activeUser({ username: "  vendedor02 " });
      expect(user.active).toBe(true);
      expect(user.username).toBe("vendedor02");
      expect(user.webUserId).toBeNull();
      expect(user.lastLoginAt).toBeNull();
    });

    it("rejects an empty username or a role outside the closed set", () => {
      expect(() => activeUser({ username: "   " })).toThrow(ValidationError);
      expect(() => activeUser({ role: "owner" as never })).toThrow(ValidationError);
    });
  });

  describe("deactivate()", () => {
    it("marks the user inactive and revokes its sessions", () => {
      const user = activeUser();
      const sessions = [liveSession(), liveSession({ tokenHash: "b".repeat(64) })];

      const result = deactivateUser(user, sessions);

      expect(result.user.active).toBe(false);
      expect(result.sessions).toHaveLength(2);
      expect(result.sessions.every((session) => session.revoked)).toBe(true);
      expect(user.active).toBe(true);
    });

    it("leaves sessions of other users untouched", () => {
      const otherId = createUserId("123e4567-e89b-12d3-a456-426614174001");
      const foreign = createSession({
        tokenHash: "c".repeat(64),
        userId: otherId,
        expiresAt: new Date("2030-01-01T00:00:00.000Z")
      });

      const result = deactivateUser(activeUser(), [liveSession(), foreign]);

      expect(result.sessions[0]?.revoked).toBe(true);
      expect(result.sessions[1]).toBe(foreign);
    });
  });

  describe("changeRole()", () => {
    it("moves the user to another closed-set role", () => {
      expect(changeUserRole(activeUser(), "administrador").role).toBe("administrador");
    });

    it("rejects roles outside the closed set without mutating", () => {
      const user = activeUser();
      expect(() => changeUserRole(user, "owner" as never)).toThrow(ValidationError);
      expect(user.role).toBe("caja");
    });
  });

  describe("client.rename() / client.reassignDocument()", () => {
    it("renames the client profile with a trimmed non-empty name", () => {
      const client: Client = createClient({ id: USER_ID, name: "Juan" });
      const renamed = renameClient(client, "  Juan Pérez ");
      expect(renamed.name).toBe("Juan Pérez");
      expect(client.name).toBe("Juan");
    });

    it("rejects an empty rename", () => {
      expect(() => renameClient(createClient({ id: USER_ID, name: "Juan" }), "  ")).toThrow(
        ValidationError
      );
    });

    it("reassigns ci/rut documents", () => {
      const client = createClient({ id: USER_ID, name: "Juan" });
      const reassigned = reassignClientDocument(client, { ci: "4.567.890-1", rut: null });
      expect(reassigned.ci).toBe("4.567.890-1");
      expect(reassigned.rut).toBeNull();
    });
  });

  describe("Session detail", () => {
    it("expires when revoked, past expiry, or both (fixed clock)", () => {
      const clock = { now: () => new Date("2026-09-09T00:00:00.000Z") };
      const live = liveSession();
      const expired = liveSession({
        tokenHash: "d".repeat(64),
        expiresAt: new Date("2020-01-01T00:00:00.000Z")
      });

      expect(isSessionExpired(live, clock)).toBe(false);
      expect(isSessionExpired(expired, clock)).toBe(true);
      expect(isSessionExpired({ ...live, revoked: true }, clock)).toBe(true);
    });

    it("rejects an empty token hash at creation", () => {
      expect(() =>
        createSession({ tokenHash: "  ", userId: USER_ID, expiresAt: new Date() })
      ).toThrow(ValidationError);
    });
  });
});
