import { join } from "node:path";

import { NextResponse } from "next/server";

import { JsonStore } from "../../../../../src/server/data/json-store";
import {
  rolePermissionsDocumentSchema,
  usersDocumentSchema,
  type Role
} from "../../../../../src/server/handlers/auth";
import { createGestionError, ERROR_CODES } from "../../../../../src/server/handlers/errors";

interface DevUserItem {
  readonly username: string;
  readonly displayName: string;
  readonly role: Role;
  readonly permissions: readonly string[];
}

export async function GET(): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: createGestionError(ERROR_CODES.FORBIDDEN) }, { status: 403 });
  }
  const dataDirectory = process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
  const usersStore = new JsonStore(join(dataDirectory, "users.json"), usersDocumentSchema);
  const permissionsStore = new JsonStore(join(dataDirectory, "role-permissions.json"), rolePermissionsDocumentSchema);
  const [users, permissions] = await Promise.all([usersStore.read(), permissionsStore.read()]);
  if (!users.ok || !permissions.ok) {
    const error = createGestionError(ERROR_CODES.STORAGE_ERROR);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
  const items: DevUserItem[] = users.value.users
    .filter((user) => user.active)
    .map((user) => ({
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      permissions: permissions.value.permissions[user.role] ?? []
    }));
  return NextResponse.json(items, { status: 200 });
}
