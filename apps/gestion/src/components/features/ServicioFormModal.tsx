"use client";

import { useEffect, useState, type FormEvent } from "react";

import { useQueryClient } from "@tanstack/react-query";

import {
  createServicioInputSchema,
  updateServicioInputSchema
} from "../../lib/domain/services/servicio";
import { useUiStore } from "../../lib/ui-store";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";

const COPY = {
  createError: "No se pudo crear el servicio. Reintentá.",
  createSubmit: "Crear servicio",
  createSuccess: "Servicio creado correctamente.",
  createTitle: "Nuevo servicio",
  editError: "No se pudo actualizar el servicio. Reintentá.",
  editSubmit: "Guardar cambios",
  editSuccess: "Servicio actualizado correctamente.",
  editTitle: "Editar servicio",
  nameError: "Ingresá el nombre del servicio.",
  nameLabel: "Nombre del servicio",
  namePlaceholder: "Nombre del servicio",
  priceError: "Ingresá un precio válido (0 o mayor).",
  priceLabel: "Precio",
  pricePlaceholder: "Precio"
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function ServicioFormModal() {
  const createOpen = useUiStore((state) => state.servicioCreateOpen);
  const setCreateOpen = useUiStore((state) => state.setServicioCreateOpen);
  const editing = useUiStore((state) => state.servicioEditing);
  const setEditing = useUiStore((state) => state.setServicioEditing);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [price, setPrice] = useState("");
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [priceError, setPriceError] = useState<string | undefined>(undefined);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const open = createOpen || editing !== null;
  const mode = editing !== null ? "edit" : "create";

  useEffect(() => {
    if (editing !== null) {
      setDisplayName(editing.displayName);
      setPrice(String(editing.price));
      setNameError(undefined);
      setPriceError(undefined);
      setServerError(null);
    }
  }, [editing]);

  function close(): void {
    setDisplayName("");
    setPrice("");
    setNameError(undefined);
    setPriceError(undefined);
    setServerError(null);
    setCreateOpen(false);
    setEditing(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed =
      mode === "edit"
        ? updateServicioInputSchema.safeParse({ displayName: displayName.trim(), price: Number(price) })
        : createServicioInputSchema.safeParse({ displayName: displayName.trim(), price: Number(price) });
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      setNameError(fields.displayName ? COPY.nameError : undefined);
      setPriceError(fields.price ? COPY.priceError : undefined);
      return;
    }
    setNameError(undefined);
    setPriceError(undefined);
    setServerError(null);
    setPending(true);
    try {
      const isEdit = mode === "edit" && editing !== null;
      const url = isEdit ? `/api/gestion/servicios/${editing.id}` : "/api/gestion/servicios";
      const body = isEdit
        ? { ...parsed.data, expectedVersion: editing.version }
        : parsed.data;
      const response = await fetch(url, {
        body: JSON.stringify(body),
        headers: {
          "content-type": "application/json",
          "x-idempotency-key": crypto.randomUUID()
        },
        method: isEdit ? "PATCH" : "POST"
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.ok !== true) {
        setServerError(isEdit ? COPY.editError : COPY.createError);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["servicios"] });
      close();
      toast.success(isEdit ? COPY.editSuccess : COPY.createSuccess);
    } catch {
      setServerError(mode === "edit" ? COPY.editError : COPY.createError);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      closeLabel="Cancelar"
      onClose={close}
      open={open}
      title={mode === "edit" ? COPY.editTitle : COPY.createTitle}
    >
      <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
        <Input
          error={nameError}
          label={COPY.nameLabel}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder={COPY.namePlaceholder}
          value={displayName}
        />
        <Input
          error={priceError}
          label={COPY.priceLabel}
          min={0}
          onChange={(event) => setPrice(event.target.value)}
          placeholder={COPY.pricePlaceholder}
          type="number"
          value={price}
        />
        {serverError ? <p role="alert">{serverError}</p> : null}
        <div className="flex justify-end">
          <Button disabled={pending} type="submit">
            {pending ? "Guardando…" : mode === "edit" ? COPY.editSubmit : COPY.createSubmit}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
