/**
 * User/Session revoke-on-deactivate (slice 2.1).
 *
 * `describePg`: deactivation through the `UserRepository` port revokes live
 * sessions on the same `TxClient` — console (`gestion_sessions`) and webshop
 * (`webshop_sessions`) realms. Skips without `TEST_DATABASE_URL`.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";
import { createUserId } from "../../domain/shared/types.js";

setupTestDatabase();

// Dynamic imports AFTER setupTestDatabase() set DATABASE_URL: the adapters
// reach the shared Pool through config/db at module evaluation time.
const { query } = await import("../../config/db.js");
const { withTransaction } = await import("../../db/withTransaction.js");
const { PgSessionAdapter } = await import("./pg-session.adapter.js");
const { PgUserAdapter } = await import("./pg-user.adapter.js");
const { hashPassword } = await import("../../modules/webshop/services/auth.js");

const CONSOLE_HASH = "d".repeat(64);
const WEB_HASH = "e".repeat(64);
const FUTURE = new Date("2030-01-01T00:00:00.000Z");

async function seedConsoleUser(): Promise<string> {
  const id = randomUUID();
  await query(
    `INSERT INTO gestion_users (id, username, name, password_hash, role, active)
     VALUES ($1::uuid, $2, $3, $4, 'vendedor', true)`,
    [id, `gu-${id.slice(0, 8)}`, "Consola Revoke", await hashPassword("Secreto-123!")]
  );
  return id;
}

async function seedWebshopClient(): Promise<string> {
  const id = randomUUID();
  await query(
    `INSERT INTO users (id, name, email, password_hash, role, is_approved)
     VALUES ($1::uuid, $2, $3, $4, 'cliente', true)`,
    [id, "Web Revoke", `revoke-${id.slice(0, 8)}@example.com`, await hashPassword("Secreto-123!")]
  );
  return id;
}

describePg("user/session revoke-on-deactivate via port", () => {
  it("deactivating a console user revokes its sessions on the same TxClient", async () => {
    const id = await seedConsoleUser();
    const sessions = new PgSessionAdapter();
    const users = new PgUserAdapter(sessions);

    await withTransaction(async (tx) => {
      await sessions.createConsoleSession({ userId: id, tokenHash: CONSOLE_HASH, expiresAt: FUTURE }, tx);
      const before = await users.findById(createUserId(id), tx);
      expect(before?.active).toBe(true);

      await users.save({ ...before!, active: false }, tx);

      const { rows } = await tx.query("SELECT count(*)::text AS n FROM gestion_sessions WHERE gestion_user_id = $1", [
        id
      ]);
      expect(rows[0].n).toBe("0");
    });

    const after = await users.findById(createUserId(id));
    expect(after?.active).toBe(false);
    expect(await sessions.resolveConsoleSession(CONSOLE_HASH)).toBeNull();
  });

  it("disabling a webshop client revokes its sessions on the same TxClient", async () => {
    const id = await seedWebshopClient();
    const sessions = new PgSessionAdapter();
    const users = new PgUserAdapter(sessions);

    await withTransaction(async (tx) => {
      await sessions.createWebSession({ userId: id, tokenHash: WEB_HASH, expiresAt: FUTURE }, tx);
      const before = await users.findClientById(createUserId(id), tx);
      expect(before?.isApproved).toBe(true);

      await users.saveClient({ ...before!, isApproved: false }, tx);

      const { rows } = await tx.query("SELECT count(*)::text AS n FROM webshop_sessions WHERE user_id = $1", [id]);
      expect(rows[0].n).toBe("0");
    });

    const after = await users.findClientById(createUserId(id));
    expect(after?.isApproved).toBe(false);
    expect(await sessions.resolveWebSession(WEB_HASH)).toBeNull();
  });
});
