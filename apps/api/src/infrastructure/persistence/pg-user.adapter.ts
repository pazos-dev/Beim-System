import { query } from "../../config/db.js";
import { isPgUniqueViolation } from "../../db/pg-errors.js";
import { withTransaction, type TxClient } from "../../db/withTransaction.js";
import { ConflictError } from "../../errors/taxonomy.js";
import type { UserId } from "../../domain/shared/types.js";
import type { Client, User } from "../../domain/user/user.js";
import type { UserRepository } from "../../domain/user/user.repository.js";
import { toDomainClient, type WebshopClientRow } from "./pg-client.mapper.js";
import { PgSessionAdapter, queryOn } from "./pg-session.adapter.js";
import { toDomainUser, type ConsoleUserRow } from "./pg-user.mapper.js";

/**
 * User persistence (slice 2.1, change `clean-arch-infrastructure`).
 *
 * Implements the `domain/user` `UserRepository` port over the console
 * (`gestion_users`) and webshop (`users`, role `cliente`) tables. Statements
 * are copied byte-identical from `pg-gestion-users.ts`, `pg-users.ts` and
 * `pg-clients.ts`; `password_hash` is never selected. `save` persists
 * role + active (the only console fields legacy admin writes own) and revokes
 * console sessions on the same `TxClient` when deactivating — the
 * `setActive(false)` contract. `saveClient` persists name/email/phone via the
 * copied `pg-clients` set-builder plus the approve/disable pair (disable
 * revokes webshop sessions on the same `TxClient`).
 *
 * DELTA (needs spec ratification): `findById` has no hash-free by-id read in
 * legacy, so it selects the `PUBLIC_COLUMNS` projection by id. Read-only,
 * additive, zero legacy behavior change.
 */
export class PgUserAdapter implements UserRepository {
  constructor(private readonly sessions: PgSessionAdapter = new PgSessionAdapter()) {}

  async findById(id: UserId, client?: TxClient): Promise<User | null> {
    const rows = await queryOn<ConsoleUserRow>(client,
      "SELECT id, username, name, role, active FROM gestion_users WHERE id = $1",
      [id]
    );
    return rows[0] === undefined ? null : toDomainUser(rows[0]);
  }

  async findClientById(id: UserId, client?: TxClient): Promise<Client | null> {
    const rows = await queryOn<WebshopClientRow>(client,
      `SELECT id, name, email, phone, ci, rut, company, is_approved
       FROM users WHERE id = $1 AND role = 'cliente'`,
      [id]
    );
    return rows[0] === undefined ? null : toDomainClient(rows[0]);
  }

  async save(user: User, client?: TxClient): Promise<void> {
    const run = async (tx: TxClient): Promise<void> => {
      await tx.query(
        "UPDATE gestion_users SET role = $2, updated_at = now() WHERE id = $1 RETURNING id, username, name, role, active",
        [user.id, user.role]
      );
      await tx.query(
        "UPDATE gestion_users SET active = $2, updated_at = now() WHERE id = $1 RETURNING id, username, name, role, active",
        [user.id, user.active]
      );
      if (!user.active) await this.sessions.revokeConsoleSessions(user.id, tx);
    };
    if (client !== undefined) await run(client);
    else await withTransaction(run);
  }

  async saveClient(client: Client, txClient?: TxClient): Promise<void> {
    const run = async (tx: TxClient): Promise<void> => {
      const sets: string[] = [];
      const params: unknown[] = [client.name, client.email, client.phone];
      sets.push("name = $1", "email = $2", "phone = $3");
      params.push(client.id);
      try {
        await tx.query<WebshopClientRow>(
          `UPDATE users SET ${sets.join(", ")}, updated_at = now()
         WHERE id = $${params.length} AND role = 'cliente'
         RETURNING id, name, email, phone, ci, rut, company, is_approved`,
          params
        );
      } catch (err) {
        if (isPgUniqueViolation(err)) {
          throw new ConflictError("Ya existe un cliente con ese email");
        }
        throw err;
      }
      if (client.isApproved) {
        await tx.query(
          "UPDATE users SET is_approved = true, updated_at = now() WHERE id = $1 RETURNING id, name, email, username, role, is_approved",
          [client.id]
        );
      } else {
        await tx.query(
          "UPDATE users SET is_approved = false, updated_at = now() WHERE id = $1 RETURNING id, name, email, username, role, is_approved",
          [client.id]
        );
        await this.sessions.revokeWebSessions(client.id, tx);
      }
    };
    if (txClient !== undefined) await run(txClient);
    else await withTransaction(run);
  }
}
