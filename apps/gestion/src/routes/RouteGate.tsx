"use client";

import type { ReactNode } from "react";

import { useSessionRole } from "../hooks/useSession";
import type { Role } from "../kernel/role";
import { canAccess, type RouteEntry } from "./route-table";

export interface RouteGateProps {
  readonly route: RouteEntry | undefined;
  // Explicit role wins (tests, previews); when omitted the gate reads the
  // logged-in actor via `useSessionRole` against the pinned table matrix.
  readonly actorRole?: Role | undefined;
  readonly children: ReactNode;
}

// UI-only gate: unknown paths render not-found, actors lacking the route
// role render access-denied. Authorization stays server-side (frozen API).
export function RouteGate({ actorRole, children, route }: RouteGateProps) {
  const storedRole = useSessionRole();
  const effectiveRole = actorRole ?? storedRole;
  if (route === undefined) {
    return <p role="alert">Página no encontrada.</p>;
  }
  if (!canAccess(route, effectiveRole)) {
    return <p role="alert">Acceso denegado.</p>;
  }
  return <>{children}</>;
}
