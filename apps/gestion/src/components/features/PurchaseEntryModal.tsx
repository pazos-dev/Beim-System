"use client";

import { useState, type FormEvent } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { purchaseInputSchema } from "../../lib/domain/inventory/inventory";
import { useUiStore } from "../../lib/ui-store";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";

const COPY = {
  error: "No se pudo registrar la compra. Reintentá.",
  formError: "Revisá los datos de la compra.",
  submit: "Registrar compra",
  success: "Compra registrada correctamente.",
  title: "Registrar compra"
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function PurchaseEntryModal() {
  const open = useUiStore((state) => state.purchaseModalOpen);
  const setOpen = useUiStore((state) => state.setPurchaseModalOpen);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [costoUnitario, setCostoUnitario] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [deposito, setDeposito] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function close(): void {
    setProductoId("");
    setCantidad("");
    setCostoUnitario("");
    setProveedor("");
    setDeposito("");
    setFormError(null);
    setServerError(null);
    setOpen(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = purchaseInputSchema.safeParse({
      ...(deposito.trim() === "" ? {} : { deposito: deposito.trim() }),
      cantidad: Number(cantidad),
      costoUnitario: Number(costoUnitario),
      productoId: productoId.trim(),
      proveedor: proveedor.trim()
    });
    if (!parsed.success) {
      setFormError(COPY.formError);
      return;
    }
    setFormError(null);
    setServerError(null);
    setPending(true);
    try {
      const response = await fetch("/api/gestion/compras", {
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
        <Input
          label="Costo unitario"
          min={0}
          onChange={(event) => setCostoUnitario(event.target.value)}
          placeholder="Costo unitario"
          type="number"
          value={costoUnitario}
        />
        <Input
          label="Proveedor"
          onChange={(event) => setProveedor(event.target.value)}
          placeholder="Proveedor"
          value={proveedor}
        />
        <Input
          label="Depósito (opcional)"
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
