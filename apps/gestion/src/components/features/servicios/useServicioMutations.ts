"use client";

import type {
  CreateServicioInput,
  UpdateServicioInput
} from "../../../lib/domain/services/servicio";
import { useGestionMutation } from "../../useGestionMutation";

export interface UpdateServicioVariables {
  readonly id: string;
  readonly changes: CreateServicioInput | UpdateServicioInput;
  readonly expectedVersion: number;
}

export interface DeactivateServicioVariables {
  readonly id: string;
  readonly expectedVersion: number;
}

export function useCreateServicio() {
  return useGestionMutation<unknown, CreateServicioInput>({
    buildBody: (variables) => ({ ...variables }),
    endpoint: "/api/gestion/servicios",
    invalidateKeys: [["servicios"]],
    method: "POST"
  });
}

export function useUpdateServicio() {
  return useGestionMutation<unknown, UpdateServicioVariables>({
    buildBody: (variables) => ({ ...variables.changes, expectedVersion: variables.expectedVersion }),
    endpoint: (variables) => `/api/gestion/servicios/${variables.id}`,
    invalidateKeys: [["servicios"]],
    method: "PATCH"
  });
}

export function useDeactivateServicio() {
  return useGestionMutation<unknown, DeactivateServicioVariables>({
    buildBody: (variables) => ({ active: false, expectedVersion: variables.expectedVersion }),
    endpoint: (variables) => `/api/gestion/servicios/${variables.id}`,
    invalidateKeys: [["servicios"]],
    method: "PATCH"
  });
}
