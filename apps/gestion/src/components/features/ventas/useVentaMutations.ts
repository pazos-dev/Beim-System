"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ventaRepository, type Venta } from "../../../lib/api/venta-repository";

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

function unwrapVenta(envelope: Awaited<ReturnType<typeof ventaRepository.create>>): Venta {
  if (!envelope.ok) {
    throw new Error(envelope.error?.message ?? envelope.error?.code ?? "No se pudo crear la venta.");
  }
  if (envelope.data === undefined) {
    throw new Error("No se pudo crear la venta.");
  }
  return envelope.data;
}

const VENTAS_QUERY_KEY = ["ventas"];

export function useCreateVenta() {
  const queryClient = useQueryClient();

  return useMutation<Venta, Error, CreateVentaVariables>({
    mutationFn: async (variables) => {
      if (variables.items.length === 0) {
        throw new Error("La venta requiere al menos un producto.");
      }

      const envelope = await ventaRepository.create({
        clientId: "walk-in",
        clientName: "Walk-in",
        items: variables.items.map((item) => ({
          productId: item.productoId,
          quantity: item.cantidad,
        })),
        payments: variables.pagos.map((pago) => ({
          amount: pago.monto,
          method: pago.metodo,
        })),
        ...(variables.numero === undefined ? {} : { numero: variables.numero }),
        ...(variables.ordenId === undefined ? {} : { ordenId: variables.ordenId }),
      });

      return unwrapVenta(envelope);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: VENTAS_QUERY_KEY });
    },
  });
}

export function useAnularVenta() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, AnularVentaVariables>({
    mutationFn: async (variables) => {
      const envelope = await ventaRepository.annul(variables.ventaId);
      if (!envelope.ok) {
        throw new Error(envelope.error?.message ?? envelope.error?.code ?? "No se pudo anular la venta.");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: VENTAS_QUERY_KEY });
    },
  });
}
