// HTTP implementation of the frozen `ClienteRepositoryPort` (minus `remove`)
// against `GET/POST /clients`, `GET/PUT /clients/:id` on the configured base
// URL. Transport goes through `api-fetch` (sole HTTP exit): the in-memory
// Bearer token rides automatically and a 401 runs session death before the
// mapped `AUTHENTICATION_REQUIRED` result surfaces.
//
// There is intentionally NO `remove`: the backend exposes no
// `DELETE /clients/:id`, and the frozen port's `remove` means hard-delete
// (contract: `getById` fails afterwards; use-cases gate it to admin-only with
// audit), so removal-as-deactivation via `PUT /clients/:id {active:false}`
// would violate the contract — the row would stay readable. `remove` returns
// once the backend offers a real DELETE route. The `actor` parameter is
// signature-only: authorization travels in the Bearer header, not in the
// body. It is kept (and ignored) so the frozen port file stays untouched.
// Version conflicts surface as `CONFLICT`. The adapter is stateless: a 422
// never touches any cache because there is no cache here — cache non-mutation
// is owned by the PR3 hooks.

import { z } from "zod";

import { clienteSchema, ERROR_CODE_VALUES, type Cliente, type GestionError } from "../../server/data/schemas";
import type { ClienteRepositoryPort } from "../../server/clientes/cliente-port";
import type { PortActor } from "../../server/shared/actor";
import { createGestionError, ERROR_CODES, type ErrorCode } from "../../server/shared/errors";
import { err, ok, type Result } from "../../server/shared/result";
import { ApiError, apiFetch, type ApiFetchOptions } from "./api-fetch";

export const CLIENTE_LIST_LIMIT_MAX = 100;

export interface ClienteListParams {
  readonly active?: boolean;
  readonly limit?: number;
  readonly page?: number;
  readonly search?: string;
}

export interface HttpClienteRepositoryOptions {
  readonly fetchImpl?: ApiFetchOptions["fetchImpl"];
}

const clienteListPageSchema = z.object({
  items: z.array(clienteSchema),
  limit: z.number().int().positive(),
  page: z.number().int().positive(),
  total: z.number().int().nonnegative()
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODE_VALUES as readonly string[]).includes(value);
}

function clampLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) return undefined;
  return limit > CLIENTE_LIST_LIMIT_MAX ? CLIENTE_LIST_LIMIT_MAX : limit;
}

function buildListQuery(params: ClienteListParams | undefined): string {
  const search = new URLSearchParams();
  const limit = clampLimit(params?.limit);
  if (params?.search !== undefined && params.search !== "") search.set("search", params.search);
  if (params?.active !== undefined) search.set("active", String(params.active));
  if (params?.page !== undefined) search.set("page", String(params.page));
  if (limit !== undefined) search.set("limit", String(limit));
  const query = search.toString();
  return query === "" ? "" : `?${query}`;
}

function statusToErrorCode(status: number | undefined): ErrorCode {
  switch (status) {
    case 400:
    case 422:
      return ERROR_CODES.VALIDATION_ERROR;
    case 401:
      return ERROR_CODES.AUTHENTICATION_REQUIRED;
    case 403:
      return ERROR_CODES.FORBIDDEN;
    case 404:
      return ERROR_CODES.NOT_FOUND_OR_FORBIDDEN;
    case 409:
      return ERROR_CODES.CONFLICT;
    case 503:
      return ERROR_CODES.DEPENDENCY_UNAVAILABLE;
    default:
      return ERROR_CODES.STORAGE_ERROR;
  }
}

// Backend envelope codes (`VALIDATION_ERROR`, `FORBIDDEN`, …) win verbatim;
// otherwise the HTTP status decides. Client-side parse failures are typed as
// `VALIDATION_ERROR` (distinct message), transport failures as
// `DEPENDENCY_UNAVAILABLE`.
function toGestionError(error: unknown): GestionError {
  if (error instanceof ApiError) {
    if (error.kind === "network") {
      return createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE, undefined, error.message);
    }
    if (isErrorCode(error.code)) {
      return createGestionError(
        error.code,
        isRecord(error.details) ? (error.details as GestionError["details"]) : undefined,
        error.message
      );
    }
    if (error.kind === "parse") {
      return createGestionError(ERROR_CODES.VALIDATION_ERROR, undefined, error.message);
    }
    return createGestionError(statusToErrorCode(error.status), undefined, error.message);
  }
  if (error instanceof Error) return createGestionError(ERROR_CODES.STORAGE_ERROR, undefined, error.message);
  return createGestionError(ERROR_CODES.STORAGE_ERROR);
}

function parseCliente(data: unknown): Result<Cliente, GestionError> {
  const parsed = clienteSchema.safeParse(data);
  if (!parsed.success) {
    return err(
      createGestionError(
        ERROR_CODES.VALIDATION_ERROR,
        { issues: parsed.error.issues.map((issue) => issue.path.join(".")) },
        "The cliente payload failed validation."
      )
    );
  }
  return ok(parsed.data);
}

export class HttpClienteRepository implements Omit<ClienteRepositoryPort, "remove"> {
  private readonly fetchImpl: ApiFetchOptions["fetchImpl"];

  public constructor(options?: HttpClienteRepositoryOptions) {
    this.fetchImpl = options?.fetchImpl;
  }

  private requestOptions(method: string, body?: unknown): {
    readonly body?: unknown;
    readonly fetchImpl?: ApiFetchOptions["fetchImpl"];
    readonly method: string;
  } {
    return {
      ...(body === undefined ? {} : { body }),
      ...(this.fetchImpl === undefined ? {} : { fetchImpl: this.fetchImpl }),
      method
    };
  }

  // Extra optional params are assignable to the frozen `list(actor)` signature;
  // callers through the port type simply omit them (server defaults apply).
  public async list(
    _actor: PortActor,
    params?: ClienteListParams
  ): Promise<Result<Cliente[], GestionError>> {
    let data: unknown;
    try {
      data = await apiFetch<unknown>(`/clients${buildListQuery(params)}`, this.requestOptions("GET"));
    } catch (error) {
      return err(toGestionError(error));
    }
    const parsed = clienteListPageSchema.safeParse(data);
    if (!parsed.success) {
      return err(
        createGestionError(
          ERROR_CODES.VALIDATION_ERROR,
          { issues: parsed.error.issues.map((issue) => issue.path.join(".")) },
          "The cliente list payload failed validation."
        )
      );
    }
    return ok(parsed.data.items);
  }

  public async getById(_actor: PortActor, id: string): Promise<Result<Cliente, GestionError>> {
    let data: unknown;
    try {
      data = await apiFetch<unknown>(
        `/clients/${encodeURIComponent(id)}`,
        this.requestOptions("GET")
      );
    } catch (error) {
      return err(toGestionError(error));
    }
    return parseCliente(data);
  }

  public async create(_actor: PortActor, input: unknown): Promise<Result<Cliente, GestionError>> {
    let data: unknown;
    try {
      data = await apiFetch<unknown>("/clients", this.requestOptions("POST", input));
    } catch (error) {
      return err(toGestionError(error));
    }
    return parseCliente(data);
  }

  public async update(
    _actor: PortActor,
    id: string,
    patch: unknown,
    expectedVersion: number
  ): Promise<Result<Cliente, GestionError>> {
    const body = { ...(isRecord(patch) ? patch : {}), version: expectedVersion };
    let data: unknown;
    try {
      data = await apiFetch<unknown>(
        `/clients/${encodeURIComponent(id)}`,
        this.requestOptions("PUT", body)
      );
    } catch (error) {
      return err(toGestionError(error));
    }
    return parseCliente(data);
  }
}
