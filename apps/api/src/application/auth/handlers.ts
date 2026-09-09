/**
 * Auth handlers (change `clean-arch-application`, Unit 1).
 *
 * One thin function per use case: plain DTO → `UnitOfWork.run` → load →
 * one domain behavior → save on the same `TxClient` → commit. Domain errors
 * pass through untouched to the edge `toAppError` mapping; password hashes
 * never enter domain objects or handler results.
 */
import { AuthError, NotFoundError } from "../../domain/shared/errors.js";
import type { UserId } from "../../domain/shared/types.js";
import { createUserId } from "../../domain/shared/types.js";
import {
  activateUser,
  approveClient,
  changeUserRole,
  createSession,
  deactivateUser,
  revokeSession
} from "../../domain/user/user.js";
import type { Client, User } from "../../domain/user/user.js";
import type { AuthDeps } from "./ports.js";

export interface UserIdInput {
  readonly userId: string;
}

export interface ChangeRoleInput {
  readonly userId: string;
  readonly role: string;
}

export interface RotatePasswordInput {
  readonly userId: string;
  readonly newPassword: string;
}

export interface ConsoleLoginInput {
  readonly username: string;
  readonly password: string;
}

export interface DeactivationResult {
  readonly user: User;
  readonly revokedSessions: number;
}

export interface ConsoleSession {
  readonly token: string;
  readonly expiresAt: Date;
  readonly user: Pick<User, "id" | "username" | "name" | "role">;
}

function consoleNotFound(id: UserId): NotFoundError {
  return new NotFoundError(`Usuario de consola no encontrado: ${id}`);
}

export function makeAuthHandlers(deps: AuthDeps) {
  const { uow, store } = deps;

  async function loadConsoleUser(tx: Parameters<Parameters<typeof uow.run>[0]>[0], id: UserId): Promise<User> {
    const user = await store.findUserById(tx, id);
    if (user === null) throw consoleNotFound(id);
    return user;
  }

  return {
    async activate(input: UserIdInput): Promise<User> {
      const id = createUserId(input.userId);
      return uow.run(async (tx) => {
        const activated = activateUser(await loadConsoleUser(tx, id));
        await store.saveUser(tx, activated);
        return activated;
      });
    },

    async deactivate(input: UserIdInput): Promise<DeactivationResult> {
      const id = createUserId(input.userId);
      return uow.run(async (tx) => {
        const user = await loadConsoleUser(tx, id);
        const { user: inactive, sessions } = deactivateUser(user, await store.findSessionsByUser(tx, id));
        await store.saveUser(tx, inactive);
        const owned = sessions.filter((session) => session.userId === id && session.revoked);
        for (const session of owned) await store.saveSession(tx, session);
        return { user: inactive, revokedSessions: owned.length };
      });
    },

    async changeRole(input: ChangeRoleInput): Promise<User> {
      const id = createUserId(input.userId);
      return uow.run(async (tx) => {
        const changed = changeUserRole(await loadConsoleUser(tx, id), input.role);
        await store.saveUser(tx, changed);
        return changed;
      });
    },

    async rotatePassword(input: RotatePasswordInput): Promise<User> {
      const id = createUserId(input.userId);
      return uow.run(async (tx) => {
        const user = await loadConsoleUser(tx, id);
        await store.savePasswordHash(tx, id, await deps.crypto.hash(input.newPassword));
        return user;
      });
    },

    async approve(input: UserIdInput): Promise<Client> {
      const id = createUserId(input.userId);
      return uow.run(async (tx) => {
        const client = await store.findClientById(tx, id);
        if (client === null) throw new NotFoundError(`Usuario no encontrado: ${id}`);
        const approved = approveClient(client);
        await store.saveClient(tx, approved);
        return approved;
      });
    },

    async disable(input: UserIdInput): Promise<Client> {
      const id = createUserId(input.userId);
      return uow.run(async (tx) => {
        const client = await store.findClientById(tx, id);
        if (client === null) throw new NotFoundError(`Usuario no encontrado: ${id}`);
        // Restores the `createClient` initial flag; forward approval stays in domain.
        const disabled = { ...client, isApproved: false };
        await store.saveClient(tx, disabled);
        for (const session of await store.findSessionsByUser(tx, id)) {
          if (!session.revoked) await store.saveSession(tx, revokeSession(session));
        }
        return disabled;
      });
    },

    async grantConsoleLogin(input: ConsoleLoginInput): Promise<ConsoleSession> {
      return uow.run(async (tx) => {
        const found = await store.findUserByUsername(tx, input.username);
        const passwordOk = await deps.crypto.verify(input.password, found?.passwordHash ?? null);
        // Uniform 401: unknown, inactive, or wrong password are indistinguishable.
        if (found === null || !found.user.active || !passwordOk) {
          throw new AuthError("AUTHENTICATION_REQUIRED", "Credenciales inválidas");
        }
        const { user } = found;
        const { token, tokenHash } = deps.bridge.issueToken();
        const expiresAt = deps.bridge.sessionExpiry(deps.clock.now());
        await store.saveSession(tx, createSession({ tokenHash, userId: user.id, expiresAt }));
        return { token, expiresAt, user: { id: user.id, username: user.username, name: user.name, role: user.role } };
      });
    }
  };
}
