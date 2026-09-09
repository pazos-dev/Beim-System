"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { CajaPanel, resultadoFor, type CajaCierreView, type CajaEstadoView } from "../../../src/components/features/CajaPanel";
import { useListQuery } from "../../../src/components/useListQuery";
import { useUiSliceStore } from "../../../src/store/ui.slice";
import { useToast } from "../../../src/components/ui/Toast";
import { Button } from "../../../src/components/ui/Button";
import { Input } from "../../../src/components/ui/Input";

const CAJA_OPERATE_ROLES: ReadonlySet<string> = new Set(["caja", "administrador", "administrador_principal"]);

const COPY = {
  abrir: "Abrir caja",
  aperturaLabel: "Apertura inicial",
  cerrar: "Cerrar caja",
  closeError: "No se pudo cerrar la caja. Reintentá.",
  closed: "Caja cerrada con éxito.",
  contadoLabel: "Contado",
  denied: "Tu sesión no es válida. Iniciá sesión para ver la caja.",
  error: "No se pudo cargar la caja. Reintentá.",
  fechaLabel: "Fecha",
  loading: "Cargando caja…",
  login: "Ir a iniciar sesión",
  openError: "No se pudo abrir la caja. Reintentá.",
  opened: "Caja abierta con éxito.",
  retirosLabel: "Retiros",
  retry: "Reintentar",
  title: "Caja"
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toCajaEstado(value: unknown): CajaEstadoView {
  if (!isRecord(value) || !isRecord(value.data)) throw new Error(COPY.error);
  const data = value.data;
  const sesion = isRecord(data.sesion)
    ? {
        apertura: toNumber(data.sesion.apertura, 0),
        estado: typeof data.sesion.estado === "string" ? data.sesion.estado : "",
        fecha: typeof data.sesion.fecha === "string" ? data.sesion.fecha : "",
        id: typeof data.sesion.id === "string" ? data.sesion.id : ""
      }
    : null;
  const rawMetodo = Array.isArray(data.porMetodo) ? data.porMetodo : [];
  const gastosDia = isRecord(data.gastosDia) ? data.gastosDia : {};
  return {
    abierta: data.abierta === true,
    esperado: toNumber(data.esperado, 0),
    gastosDia: { count: toNumber(gastosDia.count, 0), total: toNumber(gastosDia.total, 0) },
    porMetodo: rawMetodo
      .filter(isRecord)
      .filter((linea) => typeof linea.metodo === "string" && typeof linea.total === "number")
      .map((linea) => ({ metodo: linea.metodo as string, total: linea.total as number })),
    sesion
  };
}

function toCierre(value: unknown): CajaCierreView {
  if (!isRecord(value) || !isRecord(value.data)) throw new Error(COPY.closeError);
  const data = value.data;
  const diferencia = toNumber(data.diferencia, Number.NaN);
  if (!Number.isFinite(diferencia)) throw new Error(COPY.closeError);
  return {
    contado: toNumber(data.contado, 0),
    diferencia,
    esperado: toNumber(data.esperado, 0),
    resultado: resultadoFor(diferencia)
  };
}

interface SessionActor {
  readonly role: string;
}

function isSessionActor(value: unknown): value is SessionActor {
  return isRecord(value) && typeof value.role === "string";
}

function CajaPageContent() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const formRevision = useUiSliceStore((state) => state.cajaFormRevision);
  const bumpFormRevision = useUiSliceStore((state) => state.bumpCajaFormRevision);
  const [canOperate, setCanOperate] = useState(false);
  const [denied, setDenied] = useState(false);
  const [pending, setPending] = useState<null | "abrir" | "cerrar">(null);
  const [ultimoCierre, setUltimoCierre] = useState<CajaCierreView | null>(null);

  const {
    denied: queryDenied,
    params,
    query: { data, error, isFetching, refetch },
    setParams
  } = useListQuery<CajaEstadoView>({
    apiPath: "/api/gestion/caja",
    authError: COPY.denied,
    basePath: "/app/caja",
    buildRequest: (committed) =>
      committed["fecha"] !== "" ? `fecha=${encodeURIComponent(committed["fecha"] ?? "")}` : "",
    key: "caja",
    loadError: COPY.error,
    params: ["fecha"],
    parse: toCajaEstado
  });
  const fechaParam = params["fecha"] ?? "";

  useEffect(() => {
    if (queryDenied) setDenied(true);
  }, [queryDenied]);

  useEffect(() => {
    let active = true;
    fetch("/api/gestion/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (active && response.ok && isRecord(payload) && isSessionActor(payload.data)) {
          setCanOperate(CAJA_OPERATE_ROLES.has(payload.data.role));
        }
      })
      .catch(() => {
        // Los formularios son solo acceso; la defensa real es server-side.
      });
    return () => {
      active = false;
    };
  }, []);

  async function postCaja(body: Record<string, unknown>): Promise<unknown> {
    const response = await fetch("/api/gestion/caja", {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", "x-idempotency-key": crypto.randomUUID() },
      method: "POST"
    });
    if (!response.ok) throw new Error("Request failed.");
    return response.json();
  }

  async function handleAbrir(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fecha = String(form.get("fecha") ?? "");
    const apertura = Number(form.get("apertura"));
    setPending("abrir");
    try {
      await postCaja({ accion: "abrir", apertura, fecha });
      toast.success(COPY.opened);
      bumpFormRevision();
      setUltimoCierre(null);
      if (fecha !== "") setParams({ fecha });
      await queryClient.invalidateQueries({ queryKey: ["caja"] });
    } catch {
      toast.error(COPY.openError);
    } finally {
      setPending(null);
    }
  }

  async function handleCerrar(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const contado = Number(form.get("contado"));
    const retiros = Number(form.get("retiros"));
    setPending("cerrar");
    try {
      const cierre = toCierre(await postCaja({ accion: "cerrar", contado, retiros: Number.isFinite(retiros) ? retiros : 0 }));
      toast.success(COPY.closed);
      bumpFormRevision();
      setUltimoCierre(cierre);
      await queryClient.invalidateQueries({ queryKey: ["caja"] });
    } catch {
      toast.error(COPY.closeError);
    } finally {
      setPending(null);
    }
  }

  return (
    <section aria-labelledby="caja-title" className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Módulo</p>
      <h1 className="text-3xl font-semibold tracking-tight text-ink" id="caja-title">
        {COPY.title}
      </h1>

      {denied ? (
        <p>
          {COPY.denied} <a href="/login">{COPY.login}</a>
        </p>
      ) : error ? (
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
            <form aria-label={COPY.abrir} className="flex flex-col gap-3 sm:flex-row sm:items-end" key={`abrir-${formRevision}`} onSubmit={(event) => void handleAbrir(event)}>
              <div className="flex-1">
                <Input defaultValue={fechaParam} label={COPY.fechaLabel} name="fecha" placeholder="AAAA-MM-DD" />
              </div>
              <div className="flex-1">
                <Input defaultValue="0" label={COPY.aperturaLabel} min="0" name="apertura" step="any" type="number" />
              </div>
              <Button disabled={pending !== null || isFetching} type="submit">
                {COPY.abrir}
              </Button>
            </form>
          ) : null}
          {canOperate && data.abierta ? (
            <form aria-label={COPY.cerrar} className="flex flex-col gap-3 sm:flex-row sm:items-end" key={`cerrar-${formRevision}`} onSubmit={(event) => void handleCerrar(event)}>
              <div className="flex-1">
                <Input defaultValue="0" label={COPY.contadoLabel} min="0" name="contado" step="any" type="number" />
              </div>
              <div className="flex-1">
                <Input defaultValue="0" label={COPY.retirosLabel} min="0" name="retiros" step="any" type="number" />
              </div>
              <Button disabled={pending !== null || isFetching} type="submit">
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
