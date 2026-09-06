import { z } from "zod";

import { clienteMatchesQuery } from "../../lib/domain/clients/cliente";
import type { Cliente, GestionError } from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../handlers/errors";
import { err, ok, type Result } from "../handlers/result";
import type { AuthActor } from "../handlers/auth";
import type { PortActor } from "../ports/actor";
import type { ClienteRepositoryPort } from "../ports/cliente";

export function toClienteActor(auth: AuthActor): PortActor {
  return {
    hasGlobalAccess: auth.role === "administrador" || auth.role === "administrador_principal",
    id: auth.id
  };
}

export const clienteListQuerySchema = z.object({
  q: z.string().max(120).optional(),
  active: z.enum(["true", "false", "all"]).default("true"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

export type ClienteListQuery = z.infer<typeof clienteListQuerySchema>;

export interface ClienteListItem {
  active: boolean;
  displayName: string;
  document?: string;
  email?: string;
  id: string;
  phone?: string;
  version: number;
}

export interface ClienteListResponse {
  items: ClienteListItem[];
  page: number;
  pageSize: number;
  totalItems: number;
}

function toListItem(cliente: Cliente): ClienteListItem {
  return {
    active: cliente.active,
    displayName: cliente.displayName,
    document: cliente.document,
    email: cliente.email,
    id: cliente.id,
    phone: cliente.phone,
    version: cliente.version
  };
}

export class ClienteUseCases {
  private readonly port: ClienteRepositoryPort;

  public constructor(port: ClienteRepositoryPort) {
    this.port = port;
  }

  public async list(
    actor: PortActor,
    query: ClienteListQuery
  ): Promise<Result<ClienteListResponse, GestionError>> {
    const listed = await this.port.list(actor);
    if (!listed.ok) return err(listed.error);
    const filtered = listed.value.filter((cliente) => {
      if (query.active === "true" && !cliente.active) return false;
      if (query.active === "false" && cliente.active) return false;
      if (query.q !== undefined && !clienteMatchesQuery(cliente, query.q)) return false;
      return true;
    });
    const totalItems = filtered.length;
    const start = (query.page - 1) * query.pageSize;
    const items = filtered.slice(start, start + query.pageSize).map(toListItem);
    return ok({ items, page: query.page, pageSize: query.pageSize, totalItems });
  }

  public async getById(actor: PortActor, id: string): Promise<Result<Cliente, GestionError>> {
    if (id.trim() === "") {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] }));
    }
    return this.port.getById(actor, id);
  }
}
