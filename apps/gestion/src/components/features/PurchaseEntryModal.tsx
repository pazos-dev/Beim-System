"use client";

import { useState, type FormEvent } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { useUiStore } from "../../lib/ui-store";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";
import {
  EMPTY_PURCHASE_ENTRY_VALUES,
  PurchaseEntryFields,
  validatePurchaseEntry,
  type PurchaseEntryFieldName,
  type PurchaseEntryValues
} from "./PurchaseEntryFields";

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
  const [values, setValues] = useState<PurchaseEntryValues>(EMPTY_PURCHASE_ENTRY_VALUES);
  const [formError, setFormError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function handleChange(field: PurchaseEntryFieldName, value: string): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function close(): void {
    setValues(EMPTY_PURCHASE_ENTRY_VALUES);
    setFormError(null);
    setServerError(null);
    setOpen(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = validatePurchaseEntry(values);
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
        <PurchaseEntryFields
          formError={formError}
          onChange={handleChange}
          pending={pending}
          serverError={serverError}
          submitLabel={COPY.submit}
          values={values}
        />
      </form>
    </Modal>
  );
}
