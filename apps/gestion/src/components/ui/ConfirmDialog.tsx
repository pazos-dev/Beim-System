"use client";

import { Modal } from "./Modal";
import { Button } from "./Button";

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
}

export function ConfirmDialog({
  cancelLabel = "Cancelar",
  confirmLabel = "Confirmar",
  description,
  onCancel,
  onConfirm,
  open,
  title
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} role="alertdialog" title={title}>
      <p className="text-sm leading-6 text-ink-muted">{description}</p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button onClick={onCancel} variant="secondary">
          {cancelLabel}
        </Button>
        <Button data-autofocus onClick={onConfirm} variant="danger">
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
