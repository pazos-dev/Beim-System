import { z } from "zod";

export const CLIENTE_WRITE_ROLE_VALUES = [
  "vendedor",
  "administrador",
  "administrador_principal"
] as const;

export type ClienteWriteRole = (typeof CLIENTE_WRITE_ROLE_VALUES)[number];

export const CLIENTE_WRITE_ROLES: ReadonlySet<string> = new Set(CLIENTE_WRITE_ROLE_VALUES);

export const CLIENTE_HARD_REMOVE_ROLE_VALUES = ["administrador", "administrador_principal"] as const;

export type ClienteHardRemoveRole = (typeof CLIENTE_HARD_REMOVE_ROLE_VALUES)[number];

export const CLIENTE_HARD_REMOVE_ROLES: ReadonlySet<string> = new Set(
  CLIENTE_HARD_REMOVE_ROLE_VALUES
);

export const createClienteInputSchema = z.object({
  displayName: z.string().min(1).max(120),
  document: z.string().trim().min(1).max(40).optional(),
  phone: z.string().min(1).max(40).optional(),
  email: z.email().optional()
});

export type CreateClienteInput = z.infer<typeof createClienteInputSchema>;

export interface ClienteContact {
  document?: string;
  displayName: string;
  email?: string;
  phone?: string;
}

export type DuplicateContactField = "email" | "phone";

export function findDuplicateContact(
  clients: ReadonlyArray<ClienteContact>,
  input: { email?: string; phone?: string }
): DuplicateContactField | undefined {
  if (input.email !== undefined) {
    const wanted = input.email.toLowerCase();
    for (const client of clients) {
      if (client.email !== undefined && client.email.toLowerCase() === wanted) return "email";
    }
  }
  if (input.phone !== undefined) {
    for (const client of clients) {
      if (client.phone !== undefined && client.phone === input.phone) return "phone";
    }
  }
  return undefined;
}

export function clienteMatchesQuery(client: ClienteContact, query: string): boolean {
  const wanted = query.trim().toLowerCase();
  if (wanted === "") return true;
  const haystacks = [client.displayName, client.document ?? ""];
  return haystacks.some((haystack) => haystack.toLowerCase().includes(wanted));
}
