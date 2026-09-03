/**
 * Client validation and normalization helpers — pure functions for
 * validating client names, resolving default clients, normalizing documents,
 * and applying missing-field defaults. Ported from legacy `Cliente Mostrador`
 * defaulting and document handling in pagina-web/server.js.
 */

import { DomainError, ErrorCodes } from '../domain-error'

/** Default client name used when a sale has no explicit client. */
export const DEFAULT_CLIENT_NAME = 'Cliente Mostrador'

/**
 * Rejects an empty or whitespace-only client name with
 * `CLIENT_NAME_REQUIRED`. Surrounding whitespace is trimmed before checking.
 */
export function validateClientName(name: string): void {
  if (!String(name ?? '').trim()) {
    throw new DomainError(
      ErrorCodes.CLIENT_NAME_REQUIRED,
      'El nombre del cliente es obligatorio.',
    )
  }
}

/** Shape accepted by `resolveDefaultClient`. */
export interface ClientNameProvider {
  name?: string
}

/**
 * Resolves the client name to use for a sale. Returns `"Cliente Mostrador"`
 * when no client (or client name) is provided, otherwise the explicit name
 * (trimmed).
 */
export function resolveDefaultClient(client: ClientNameProvider | null | undefined): string {
  const name = String(client?.name ?? '').trim()
  return name || DEFAULT_CLIENT_NAME
}

/**
 * Normalizes a document string: trims surrounding whitespace and defaults to
 * `"-"` when the result is empty.
 */
export function normalizeDocument(document?: string): string {
  const trimmed = String(document ?? '').trim()
  return trimmed || '-'
}

/** Minimal client shape before field defaults are applied. */
export interface ClientDefaultsInput {
  name: string
  document?: string
  phone?: string
  email?: string
}

/** Client shape with all optional fields defaulted. */
export interface ClientWithDefaults {
  name: string
  document: string
  phone: string
  email: string
}

/**
 * Returns a new client object where missing optional fields receive defaults:
 * `document` → `"-"`, `phone` → `"-"`, `email` → `""`. Provided values are
 * preserved. The input is never mutated.
 */
export function applyClientDefaults(client: ClientDefaultsInput): ClientWithDefaults {
  return {
    name: client.name,
    document: normalizeDocument(client.document),
    phone: String(client.phone ?? '').trim() || '-',
    email: String(client.email ?? '').trim(),
  }
}
