import { createUserId, type Role } from "../../domain/shared/types.js";
import type { User } from "../../domain/user/user.js";

/**
 * Console-user row: the legacy `PUBLIC_COLUMNS` projection
 * (`id, username, name, role, active`). `password_hash` is NEVER selected —
 * the row type has no field for it, so no mapper output can leak it.
 */
export interface ConsoleUserRow {
  id: string;
  username: string;
  name: string;
  role: string;
  active: boolean;
}

/**
 * Row → `User`. `webUserId`/`lastLoginAt` default to null: the columns exist
 * (`web_user_id`, `last_login_at`) but no legacy statement selects them, and
 * byte-identical SQL wins over fuller hydration here.
 */
export function toDomainUser(row: ConsoleUserRow): User {
  return {
    id: createUserId(row.id),
    username: row.username,
    name: row.name,
    role: row.role as Role,
    active: row.active,
    webUserId: null,
    lastLoginAt: null
  };
}
