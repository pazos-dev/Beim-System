"use client";

import type { CreateClienteInput } from "../../../lib/domain/clients/cliente";
import { useGestionMutation } from "../../useGestionMutation";

export function useCreateCliente() {
  return useGestionMutation<unknown, CreateClienteInput>({
    buildBody: (variables) => ({ ...variables }),
    endpoint: "/api/gestion/clientes",
    invalidateKeys: [["clientes"]],
    method: "POST"
  });
}
