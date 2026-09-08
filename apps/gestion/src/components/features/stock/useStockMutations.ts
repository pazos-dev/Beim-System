"use client";

import type { OutflowInput, PurchaseInput, TransferInput } from "../../../lib/domain/inventory/inventory";
import { useGestionMutation } from "../../useGestionMutation";

export function useRegisterStockOutflow() {
  return useGestionMutation<unknown, OutflowInput>({
    buildBody: (variables) => ({ ...variables }),
    endpoint: "/api/gestion/stock/movimientos",
    invalidateKeys: [["stock"]],
    method: "POST"
  });
}

export function useTransferStock() {
  return useGestionMutation<unknown, TransferInput>({
    buildBody: (variables) => ({ ...variables }),
    endpoint: "/api/gestion/stock/transferencias",
    invalidateKeys: [["stock"]],
    method: "POST"
  });
}

export function useRegisterPurchase() {
  return useGestionMutation<unknown, PurchaseInput>({
    buildBody: (variables) => ({ ...variables }),
    endpoint: "/api/gestion/compras",
    invalidateKeys: [["stock"]],
    method: "POST"
  });
}
