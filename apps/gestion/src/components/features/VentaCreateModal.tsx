"use client";

import { useState, type FormEvent } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { useUiStore } from "../../lib/ui-store";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";

const COPY = {
  cantidadError: "Ingresá una cantidad válida mayor a cero.",
  cantidadLabel: "Cantidad",
  catalogNote: "El precio se toma del catálogo y no se puede editar.",
  error: "No se pudo crear la venta. Reintentá.",
  metodoLabel: "Método de pago",
  montoError: "Ingresá un monto válido mayor o igual a cero.",
  montoLabel: "Monto del pago",
  numeroLabel: "Número (opcional)",
  ordenLabel: "Orden (opcional)",
  productoError: "Ingresá el producto.",
  productoLabel: "Producto",
  submit: "Crear venta",
  success: "Venta creada correctamente.",
  title: "Nueva venta"
} as const;

type MetodoPago = "efectivo" | "tarjeta" | "transferencia" | "mixto";

export function VentaCreateModal() {
  const open = useUiStore((state) => state.ventaCreateModalOpen);
  const setOpen = useUiStore((state) => state.setVentaCreateModalOpen);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [numero, setNumero] = useState("");
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const [monto, setMonto] = useState("");
  const [ordenId, setOrdenId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function close(): void {
    setNumero("");
    setProductoId("");
    setCantidad("");
    setMetodo("efectivo");
    setMonto("");
    setOrdenId("");
    setFormError(null);
    setServerError(null);
    setOpen(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (productoId.trim() === "") {
      setFormError(COPY.productoError);
      return;
    }
    const cantidadParsed = Number(cantidad);
    if (!Number.isInteger(cantidadParsed) || cantidadParsed <= 0) {
      setFormError(COPY.cantidadError);
      return;
    }
    const montoParsed = Number(monto);
    if (monto.trim() === "" || Number.isNaN(montoParsed) || montoParsed < 0) {
      setFormError(COPY.montoError);
      return;
    }
    setFormError(null);
    setServerError(null);
    setPending(true);
    try {
      const response = await fetch("/api/gestion/ventas", {
        body: JSON.stringify({
          items: [{ cantidad: cantidadParsed, productoId: productoId.trim() }],
          ...(numero.trim() === "" ? {} : { numero: numero.trim() }),
          ...(ordenId.trim() === "" ? {} : { ordenId: ordenId.trim() }),
          pagos: [{ metodo, monto: montoParsed }]
        }),
        headers: {
          "content-type": "application/json",
          "x-idempotency-key": crypto.randomUUID()
        },
        method: "POST"
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || typeof payload !== "object" || payload === null || (payload as { ok: unknown }).ok !== true) {
        setServerError(COPY.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["ventas"] });
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
        <p className="text-sm leading-6 text-ink-muted">{COPY.catalogNote}</p>
        <Input
          label={COPY.numeroLabel}
          onChange={(event) => setNumero(event.target.value)}
          placeholder="V-0001 (opcional)"
          value={numero}
        />
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
          {COPY.metodoLabel}
          <select
            aria-label={COPY.metodoLabel}
            className="min-h-10 rounded-md border border-line bg-surface px-3 py-2 text-ink"
            onChange={(event) => setMetodo(event.target.value as MetodoPago)}
            value={metodo}
          >
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="transferencia">Transferencia</option>
            <option value="mixto">Mixto</option>
          </select>
        </label>
        <Input
          label={COPY.montoLabel}
          min={0}
          onChange={(event) => setMonto(event.target.value)}
          placeholder="Monto total"
          type="number"
          value={monto}
        />
        <Input
          label={COPY.ordenLabel}
          onChange={(event) => setOrdenId(event.target.value)}
          placeholder="ID de la orden (opcional)"
          value={ordenId}
        />
        {formError ? <p role="alert">{formError}</p> : null}
        {serverError ? <p role="alert">{serverError}</p> : null}
        <div className="flex justify-end">
          <Button disabled={pending} type="submit">
            {pending ? "Creando…" : COPY.submit}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
