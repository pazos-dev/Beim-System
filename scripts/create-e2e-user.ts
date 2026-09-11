import { hashPassword } from "../apps/api/src/modules/webshop/services/auth.ts";
import { pool } from "../apps/api/src/config/db.ts";

async function main() {
  const password = process.env.E2E_PASSWORD ?? "TestPass-1234!";
  const hash = await hashPassword(password);
  
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
