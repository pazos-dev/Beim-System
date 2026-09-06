"use client";

import { useState, type FormEvent } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { createClienteInputSchema, type DuplicateContactField } from "../../lib/domain/clients/cliente";
import { useUiStore } from "../../lib/ui-store";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";

const COPY = {
  emailLabel: "Correo electrónico",
  error: "No se pudo crear el cliente. Reintentá.",
  nameError: "Ingresá el nombre del cliente.",
  submit: "Crear cliente",
  success: "Cliente creado correctamente.",
  title: "Nuevo cliente"
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readWarning(payload: unknown): DuplicateContactField | null {
  if (!isRecord(payload) || !isRecord(payload.data)) return null;
  const warning = payload.data.duplicateWarning;
  return warning === "email" || warning === "phone" ? warning : null;
}

export function ClienteCreateModal() {
  const open = useUiStore((state) => state.clienteModalOpen);
  const setOpen = useUiStore((state) => state.setClienteModalOpen);
  const setWarning = useUiStore((state) => state.setDuplicateWarning);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function close(): void {
    setDisplayName("");
    setDocument("");
    setPhone("");
    setEmail("");
    setNameError(undefined);
    setServerError(null);
    setOpen(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = createClienteInputSchema.safeParse({
      ...(document.trim() === "" ? {} : { document: document.trim() }),
      ...(email.trim() === "" ? {} : { email: email.trim() }),
      ...(phone.trim() === "" ? {} : { phone: phone.trim() }),
      displayName: displayName.trim()
    });
    if (!parsed.success) {
      setNameError(COPY.nameError);
      return;
    }
    setNameError(undefined);
    setServerError(null);
    setPending(true);
    try {
      const response = await fetch("/api/gestion/clientes", {
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
      await queryClient.invalidateQueries({ queryKey: ["clientes"] });
      const warning = readWarning(payload);
      close();
      if (warning) {
        setWarning(warning);
      } else {
        toast.success(COPY.success);
      }
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
          error={nameError}
          label="Nombre del cliente"
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Nombre y apellido"
          value={displayName}
        />
        <Input
          label="Documento"
          onChange={(event) => setDocument(event.target.value)}
          placeholder="DNI o CUIT (opcional)"
          value={document}
        />
        <Input
          label="Teléfono"
          onChange={(event) => setPhone(event.target.value)}
          placeholder="Teléfono (opcional)"
          value={phone}
        />
        <Input
          label={COPY.emailLabel}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="correo@ejemplo.com (opcional)"
          type="email"
          value={email}
        />
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
