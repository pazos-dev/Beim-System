"use client";

import type { ReactNode } from "react";

import type { Role } from "../kernel/role";
import { canAccess, type RouteEntry } from "./route-table";

export interface RouteGateProps {
  readonly route: RouteEntry | undefined;
  readonly actorRole: Role | undefined;
  readonly children: ReactNode;
}

// UI-only gate: unknown paths render not-found, actors lacking the route
// role render access-denied. Authorization stays server-side (frozen API).
export function RouteGate({ route, actorRole, children }: RouteGateProps) {
  if (route === undefined) {
    return <p role="alert">Página no encontrada.</p>;
  }
  if (!canAccess(route, actorRole)) {
    return <p role="alert">Acceso denegado.</p>;
  }
  return <>{children}</>;
}
