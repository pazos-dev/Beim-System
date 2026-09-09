import type {
  GestionUserCreateInput,
  GestionUsersListQuery,
  UsersListQuery
} from "../interface/http/user/dtos.js";
import type { UserRouterDeps } from "../interface/http/user/router.js";
import { authService } from "../modules/webshop/services/auth.js";
import { gestionUsersService } from "../modules/gestion/services/gestion-users.js";
import { usersService } from "../modules/gestion/services/users.js";

/**
 * Cutover wiring, part A (change `clean-arch-interface`, F8a).
 *
 * Thin adapters for the user/auth handlers that only exist in the legacy
 * services: webshop login/register/gestion-access/gestion-login/logout plus
 * the webshop/console user admin actions. Every method delegates to the
 * injected legacy port — zero duplicated logic. The default port binds the
 * real legacy services; tests inject fakes.
 *
 * NOT mounted: the composition root keeps serving the legacy routers, so
 * `/openapi.json` stays byte-identical in this slice.
 */

/** Audit journal actor — same shape the legacy `toAuditActor` builds. */
export interface CutoverAuditActor {
  actorUserId: string | null;
  actorRole: string | null;
}

/** Legacy service surface the user router needs (ports, not concretions). */
export interface UserLegacyPort {
  auth: Pick<
    typeof authService,
    "login" | "register" | "gestionAccess" | "gestionLogin" | "logout"
  >;
  users: Pick<typeof usersService, "listUsers" | "approveUser" | "setUserRole" | "disableUser">;
  gestionUsers: Pick<
    typeof gestionUsersService,
    | "listGestionUsers"
    | "createGestionUser"
    | "setGestionUserRole"
    | "setGestionUserActive"
    | "resetGestionUserPassword"
  >;
}

/** Default port: the real legacy services (production binding). */
export const legacyUserPort: UserLegacyPort = {
  auth: authService,
  users: usersService,
  gestionUsers: gestionUsersService
};

/** Builds the user router deps by delegating every call to the legacy port. */
export function makeUserRouterDeps(port: UserLegacyPort = legacyUserPort): UserRouterDeps {
  return {
    login: (input) => port.auth.login(input),
    register: (input) => port.auth.register(input),
    gestionAccess: (input) => port.auth.gestionAccess(input),
    gestionLogin: (input) => port.auth.gestionLogin(input),
    logout: (input) => port.auth.logout(input),
    listUsers: (query: UsersListQuery) => port.users.listUsers(query),
    approveUser: (id: string, actor: CutoverAuditActor) => port.users.approveUser(id, actor),
    setUserRole: (id: string, role: string, actor: CutoverAuditActor) =>
      port.users.setUserRole(id, role, actor),
    disableUser: (id: string, actor: CutoverAuditActor) => port.users.disableUser(id, actor),
    listGestionUsers: (query: GestionUsersListQuery) => port.gestionUsers.listGestionUsers(query),
    createGestionUser: (input: GestionUserCreateInput, actor: CutoverAuditActor) =>
      port.gestionUsers.createGestionUser(input, actor),
    setGestionUserRole: (id: string, role: string, actor: CutoverAuditActor) =>
      port.gestionUsers.setGestionUserRole(id, role, actor),
    setGestionUserActive: (id: string, active: boolean, actor: CutoverAuditActor) =>
      port.gestionUsers.setGestionUserActive(id, active, actor),
    // The legacy service returns the public user; the contract carries the
    // outcome only, so the adapter drops it to void like the legacy route.
    resetGestionUserPassword: async (id: string, password: string, actor: CutoverAuditActor) => {
      await port.gestionUsers.resetGestionUserPassword(id, password, actor);
    }
  };
}
