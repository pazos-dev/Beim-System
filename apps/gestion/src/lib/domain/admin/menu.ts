import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { JsonStore } from "../../../server/data/json-store";
import {
  MENU_ADMIN_ROLES,
  MENU_ERROR_CODES,
  MENU_STORE_NOT_FOUND_REASON,
  createMenuError,
  err,
  ok,
  type MenuActor,
  type MenuError,
  type MenuResult,
  type MenuStorePort
} from "./menu-result";

export const menuNodeSchema = z.object({
  id: z.string().min(1).max(100),
  parentId: z.string().min(1).max(100).nullable(),
  label: z.string().trim().min(1).max(120),
  href: z.string().trim().min(1).max(200),
  order: z.number().int().min(0)
});
export type MenuNode = z.infer<typeof menuNodeSchema>;
export const menuDocumentSchema = z.object({
  version: z.number().int().nonnegative(),
  nodes: z.array(menuNodeSchema)
});
export type MenuDocument = z.infer<typeof menuDocumentSchema>;
const createMenuNodeSchema = z.object({
  parentId: z.string().min(1).max(100).nullable().optional(),
  label: z.string().trim().min(1).max(120),
  href: z.string().trim().min(1).max(200),
  order: z.number().int().min(0).optional()
});
const moveMenuNodeSchema = z.object({
  parentId: z.string().min(1).max(100).nullable().optional(),
  order: z.number().int().min(0).optional(),
  expectedVersion: z.number().int().nonnegative()
});
export interface MenuTreeNode extends MenuNode { children: MenuTreeNode[] }
export function requireMenuAdmin<T extends MenuActor>(actor: T): MenuResult<T, MenuError> {
  return MENU_ADMIN_ROLES.has(actor.role) ? ok(actor) : err(createMenuError(MENU_ERROR_CODES.FORBIDDEN));
}

export function createMenuStore(dataDirectory: string): JsonStore<MenuDocument> {
  return new JsonStore(join(dataDirectory, "menu.json"), menuDocumentSchema);
}

export async function loadMenuDocument(store: MenuStorePort<MenuDocument>): Promise<MenuResult<MenuDocument, MenuError>> {
  const current = await store.read();
  if (current.ok) return ok(current.value);
  if (current.error.reason === MENU_STORE_NOT_FOUND_REASON) return ok({ version: 0, nodes: [] });
  return err(createMenuError(MENU_ERROR_CODES.STORAGE_ERROR));
}

export function buildMenuTree(nodes: ReadonlyArray<MenuNode>): MenuTreeNode[] {
  const byId = new Map(nodes.map((node) => [node.id, { ...node, children: [] as MenuTreeNode[] }]));
  const roots: MenuTreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId === null ? undefined : byId.get(node.parentId);
    if (parent === undefined) roots.push(node);
    else parent.children.push(node);
  }
  const sortDeep = (list: MenuTreeNode[]): void => {
    list.sort((a, b) => a.order - b.order);
    list.forEach((node) => sortDeep(node.children));
  };
  sortDeep(roots);
  return roots;
}

function createsCycle(nodes: ReadonlyArray<MenuNode>, id: string, parentId: string | null): boolean {
  let current: string | null = parentId;
  while (current !== null) {
    if (current === id) return true;
    current = nodes.find((node) => node.id === current)?.parentId ?? null;
  }
  return false;
}

function validationError(issues: z.ZodIssue[]): MenuError {
  return createMenuError(MENU_ERROR_CODES.VALIDATION_ERROR, { fields: issues.map((issue) => issue.path.join(".")) });
}

function normalizeSiblingOrders(nodes: MenuNode[], parents: ReadonlySet<string | null>): void {
  for (const parent of parents) {
    nodes.filter((node) => node.parentId === parent)
      .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1))
      .forEach((node, index) => { node.order = index; });
  }
}

export function insertMenuNode(document: MenuDocument, input: unknown): MenuResult<MenuDocument, MenuError> {
  const parsed = createMenuNodeSchema.safeParse(input);
  if (!parsed.success) return err(validationError(parsed.error.issues));
  const parentId = parsed.data.parentId ?? null;
  if (parentId !== null && !document.nodes.some((node) => node.id === parentId)) {
    return err(createMenuError(MENU_ERROR_CODES.VALIDATION_ERROR, { fields: ["parentId"] }));
  }
  const siblings = document.nodes.filter((node) => node.parentId === parentId).length;
  const node: MenuNode = { id: `m_${randomUUID()}`, parentId, label: parsed.data.label, href: parsed.data.href, order: parsed.data.order ?? siblings };
  if (createsCycle(document.nodes, node.id, parentId)) {
    return err(createMenuError(MENU_ERROR_CODES.VALIDATION_ERROR, { fields: ["parentId"] }));
  }
  const nodes = [...document.nodes, node];
  normalizeSiblingOrders(nodes, new Set([parentId]));
  return ok({ version: document.version + 1, nodes });
}

export function moveMenuNode(document: MenuDocument, id: string, input: unknown): MenuResult<MenuDocument, MenuError> {
  const parsed = moveMenuNodeSchema.safeParse(input);
  if (!parsed.success) return err(validationError(parsed.error.issues));
  if (parsed.data.expectedVersion !== document.version) return err(createMenuError(MENU_ERROR_CODES.CONFLICT));
  const target = document.nodes.find((node) => node.id === id);
  if (target === undefined) return err(createMenuError(MENU_ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
  const nextParent = parsed.data.parentId === undefined ? target.parentId : parsed.data.parentId;
  if (nextParent !== null && !document.nodes.some((node) => node.id === nextParent)) {
    return err(createMenuError(MENU_ERROR_CODES.VALIDATION_ERROR, { fields: ["parentId"] }));
  }
  if (createsCycle(document.nodes, id, nextParent)) {
    return err(createMenuError(MENU_ERROR_CODES.VALIDATION_ERROR, { fields: ["parentId"] }));
  }
  const nodes = document.nodes.map((node) => node.id === id
    ? { ...node, parentId: nextParent, order: parsed.data.order ?? node.order }
    : { ...node });
  normalizeSiblingOrders(nodes, new Set([target.parentId, nextParent]));
  return ok({ version: document.version + 1, nodes });
}
