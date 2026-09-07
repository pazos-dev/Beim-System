/**
 * First-admin bootstrap (ops only — never called by the app runtime).
 *
 * Solves the chicken-and-egg problem: `register` creates unapproved
 * clientes and user admin requires an admin, so the very first admin must
 * come from outside the API. Re-runnable: same email promotes + resets the
 * password (handy for recovery and rotation — there is no change-password
 * endpoint yet).
 *
 * Usage:
 *   ADMIN_EMAIL=a@ejemplo.uy ADMIN_PASSWORD='<12+ chars>' [ADMIN_NAME=N...]
 *   pnpm --filter @beim/api db:bootstrap-admin [--yes]
 *
 * Production refuses to run without an explicit `--yes` flag. Env only —
 * credentials never live in this repo (`.env` is gitignored).
 */
import { pathToFileURL } from "node:url";
import { pool } from "../config/db.js";
import { hashPassword } from "../modules/webshop/services/auth.js";

export interface BootstrapAdminInput {
  email: string;
  password: string;
  name?: string;
}

export interface BootstrapAdminResult {
  id: string;
  email: string;
  role: string;
}

const MIN_PASSWORD_LENGTH = 12;

export async function bootstrapAdmin(input: BootstrapAdminInput): Promise<BootstrapAdminResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("ADMIN_EMAIL inválido");
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error("ADMIN_PASSWORD debe tener al menos 12 caracteres");
  }
  const passwordHash = await hashPassword(input.password);
  const { rows } = await pool.query<{ id: string; email: string; role: string }>(
    `INSERT INTO users (name, email, password_hash, role, is_approved)
     VALUES ($1, $2, $3, 'admin', true)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       role = 'admin',
       is_approved = true
     RETURNING id, email, role`,
    [input.name?.trim() || "Administrador", email, passwordHash]
  );
  const row = rows[0];
  if (row === undefined) throw new Error("No se pudo crear o promover el administrador");
  return { id: row.id, email: row.email, role: row.role };
}

export async function main(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const email = env.ADMIN_EMAIL;
  const password = env.ADMIN_PASSWORD;
  if (email === undefined || email.length === 0) throw new Error("Falta ADMIN_EMAIL");
  if (password === undefined || password.length === 0) throw new Error("Falta ADMIN_PASSWORD");
  if (env.NODE_ENV === "production" && !argv.includes("--yes")) {
    throw new Error("Bootstrap en producción requiere --yes explícito");
  }
  const result = await bootstrapAdmin({ email, password, name: env.ADMIN_NAME });
  // Never log the password (not even its length): id + email + role identify the run.
  console.log(`[db:bootstrap-admin] ok id=${result.id} email=${result.email} role=${result.role}`);
  await pool.end();
}

function isDirectRun(): boolean {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  main().catch(async (err: unknown) => {
    console.error("[db:bootstrap-admin] FAILED:", err instanceof Error ? err.message : err);
    try {
      await pool.end();
    } catch {
      // Ignore close errors on the failure path; the exit code carries it.
    }
    process.exitCode = 1;
  });
}
