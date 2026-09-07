/**
 * First-admin bootstrap tests (integration, needs Postgres).
 *
 * `main()` is injected with argv/env (never touches the real process env),
 * and only the missing-env paths go through it — it ends the shared pool,
 * so DB-backed cases use `bootstrapAdmin()` directly.
 */
import { describe, expect, it } from "vitest";
import { describePg, setupTestDatabase } from "./testDb.js";

// Same deal as app.test.ts: the module graph builds the shared Pool from
// DATABASE_URL at evaluation time; point it at the test database (no query
// runs without Postgres, and setupTestDatabase owns the lifecycle).
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

setupTestDatabase();

const { bootstrapAdmin, main } = await import("./bootstrap-admin.js");
const { verifyPassword } = await import("../modules/webshop/services/auth.js");
const { query } = await import("../config/db.js");

const EMAIL = "primer.admin@ejemplo.uy";

async function dbRow(email: string) {
  const { rows } = await query<{
    id: string;
    email: string;
    role: string;
    is_approved: boolean;
    password_hash: string;
  }>("SELECT id, email, role, is_approved, password_hash FROM users WHERE email = $1", [email]);
  return rows[0];
}

describePg("db:bootstrap-admin", () => {
  it("creates an approved admin with a hashed password", async () => {
    const result = await bootstrapAdmin({ email: EMAIL, password: "Arranque-1234!" });
    expect(result.email).toBe(EMAIL);
    expect(result.role).toBe("admin");
    expect(result.id).toBeTruthy();

    const row = await dbRow(EMAIL);
    expect(row?.role).toBe("admin");
    expect(row?.is_approved).toBe(true);
    expect(row?.password_hash).not.toContain("Arranque-1234!");
    expect(await verifyPassword("Arranque-1234!", row?.password_hash as string)).toBe(true);
  });

  it("is idempotent: same email promotes and rotates the password", async () => {
    await bootstrapAdmin({ email: EMAIL, password: "Arranque-1234!" });
    const result = await bootstrapAdmin({ email: "  PRIMER.ADMIN@ejemplo.uy ", password: "Rotada-5678!", name: "Jefa" });
    expect(result.email).toBe(EMAIL);

    const row = await dbRow(EMAIL);
    expect(row?.role).toBe("admin");
    expect(await verifyPassword("Rotada-5678!", row?.password_hash as string)).toBe(true);
    expect(await verifyPassword("Arranque-1234!", row?.password_hash as string)).toBe(false);
  });

  it("rejects a malformed email", async () => {
    await expect(bootstrapAdmin({ email: "no-es-email", password: "Arranque-1234!" })).rejects.toThrow(
      "ADMIN_EMAIL inválido"
    );
  });

  it("rejects a short password", async () => {
    await expect(bootstrapAdmin({ email: "corto@ejemplo.uy", password: "corta" })).rejects.toThrow(
      "al menos 12 caracteres"
    );
  });

  it("main() fails fast without env (never touches the pool)", async () => {
    await expect(main([], {})).rejects.toThrow("Falta ADMIN_EMAIL");
    await expect(main([], { ADMIN_EMAIL: EMAIL })).rejects.toThrow("Falta ADMIN_PASSWORD");
  });

  it("main() refuses production without --yes", async () => {
    await expect(
      main([], { ADMIN_EMAIL: EMAIL, ADMIN_PASSWORD: "Arranque-1234!", NODE_ENV: "production" })
    ).rejects.toThrow("--yes");
  });
});
