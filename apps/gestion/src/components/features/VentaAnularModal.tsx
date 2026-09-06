"use client";

import { useState, type FormEvent } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { useUiStore } from "../../lib/ui-store";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";

const COPY = {
  error: "No se pudo anular la venta. Reintentá.",
  motivoError: "Ingresá un motivo de 1 a 200 caracteres.",
  motivoLabel: "Motivo",
  submit: "Anular venta",
  success: "Venta anulada correctamente.",
  title: "Anular venta"
} as const;

export function VentaAnularModal() {
  const ventaId = useUiStore((state) => state.ventaAnularModalId);
  const setVentaId = useUiStore((state) => state.setVentaAnularModalId);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [motivo, setMotivo] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function close(): void {
    setMotivo("");
    setFormError(null);
    setServerError(null);
    setVentaId(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = motivo.trim();
    if (trimmed.length < 1 || trimmed.length > 200) {
      setFormError(COPY.motivoError);
      return;
    }
    if (ventaId === null) {
      setFormError(COPY.motivoError);
      return;
    }
    setFormError(null);
    setServerError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/gestion/ventas/${ventaId}`, {
        body: JSON.stringify({ motivo: trimmed }),
        headers: {
          "content-type": "application/json",
          "x-idempotency-key": crypto.randomUUID()
        },
        method: "PATCH"
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
    <Modal closeLabel="Cancelar" onClose={close} open={ventaId !== null} role="alertdialog" title={COPY.title}>
      <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
        <Input
          label={COPY.motivoLabel}
          onChange={(event) => setMotivo(event.target.value)}
          placeholder="Motivo de la anulación"
          value={motivo}
        />
        {formError ? <p role="alert">{formError}</p> : null}
        {serverError ? <p role="alert">{serverError}</p> : null}
        <div className="flex justify-end">
          <Button disabled={pending} type="submit">
            {pending ? "Anulando…" : COPY.submit}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
