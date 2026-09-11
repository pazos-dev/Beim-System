"use client";

import { Suspense, useState, type FormEvent } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CajaPanel, type CajaCierreView, type CajaEstadoView } from "../../../src/components/features/CajaPanel";
import { useToast } from "../../../src/components/ui/Toast";
import { useUiStore } from "../../../src/lib/ui-store";
import { Button } from "../../../src/components/ui/Button";
import { Input } from "../../../src/components/ui/Input";
import { useActor } from "../../../src/lib/api/auth-store";
import { close, current, open } from "../../../src/lib/api/caja-repository";

const CAJA_OPERATE_ROLES: ReadonlySet<string> = new Set(["caja", "administrador", "administrador_principal"]);

const COPY = {
  abrir: "Abrir caja",
  aperturaLabel: "Apertura inicial",
  cerrar: "Cerrar caja",
  fechaLabel: "Fecha",
  closeError: "No se pudo cerrar la caja. Reintentá.",
  closed: "Caja cerrada con éxito.",
  contadoLabel: "Contado",
  denied: "Tu sesión no es válida. Iniciá sesión para ver la caja.",
  error: "No se pudo cargar la caja. Reintentá.",
  loading: "Cargando caja…",
  login: "Ir a iniciar sesión",
  openError: "No se pudo abrir la caja. Reintentá.",
  opened: "Caja abierta con éxito.",
  retirosLabel: "Retiros",
  retry: "Reintentar",
  title: "Caja"
} as const;

function CajaPageContent() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const actor = useActor();
  const formRevision = useUiStore((state) => state.cajaFormRevision);
  const bumpFormRevision = useUiStore((state) => state.bumpCajaFormRevision);
  const [ultimoCierre, setUltimoCierre] = useState<CajaCierreView | null>(null);

  const canOperate = actor !== null && CAJA_OPERATE_ROLES.has(actor.role);
  const denied = actor === null;

  const { data, error, isFetching, refetch } = useQuery<CajaEstadoView, Error>({
    enabled: !denied,
    queryFn: current,
    queryKey: ["caja"],
    staleTime: 30_000,
  });

  const openMutation = useMutation<void, Error, { businessDate: string; openingAmount: number }>({
    mutationFn: open,
    onError: () => toast.error(COPY.openError),
    onSuccess: () => {
      toast.success(COPY.opened);
      bumpFormRevision();
      setUltimoCierre(null);
      void queryClient.invalidateQueries({ queryKey: ["caja"] });
    },
  });

  const closeMutation = useMutation<CajaCierreView, Error, { contado: number; id: string; retiros: number }>({
    mutationFn: ({ contado, id, retiros }) => close(id, { contado, retiros }),
    onError: () => toast.error(COPY.closeError),
    onSuccess: (cierre) => {
      toast.success(COPY.closed);
      setUltimoCierre(cierre);
      bumpFormRevision();
      void queryClient.invalidateQueries({ queryKey: ["caja"] });
    },
  });

  async function handleAbrir(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const businessDate = String(form.get("fecha") ?? "");
    const openingAmount = Number(form.get("apertura"));
    openMutation.mutate({ businessDate, openingAmount });
  }

  async function handleCerrar(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (data?.sesion?.id === undefined) return;
    const form = new FormData(event.currentTarget);
    const contado = Number(form.get("contado"));
    const retiros = Number(form.get("retiros"));
    closeMutation.mutate({
      contado,
      id: data.sesion.id,
      retiros: Number.isFinite(retiros) ? retiros : 0,
    });
  }

  if (denied) {
    return (
      <p>
        {COPY.denied} <a href="/login">{COPY.login}</a>
      </p>
    );
  }

  return (
    <section aria-labelledby="caja-title" className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Módulo</p>
      <h1 className="text-3xl font-semibold tracking-tight text-ink" id="caja-title">
        {COPY.title}
      </h1>

      {error ? (
        <p role="alert">
          {COPY.error}{" "}
          <Button onClick={() => void refetch()} type="button" variant="secondary">
            {COPY.retry}
          </Button>
        </p>
      ) : data ? (
        <>
          <CajaPanel estado={data} ultimoCierre={ultimoCierre} />
          {canOperate && !data.abierta ? (
            <form
              aria-label={COPY.abrir}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              key={`abrir-${formRevision}`}
              onSubmit={(event) => void handleAbrir(event)}
            >
              <div className="flex-1">
                <Input defaultValue="" label={COPY.fechaLabel} name="fecha" placeholder="AAAA-MM-DD" />
              </div>
              <div className="flex-1">
                <Input
                  defaultValue="0"
                  label={COPY.aperturaLabel}
                  min="0"
                  name="apertura"
                  step="any"
                  type="number"
                />
              </div>
              <Button disabled={openMutation.isPending || closeMutation.isPending || isFetching} type="submit">
                {COPY.abrir}
              </Button>
            </form>
          ) : null}
          {canOperate && data.abierta ? (
            <form
              aria-label={COPY.cerrar}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              key={`cerrar-${formRevision}`}
              onSubmit={(event) => void handleCerrar(event)}
            >
              <div className="flex-1">
                <Input
                  defaultValue="0"
                  label={COPY.contadoLabel}
                  min="0"
                  name="contado"
                  step="any"
                  type="number"
                />
              </div>
              <div className="flex-1">
                <Input
                  defaultValue="0"
                  label={COPY.retirosLabel}
                  min="0"
                  name="retiros"
                  step="any"
                  type="number"
                />
              </div>
              <Button disabled={openMutation.isPending || closeMutation.isPending || isFetching} type="submit">
                {COPY.cerrar}
              </Button>
            </form>
          ) : null}
        </>
      ) : (
        <p>{COPY.loading}</p>
      )}
    </section>
  );
}

export default function CajaPage() {
  return (
    <Suspense fallback={<p>{COPY.loading}</p>}>
      <CajaPageContent />
    </Suspense>
  );
}
