"use client";

import { useState, type FormEvent } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { transferInputSchema } from "../../lib/domain/inventory/inventory";
import { useUiStore } from "../../lib/ui-store";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";

const COPY = {
  error: "No se pudo transferir el stock. Reintentá.",
  formError: "Revisá los datos: el origen y el destino deben diferir.",
  submit: "Transferir stock",
  success: "Transferencia registrada correctamente.",
  title: "Transferir stock"
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function StockTransferModal() {
  const open = useUiStore((state) => state.stockTransferModalOpen);
  const setOpen = useUiStore((state) => state.setStockTransferModalOpen);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [origen, setOrigen] = useState("principal");
  const [destino, setDestino] = useState("principal");
  const [formError, setFormError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function close(): void {
    setProductoId("");
    setCantidad("");
    setOrigen("principal");
    setDestino("principal");
    setFormError(null);
    setServerError(null);
    setOpen(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = transferInputSchema.safeParse({
      cantidad: Number(cantidad),
      destino,
      origen,
      productoId: productoId.trim()
    });
    if (!parsed.success) {
      setFormError(COPY.formError);
      return;
    }
    setFormError(null);
    setServerError(null);
    setPending(true);
    try {
      const response = await fetch("/api/gestion/stock/transferencias", {
        body: JSON.stringify(parsed.data),
        headers: {
          "content-type": "application/json",
          "x-idempotency-key": crypto.randomUUID()
        },
        method: "POST"
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.ok !== true) {
        setServerError(COPY.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["stock"] });
      close();
      toast.success(COPY.success);
    } catch {
      setServerError(COPY.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal closeLabel="Cancelar" onClose={close} open={open} title={COPY.title}>
      <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
        <Input
          label="Producto"
          onChange={(event) => setProductoId(event.target.value)}
          placeholder="ID del producto"
          value={productoId}
        />
        <Input
          label="Cantidad"
          min={1}
          onChange={(event) => setCantidad(event.target.value)}
          placeholder="Cantidad"
          type="number"
          value={cantidad}
        />
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Origen
          <select
            aria-label="Origen"
            className="min-h-10 rounded-md border border-line bg-surface px-3 py-2 text-ink"
            onChange={(event) => setOrigen(event.target.value)}
            value={origen}
          >
            <option value="principal">principal</option>
            <option value="taller">taller</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Destino
          <select
            aria-label="Destino"
            className="min-h-10 rounded-md border border-line bg-surface px-3 py-2 text-ink"
            onChange={(event) => setDestino(event.target.value)}
            value={destino}
          >
            <option value="principal">principal</option>
            <option value="taller">taller</option>
          </select>
        </label>
        {formError ? <p role="alert">{formError}</p> : null}
        {serverError ? <p role="alert">{serverError}</p> : null}
        <div className="flex justify-end">
          <Button disabled={pending} type="submit">
            {pending ? "Transfiriendo…" : COPY.submit}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
