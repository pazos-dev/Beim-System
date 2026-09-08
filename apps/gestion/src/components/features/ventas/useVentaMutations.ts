"use client";

import { useGestionMutation } from "../../useGestionMutation";

export interface VentaItemInput {
  readonly productoId: string;
  readonly cantidad: number;
}

export interface VentaPagoInput {
  readonly metodo: string;
  readonly monto: number;
}

export interface CreateVentaVariables {
  readonly items: ReadonlyArray<VentaItemInput>;
  readonly numero?: string;
  readonly ordenId?: string;
  readonly pagos: ReadonlyArray<VentaPagoInput>;
}

export interface AnularVentaVariables {
  readonly ventaId: string;
  readonly motivo: string;
}

export function useCreateVenta() {
  return useGestionMutation<unknown, CreateVentaVariables>({
    buildBody: (variables) => ({ ...variables }),
    endpoint: "/api/gestion/ventas",
    invalidateKeys: [["ventas"]],
    method: "POST"
  });
}

export function useAnularVenta() {
  return useGestionMutation<unknown, AnularVentaVariables>({
    buildBody: (variables) => ({ motivo: variables.motivo }),
    endpoint: (variables) => `/api/gestion/ventas/${variables.ventaId}`,
    invalidateKeys: [["ventas"]],
    method: "PATCH"
  });
}
