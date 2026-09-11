import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";

const { Pool } = pg;

const scryptAsync = promisify(scrypt);
const SCRYPT_KEYLEN = 64;

async function hashPassword(password) {
  const salt = randomBytes(32);
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

async function main() {
  const password = process.env.E2E_PASSWORD ?? "TestPass-1234!";
  const hash = await hashPassword(password);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://beim@127.0.0.1:5432/beim_api" });

  await pool.query(
    `INSERT INTO gestion_users (username, name, password_hash, role, active)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (username) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       active = true`,
    ["e2e-test", "E2E Test User", hash, "administrador"]
  );

  console.log("E2E user created/updated: username=e2e-test password=" + password);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
