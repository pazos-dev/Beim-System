import { Router } from "express";
import type { Identity } from "../edge/auth.js";
import { requireRole } from "../edge/auth.js";
import { rateLimit } from "../edge/rate-limit.js";
import { validate } from "../edge/validate.js";
import { asyncHandler } from "../../../middleware/error-handler.js";
import { buildSuccessEnvelope } from "../../../errors/envelope.js";
import { AuthError } from "../../../errors/taxonomy.js";
import {
  gestionAccessSchema,
  gestionLoginSchema,
  gestionUserCreateSchema,
  gestionUserPasswordBodySchema,
  gestionUserRoleBodySchema,
  gestionUsersListQuerySchema,
  loginSchema,
  registerSchema,
  userIdParamSchema,
  userRoleBodySchema,
  usersListQuerySchema,
  type GestionAccessInput,
  type GestionLoginInput,
  type GestionUserCreateInput,
  type GestionUsersListQuery,
  type LoginInput,
  type RegisterInput,
  type UsersListQuery
} from "./dtos.js";

/**
 * User/Auth thin router (interface layer, Unidad 2).
 *
 * Validate (strict zod) → call exactly one injected handler → render the
 * frozen envelope. No business rules, no data access, no infrastructure
 * imports: every dependency is a handler function supplied by the composition root
 * (fakes in tests; application handlers at cutover). Routes, envelopes and
 * statuses mirror the legacy `gestion/router.ts` users/gestion-users block
 * plus the `webshop/router.ts` auth block — zero observable change.
 *
 * NOT mounted yet: cutover (PR8) mounts it under `/api/v1` and empties the
 * legacy blocks, so `/openapi.json` stays byte-identical in this slice.
 */

/** Audit journal actor — same shape the legacy `toAuditActor` builds. */
export interface UserAuditActor {
  actorUserId: string | null;
  actorRole: string | null;
}

/** Handler surface the router calls; implemented by application handlers at cutover. */
export interface UserRouterDeps {
  login(input: LoginInput): Promise<unknown>;
  register(input: RegisterInput): Promise<unknown | null>;
  gestionAccess(input: GestionAccessInput): Promise<unknown>;
  gestionLogin(input: GestionLoginInput): Promise<unknown>;
  logout(input: { token: string }): Promise<void>;
  listUsers(query: UsersListQuery): Promise<unknown>;
  approveUser(id: string, actor: UserAuditActor): Promise<unknown>;
  setUserRole(id: string, role: string, actor: UserAuditActor): Promise<unknown>;
  disableUser(id: string, actor: UserAuditActor): Promise<unknown>;
  listGestionUsers(query: GestionUsersListQuery): Promise<unknown>;
  createGestionUser(input: GestionUserCreateInput, actor: UserAuditActor): Promise<unknown | null>;
  setGestionUserRole(id: string, role: string, actor: UserAuditActor): Promise<unknown>;
  setGestionUserActive(id: string, active: boolean, actor: UserAuditActor): Promise<unknown>;
  resetGestionUserPassword(id: string, password: string, actor: UserAuditActor): Promise<void>;
}

const ADMIN_ROLES = ["administrador", "administrador_principal", "admin", "superadmin"];

function toAuditActor(identity: Identity | undefined): UserAuditActor {
  return { actorUserId: identity?.userId ?? null, actorRole: identity?.roles[0] ?? null };
}

/**
 * Bearer parser (same semantics as the webshop token guard: case-sensitive
 * `Bearer ` prefix, trimmed, empty → null). Local on purpose: the canonical
 * helper lives in `modules/webshop/`, which the interface import scan forbids.
 */
function extractBearer(header: string | undefined): string | null {
  if (header === undefined || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

export function createUserRouter(deps: UserRouterDeps): Router {
  const router: Router = Router();
  const admin = requireRole(...ADMIN_ROLES);
  // Same budgets as legacy: the auth quartet gets the strict brute-force
  // bucket; gestion users writes carry no limiter (legacy parity).
  const authLimiter = rateLimit(60_000, 10);

  /* ---------------------------------- auth --------------------------------- */

  router.post(
    "/auth/login",
    authLimiter,
    validate(loginSchema),
    asyncHandler(async (req, res) => {
      res.json(buildSuccessEnvelope(await deps.login(req.body)));
    })
  );

  router.post(
    "/auth/register",
    authLimiter,
    validate(registerSchema),
    asyncHandler(async (req, res) => {
      // Duplicate answers 201 with `{ user: null }` (anti-enumeration).
      const user = await deps.register(req.body);
      res.status(201).json(buildSuccessEnvelope({ user }));
    })
  );

  router.post(
    "/auth/gestion-access",
    authLimiter,
    validate(gestionAccessSchema),
    asyncHandler(async (req, res) => {
      res.json(buildSuccessEnvelope(await deps.gestionAccess(req.body)));
    })
  );

  router.post(
    "/auth/gestion-login",
    authLimiter,
    validate(gestionLoginSchema),
    asyncHandler(async (req, res) => {
      res.json(buildSuccessEnvelope(await deps.gestionLogin(req.body)));
    })
  );

  router.post(
    "/auth/logout",
    asyncHandler(async (req, res) => {
      // Session verification lives in the handler (uniform 401 on unknown);
      // the edge only proves a bearer was presented, never session state.
      const token = extractBearer(req.headers.authorization);
      if (token === null) throw new AuthError("AUTHENTICATION_REQUIRED", "Autenticación requerida");
      await deps.logout({ token });
      res.json(buildSuccessEnvelope({ loggedOut: true }));
    })
  );

  /* ----------------------------- users (webshop) ---------------------------- */

  router.get(
    "/users",
    admin,
    validate(usersListQuerySchema, "query"),
    asyncHandler(async (req, res) => {
      // `validate` replaced req.query with the parsed DTO at runtime; Express
      // still types it as ParsedQs, hence the double assertion.
      res.json(buildSuccessEnvelope(await deps.listUsers(req.query as unknown as UsersListQuery)));
    })
  );

  router.post(
    "/users/:id/approve",
    admin,
    validate(userIdParamSchema, "params"),
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      res.json(buildSuccessEnvelope(await deps.approveUser(id, toAuditActor(req.identity))));
    })
  );

  router.put(
    "/users/:id/role",
    admin,
    validate(userIdParamSchema, "params"),
    validate(userRoleBodySchema),
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      res.json(buildSuccessEnvelope(await deps.setUserRole(id, req.body.role, toAuditActor(req.identity))));
    })
  );

  router.post(
    "/users/:id/disable",
    admin,
    validate(userIdParamSchema, "params"),
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      res.json(buildSuccessEnvelope(await deps.disableUser(id, toAuditActor(req.identity))));
    })
  );

  /* ---------------------------- gestion-users ------------------------------- */

  router.get(
    "/gestion-users",
    admin,
    validate(gestionUsersListQuerySchema, "query"),
    asyncHandler(async (req, res) => {
      res.json(buildSuccessEnvelope(await deps.listGestionUsers(req.query as unknown as GestionUsersListQuery)));
    })
  );

  router.post(
    "/gestion-users",
    admin,
    validate(gestionUserCreateSchema),
    asyncHandler(async (req, res) => {
      // Duplicate username answers 201 with `{ user: null }`, same as register.
      const user = await deps.createGestionUser(req.body, toAuditActor(req.identity));
      res.status(201).json(buildSuccessEnvelope({ user }));
    })
  );

  router.put(
    "/gestion-users/:id/role",
    admin,
    validate(userIdParamSchema, "params"),
    validate(gestionUserRoleBodySchema),
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      res.json(buildSuccessEnvelope(await deps.setGestionUserRole(id, req.body.role, toAuditActor(req.identity))));
    })
  );

  router.post(
    "/gestion-users/:id/disable",
    admin,
    validate(userIdParamSchema, "params"),
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      res.json(buildSuccessEnvelope(await deps.setGestionUserActive(id, false, toAuditActor(req.identity))));
    })
  );

  router.post(
    "/gestion-users/:id/enable",
    admin,
    validate(userIdParamSchema, "params"),
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      res.json(buildSuccessEnvelope(await deps.setGestionUserActive(id, true, toAuditActor(req.identity))));
    })
  );

  router.post(
    "/gestion-users/:id/password",
    admin,
    validate(userIdParamSchema, "params"),
    validate(gestionUserPasswordBodySchema),
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      await deps.resetGestionUserPassword(id, req.body.password, toAuditActor(req.identity));
      res.json(buildSuccessEnvelope({ passwordReset: true }));
    })
  );

  return router;
}
