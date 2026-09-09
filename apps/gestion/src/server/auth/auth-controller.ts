// Thin auth controller: structural zod parse plus GestionError → HTTP
// mapping. Owns the login cookie-value passthrough (so routes can
// Set-Cookie without business logic); carries no business rules —
// validation and auth decisions stay in `AuthUseCases`.
//
// Brief-path mapping: the slice brief names this unit
// `controllers/auth-*.ts`; it lives here as `auth-controller.ts` to
// mirror the flat `src/server/clientes/` precedent. Response bodies keep
// the frozen route envelopes (`{ok:true,data}` / `{ok:false,error}`).

import { z } from "zod";

import { createGestionError, ERROR_CODES } from "../../kernel";
import type { GestionError, Result } from "../../kernel";
import { getHttpStatus } from "../shared/errors";
import type { AuthUseCases } from "./auth-use-cases";

export type AuthResponseBody =
  | { readonly data: unknown; readonly ok: true }
  | { readonly error: GestionError; readonly ok: false };

export interface AuthControllerResponse {
  readonly status: number;
  readonly body: AuthResponseBody;
  readonly cookieValue?: string | undefined;
}

// Structural guard only: rejects non-object payloads with the same
// VALIDATION_ERROR the use-case would return, so frozen envelopes hold.
const objectPayloadSchema = z.record(z.string(), z.unknown());

function validationResponse(): AuthControllerResponse {
  const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);
  return { body: { error, ok: false }, status: getHttpStatus(error.code) };
}

function toResponse<T>(result: Result<T, GestionError>, cookieValue?: string): AuthControllerResponse {
  if (!result.ok) {
    return { body: { error: result.error, ok: false }, status: getHttpStatus(result.error.code) };
  }
  const response: AuthControllerResponse = { body: { data: result.value, ok: true }, status: 200 };
  return cookieValue === undefined ? response : { ...response, cookieValue };
}

export class AuthController {
  private readonly useCases: AuthUseCases;

  public constructor(useCases: AuthUseCases) {
    this.useCases = useCases;
  }

  public async login(input: unknown): Promise<AuthControllerResponse> {
    if (!objectPayloadSchema.safeParse(input).success) return validationResponse();
    const result = await this.useCases.login(input);
    // Cookie passthrough: the body keeps the frozen `{ok:true,data:actor}`
    // envelope; the raw cookie value travels alongside for Set-Cookie.
    if (!result.ok) return toResponse(result);
    return {
      body: { data: result.value.actor, ok: true },
      cookieValue: result.value.cookieValue,
      status: 200
    };
  }

  public async session(cookieValue: string | undefined): Promise<AuthControllerResponse> {
    return toResponse(await this.useCases.session(cookieValue));
  }

  public async authorize(
    cookieValue: string | undefined,
    input: unknown
  ): Promise<AuthControllerResponse> {
    if (!objectPayloadSchema.safeParse(input).success) return validationResponse();
    return toResponse(await this.useCases.authorize(cookieValue, input));
  }

  public async logout(cookieValue: string | undefined): Promise<AuthControllerResponse> {
    return toResponse(await this.useCases.logout(cookieValue));
  }
}
