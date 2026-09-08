"use client";

import { useUiStore } from "../../lib/ui-store";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import { useDeactivateServicio } from "./servicios/useServicioMutations";

const COPY = {
  cancel: "Cancelar",
  confirm: "Desactivar",
  error: "No se pudo desactivar el servicio. Reintentá.",
  success: "Servicio desactivado correctamente.",
  title: "Desactivar servicio"
} as const;

function describeTarget(displayName: string): string {
  return `¿Desactivar "${displayName}"? Saldrá de la lista principal pero seguirá visible por ID.`;
}

export function ServicioDeactivateModal() {
  const target = useUiStore((state) => state.servicioDeactivating);
  const setTarget = useUiStore((state) => state.setServicioDeactivating);
  const toast = useToast();
  const deactivateServicio = useDeactivateServicio();

  function close(): void {
    setTarget(null);
  }

  async function handleConfirm(): Promise<void> {
    if (target === null) return;
    try {
      await deactivateServicio.mutateAsync({ expectedVersion: target.version, id: target.id });
      close();
      toast.success(COPY.success);
    } catch {
      toast.error(COPY.error);
    }
  }

  return (
    <ConfirmDialog
      cancelLabel={COPY.cancel}
      confirmLabel={COPY.confirm}
      description={target ? describeTarget(target.displayName) : ""}
      onCancel={close}
      onConfirm={() => void handleConfirm()}
      open={target !== null}
      title={COPY.title}
    />
  );
}
