"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { clienteRepository } from "../../../lib/api/cliente-repository";
import type { Cliente } from "../../../lib/api/cliente-repository";
import type { CreateClienteInput } from "../../../lib/domain/clients/cliente";

export function useCreateCliente() {
  const queryClient = useQueryClient();

  return useMutation<Cliente, Error, CreateClienteInput>({
    mutationFn: async (input) => {
      const envelope = await clienteRepository.create({
        email: input.email,
        name: input.displayName,
        phone: input.phone,
      });

      if (!envelope.ok) {
        throw new Error(envelope.error?.message ?? envelope.error?.code ?? "No se pudo crear el cliente.");
      }

      if (envelope.data === undefined) {
        throw new Error("No se pudo crear el cliente.");
      }

      return envelope.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clientes"] });
    },
  });
}

interface UpdateClienteVariables {
  readonly id: string;
  readonly displayName?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly active?: boolean;
}

export function useUpdateCliente() {
  const queryClient = useQueryClient();

  return useMutation<Cliente, Error, UpdateClienteVariables>({
    mutationFn: async ({ id, ...input }) => {
      const envelope = await clienteRepository.update(id, {
        active: input.active,
        email: input.email,
        name: input.displayName,
        phone: input.phone,
      });

      if (!envelope.ok) {
        throw new Error(envelope.error?.message ?? envelope.error?.code ?? "No se pudo actualizar el cliente.");
      }

      if (envelope.data === undefined) {
        throw new Error("No se pudo actualizar el cliente.");
      }

      return envelope.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clientes"] });
    },
  });
}
