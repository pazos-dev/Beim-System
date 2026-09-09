import {
  Banknote,
  ClipboardList,
  FileText,
  Receipt,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  Warehouse,
  Wrench,
  type LucideIcon
} from "lucide-react";

import type { Role } from "../kernel/role";

export interface RouteEntry {
  readonly path: string;
  readonly roles: readonly Role[];
  readonly label: string;
  readonly icon: LucideIcon;
  readonly gate: "role" | "auth";
}

const ALL_ROLES: readonly Role[] = [
  "vendedor",
  "tecnico",
  "caja",
  "administrador",
  "administrador_principal"
];

const ADMIN_ROLES: readonly Role[] = ["administrador", "administrador_principal"];

// View matrix, grounded in observed page behavior (read-only reference):
// compras denies non-admin views, audit denies non-admin views,
// caja operations are caja/admin-only, ventas creation excludes tecnico.
// Slice-1 reconciles per-route values; the server API stays frozen.
export const ROUTES: readonly RouteEntry[] = [
  { gate: "auth", icon: ClipboardList, label: "Órdenes", path: "/app/ordenes", roles: ALL_ROLES },
  { gate: "auth", icon: Users, label: "Clientes", path: "/app/clientes", roles: ALL_ROLES },
  {
    gate: "role",
    icon: Banknote,
    label: "Ventas",
    path: "/app/ventas",
    roles: ["vendedor", "caja", "administrador", "administrador_principal"]
  },
  { gate: "role", icon: Receipt, label: "Compras", path: "/app/compras", roles: ADMIN_ROLES },
  { gate: "auth", icon: Warehouse, label: "Stock taller", path: "/app/stock", roles: ALL_ROLES },
  { gate: "auth", icon: Wrench, label: "Servicios", path: "/app/servicios", roles: ALL_ROLES },
  {
    gate: "role",
    icon: Wallet,
    label: "Caja",
    path: "/app/caja",
    roles: ["caja", "administrador", "administrador_principal"]
  },
  { gate: "auth", icon: FileText, label: "Reportes", path: "/app/reportes", roles: ALL_ROLES },
  { gate: "auth", icon: Settings, label: "Configuración", path: "/app/configuracion", roles: ALL_ROLES },
  { gate: "role", icon: ShieldCheck, label: "Auditoría", path: "/app/audit", roles: ADMIN_ROLES }
];

export function findRoute(path: string): RouteEntry | undefined {
  return ROUTES.find((entry) => entry.path === path);
}

export function canAccess(route: RouteEntry, role: Role | undefined): boolean {
  if (role === undefined) return false;
  return route.roles.includes(role);
}

export function selectVisibleRoutes(role: Role | undefined): readonly RouteEntry[] {
  if (role === undefined) return [];
  return ROUTES.filter((entry) => entry.roles.includes(role));
}
