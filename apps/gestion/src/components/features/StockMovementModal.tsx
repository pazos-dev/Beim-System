"use client";

import { useState, type FormEvent } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { outflowInputSchema } from "../../lib/domain/inventory/inventory";
import { useUiStore } from "../../lib/ui-store";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";

const COPY = {
  cantidadLabel: "Cantidad",
  cantidadError: "Ingresá una cantidad válida mayor a cero.",
  depositoLabel: "Depósito (opcional)",
  error: "No se pudo registrar el movimiento. Reintentá.",
  motivoLabel: "Motivo",
  productoLabel: "Producto",
  productoError: "Ingresá el producto.",
  submit: "Registrar movimiento",
  success: "Movimiento registrado correctamente.",
  title: "Registrar movimiento"
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function StockMovementModal() {
  const open = useUiStore((state) => state.stockMovementModalOpen);
  const setOpen = useUiStore((state) => state.setStockMovementModalOpen);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState<"venta" | "consumo">("venta");
  const [deposito, setDeposito] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function close(): void {
    setProductoId("");
    setCantidad("");
    setMotivo("venta");
    setDeposito("");
    setFormError(null);
    setServerError(null);
    setOpen(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = outflowInputSchema.safeParse({
      ...(deposito.trim() === "" ? {} : { deposito: deposito.trim() }),
      cantidad: Number(cantidad),
      motivo,
      productoId: productoId.trim()
    });
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => String(issue.path[0] ?? ""));
      setFormError(fields.includes("productoId") ? COPY.productoError : COPY.cantidadError);
      return;
    }
    setFormError(null);
    setServerError(null);
    setPending(true);
    try {
      const response = await fetch("/api/gestion/stock/movimientos", {
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
          label={COPY.productoLabel}
          onChange={(event) => setProductoId(event.target.value)}
          placeholder="ID del producto"
          value={productoId}
        />
        <Input
          label={COPY.cantidadLabel}
          min={1}
          onChange={(event) => setCantidad(event.target.value)}
          placeholder="Cantidad"
          type="number"
          value={cantidad}
        />
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          {COPY.motivoLabel}
          <select
            aria-label={COPY.motivoLabel}
            className="min-h-10 rounded-md border border-line bg-surface px-3 py-2 text-ink"
            onChange={(event) => setMotivo(event.target.value === "consumo" ? "consumo" : "venta")}
            value={motivo}
          >
            <option value="venta">Venta</option>
            <option value="consumo">Consumo</option>
          </select>
        </label>
        <Input
          label={COPY.depositoLabel}
          onChange={(event) => setDeposito(event.target.value)}
          placeholder="principal o taller (opcional)"
          value={deposito}
        />
        {formError ? <p role="alert">{formError}</p> : null}
        {serverError ? <p role="alert">{serverError}</p> : null}
        <div className="flex justify-end">
          <Button disabled={pending} type="submit">
            {pending ? "Registrando…" : COPY.submit}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
