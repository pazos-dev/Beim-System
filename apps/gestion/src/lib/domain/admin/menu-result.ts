// Domain-local outcome types for menu administration rules.
//
// The domain layer must not import server infrastructure (DIP: dependencies
// point inward, toward domain). These shapes are structural twins of the
// server Result/GestionError so use-cases consume them without adaptation.
// Only the error codes the pure rules can produce are listed here.
// Message strings mirror the server catalogue so HTTP adapters serializing
// domain errors keep byte-identical responses.

export const MENU_ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  CONFLICT: "CONFLICT",
  NOT_FOUND_OR_FORBIDDEN: "NOT_FOUND_OR_FORBIDDEN",
  FORBIDDEN: "FORBIDDEN",
  STORAGE_ERROR: "STORAGE_ERROR"
} as const;

export type MenuErrorCode = (typeof MENU_ERROR_CODES)[keyof typeof MENU_ERROR_CODES];

export interface MenuErrorDetails {
  readonly [key: string]: unknown;
  readonly fields?: string[];
}

export interface MenuError {
  readonly code: MenuErrorCode;
  readonly message: string;
  readonly details?: MenuErrorDetails;
}

export type MenuResult<T, E extends MenuError = MenuError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): MenuResult<T> {
  return { ok: true, value };
}

export function err<E extends MenuError>(error: E): MenuResult<never> {
  return { ok: false, error };
}

const MESSAGE_BY_CODE: Readonly<Record<MenuErrorCode, string>> = {
  VALIDATION_ERROR: "Payload inválido.",
  CONFLICT: "La operación entra en conflicto con el estado vigente.",
  NOT_FOUND_OR_FORBIDDEN: "Recurso no disponible.",
  FORBIDDEN: "Acceso denegado.",
  STORAGE_ERROR: "No se pudo acceder al almacenamiento."
};

export function createMenuError(
  code: MenuErrorCode,
  details?: MenuErrorDetails,
  message: string = MESSAGE_BY_CODE[code]
): MenuError {
  return details === undefined ? { code, message } : { code, details, message };
}

// Client-safe actor policy: no platform or server runtime imports, so route
// handlers and Client Components can share it without dragging server modules
// into the browser bundle. Mirrors lib/domain/orders/order-roles.ts.
export type MenuRole = "vendedor" | "tecnico" | "caja" | "administrador" | "administrador_principal";

export interface MenuActor {
  readonly role: MenuRole;
}

export const MENU_ADMIN_ROLES: ReadonlySet<MenuRole> = new Set<MenuRole>([
  "administrador",
  "administrador_principal"
]);

// Storage port (DIP): the domain owns this abstraction and infrastructure
// satisfies it structurally — JsonStore.read() errors carry a `reason`
// string, so JsonStore is assignable without an adapter. A missing document
// is signalled with reason "NOT_FOUND", the same string JsonStore uses.
export const MENU_STORE_NOT_FOUND_REASON = "NOT_FOUND" as const;

export interface MenuStoreReadError {
  readonly reason: string;
}

export type MenuStoreReadResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: MenuStoreReadError };

export interface MenuStorePort<T> {
  read(): Promise<MenuStoreReadResult<T>>;
}
