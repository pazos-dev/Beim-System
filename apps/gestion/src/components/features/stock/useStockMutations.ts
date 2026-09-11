"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";

import type {
  OutflowInput,
  PurchaseInput,
  TransferInput,
} from "../../../lib/domain/inventory/inventory";
import type { ApiEnvelope } from "../../../lib/api/http-client";
import {
  stockRepository,
  type StockMovement,
} from "../../../lib/api/stock-repository";

function toErrorMessage(envelope: ApiEnvelope<unknown>): string {
  if (envelope.ok) return "UNKNOWN_ERROR";
  return envelope.error?.message ?? envelope.error?.code ?? "UNKNOWN_ERROR";
}

function unwrapMovement(envelope: ApiEnvelope<StockMovement>): StockMovement {
  if (!envelope.ok) throw new Error(toErrorMessage(envelope));
  if (envelope.data === undefined) throw new Error("UNKNOWN_ERROR");
  return envelope.data;
}

const STOCK_QUERY_KEY = ["stock"];

export function useRegisterStockOutflow(): UseMutationResult<StockMovement, Error, OutflowInput> {
  const queryClient = useQueryClient();

  return useMutation<StockMovement, Error, OutflowInput>({
    mutationFn: async (input) => {
      const envelope = await stockRepository.create({
        detail: input.motivo,
        movementType: "salida",
        productId: input.productoId,
        quantity: input.cantidad,
      });
      return unwrapMovement(envelope);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: STOCK_QUERY_KEY });
    },
  });
}

export function useRegisterPurchase(): UseMutationResult<StockMovement, Error, PurchaseInput> {
  const queryClient = useQueryClient();

  return useMutation<StockMovement, Error, PurchaseInput>({
    mutationFn: async (input) => {
      const detail = [input.proveedor, input.comprobante].filter(Boolean).join(" - ");
      const envelope = await stockRepository.create({
        detail: detail === "" ? undefined : detail,
        movementType: "entrada",
        productId: input.productoId,
        quantity: input.cantidad,
      });
      return unwrapMovement(envelope);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: STOCK_QUERY_KEY });
    },
  });
}

export function useTransferStock(): UseMutationResult<
  readonly [StockMovement, StockMovement],
  Error,
  TransferInput
> {
  const queryClient = useQueryClient();

  return useMutation<readonly [StockMovement, StockMovement], Error, TransferInput>({
    mutationFn: async (input) => {
      const leaving = await stockRepository.create({
        detail: `Transferencia desde ${input.origen}`,
        movementType: "salida",
        productId: input.productoId,
        quantity: input.cantidad,
      });

      const arriving = await stockRepository.create({
        detail: `Transferencia hacia ${input.destino}`,
        movementType: "entrada",
        productId: input.productoId,
        quantity: input.cantidad,
      });

      return [unwrapMovement(leaving), unwrapMovement(arriving)] as const;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: STOCK_QUERY_KEY });
    },
  });
}
