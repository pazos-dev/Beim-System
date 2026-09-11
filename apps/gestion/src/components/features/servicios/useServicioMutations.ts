"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  CreateServicioInput,
  UpdateServicioInput
} from "../../../lib/domain/services/servicio";
import { servicioRepository, type Servicio } from "../../../lib/api/servicio-repository";

export interface UpdateServicioVariables {
  readonly id: string;
  readonly changes: CreateServicioInput | UpdateServicioInput;
  readonly expectedVersion: number;
}

export interface DeactivateServicioVariables {
  readonly id: string;
  readonly expectedVersion: number;
}

function unwrapServicio(envelope: Awaited<ReturnType<typeof servicioRepository.create>>): Servicio {
  if (!envelope.ok) {
    throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Error desconocido");
  }
  if (envelope.data === undefined) {
    throw new Error("Respuesta vacía del servidor");
  }
  return envelope.data;
}

const SERVICIOS_QUERY_KEY = ["servicios"];

export function useCreateServicio() {
  const queryClient = useQueryClient();

  return useMutation<Servicio, Error, CreateServicioInput>({
    mutationFn: async (input) => {
      const envelope = await servicioRepository.create({
        active: true,
        displayName: input.displayName,
        price: input.price
      });
      return unwrapServicio(envelope);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SERVICIOS_QUERY_KEY });
    }
  });
}

export function useUpdateServicio() {
  const queryClient = useQueryClient();

  return useMutation<Servicio, Error, UpdateServicioVariables>({
    mutationFn: async (variables) => {
      const envelope = await servicioRepository.update(variables.id, {
        ...variables.changes,
        expectedVersion: variables.expectedVersion
      });
      return unwrapServicio(envelope);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SERVICIOS_QUERY_KEY });
    }
  });
}

export function useDeactivateServicio() {
  const queryClient = useQueryClient();

  return useMutation<Servicio, Error, DeactivateServicioVariables>({
    mutationFn: async (variables) => {
      const envelope = await servicioRepository.update(variables.id, {
        active: false,
        expectedVersion: variables.expectedVersion
      });
      return unwrapServicio(envelope);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SERVICIOS_QUERY_KEY });
    }
  });
}
