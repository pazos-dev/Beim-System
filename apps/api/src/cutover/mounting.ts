import { Router, type Express } from "express";
import { requireRole } from "../interface/http/edge/auth.js";
import { createReceiptRouter, type ReceiptRouterDeps } from "../interface/http/receipt/router.js";
import { createUserRouter } from "../interface/http/user/router.js";
import { legacyUserPort, makeUserRouterDeps, type UserLegacyPort } from "./user-adapters.js";

/**
 * Cutover mounting factories, part A (change `clean-arch-interface`, F8a).
 *
 * Factories that build the thin routers already wired to the legacy adapters,
 * applying the operator gate at wiring time for the guard-less routers
 * (receipt carries no role gates inside by design; user carries its own admin
 * gate). The composition root does NOT call these yet — `mountCutoverRouters`
 * stays disabled by default — so nothing mounts and `/openapi.json` stays
 * byte-identical in this slice (cutover PR8 flips the switch).
 */

/** Operator roles mirrored from the legacy `gestion` router. */
export const OPERATOR_ROLES = [
  "vendedor",
  "tecnico",
  "caja",
  "administrador",
  "administrador_principal",
  "admin",
  "superadmin"
];

/** Wiring-time operator gate (NOT_FOUND_OR_FORBIDDEN edge policy). */
export const operatorGuard = requireRole(...OPERATOR_ROLES);

/** Admin roles mirrored from the legacy `gestion` router (`ADMIN_ROLES`). */
export const ADMIN_ROLES = ["administrador", "administrador_principal", "admin", "superadmin"];

/**
 * Wiring-time admin gate for legacy writes (services `POST /` and
 * `PUT /:id` mount behind it at cutover; the thin router carries no role
 * gates by design). Same NOT_FOUND_OR_FORBIDDEN edge policy as operators.
 */
export const adminGuard = requireRole(...ADMIN_ROLES);

/** Master switch: false until the cutover slice mounts the wired routers. */
export const CUTOVER_MOUNT_ENABLED = false;

/** Builds the user thin router wired to the legacy port (admin gate inside). */
export function createCutoverUserRouter(port: UserLegacyPort = legacyUserPort): Router {
  return createUserRouter(makeUserRouterDeps(port));
}

/**
 * Builds the receipt thin router with the operator gate applied at wiring
 * (the router itself carries no role gates by design).
 */
export function createCutoverReceiptRouter(deps: ReceiptRouterDeps): Router {
  const router: Router = Router();
  router.use(operatorGuard, createReceiptRouter(deps));
  return router;
}

export interface MountCutoverOptions {
  enabled?: boolean;
  userPort?: UserLegacyPort;
}

/**
 * Mounts the fully-wired cutover routers under `/api/v1`. No-op returning
 * false unless explicitly enabled — the composition root never enables it in
 * part A, so the legacy routers keep serving every path untouched.
 */
export function mountCutoverRouters(app: Express, options: MountCutoverOptions = {}): boolean {
  if (options.enabled !== true) return false;
  app.use("/api/v1", createCutoverUserRouter(options.userPort));
  return true;
}
