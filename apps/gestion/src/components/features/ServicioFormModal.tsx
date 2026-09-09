"use client";

import { useEffect, useState, type FormEvent } from "react";

import {
  createServicioInputSchema,
  updateServicioInputSchema,
  type CreateServicioInput,
  type UpdateServicioInput
} from "../../lib/domain/services/servicio";
import { useUiSliceStore } from "../../store/ui.slice";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";
import { useCreateServicio, useUpdateServicio } from "./servicios/useServicioMutations";

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

export function ServicioFormModal() {
  const createOpen = useUiSliceStore((state) => state.servicioCreateOpen);
  const setCreateOpen = useUiSliceStore((state) => state.setServicioCreateOpen);
  const editing = useUiSliceStore((state) => state.servicioEditing);
  const setEditing = useUiSliceStore((state) => state.setServicioEditing);
  const toast = useToast();
  const createServicio = useCreateServicio();
  const updateServicio = useUpdateServicio();
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
    const isEdit = mode === "edit" && editing !== null;
    const candidate = { displayName: displayName.trim(), price: Number(price) };
    if (isEdit) {
      const parsed = updateServicioInputSchema.safeParse(candidate);
      if (!parsed.success) {
        const fields = parsed.error.flatten().fieldErrors;
        setNameError(fields.displayName ? COPY.nameError : undefined);
        setPriceError(fields.price ? COPY.priceError : undefined);
        return;
      }
      await submitUpdate(editing.id, editing.version, parsed.data);
      return;
    }
    const parsed = createServicioInputSchema.safeParse(candidate);
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      setNameError(fields.displayName ? COPY.nameError : undefined);
      setPriceError(fields.price ? COPY.priceError : undefined);
      return;
    }
    await submitCreate(parsed.data);
  }

  async function submitCreate(data: CreateServicioInput): Promise<void> {
    setNameError(undefined);
    setPriceError(undefined);
    setServerError(null);
    setPending(true);
    try {
      await createServicio.mutateAsync(data);
      close();
      toast.success(COPY.createSuccess);
    } catch {
      setServerError(COPY.createError);
    } finally {
      setPending(false);
    }
  }

  async function submitUpdate(id: string, expectedVersion: number, changes: UpdateServicioInput): Promise<void> {
    setNameError(undefined);
    setPriceError(undefined);
    setServerError(null);
    setPending(true);
    try {
      await updateServicio.mutateAsync({ changes, expectedVersion, id });
      close();
      toast.success(COPY.editSuccess);
    } catch {
      setServerError(COPY.editError);
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
