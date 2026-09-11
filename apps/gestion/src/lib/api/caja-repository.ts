/**
 * Repositorio de caja que consume la API backend.
 *
 * El backend devuelve sesiones en formato inglés (CashSessionRow);
 * este repository las mapea a los tipos en español que espera la UI.
 */

import type { CajaCierreView, CajaEstadoView } from "../../components/features/CajaPanel";
import { useAuthStore } from "./auth-store";
import { HttpClient } from "./http-client";

const client = new HttpClient({
  getToken: () => useAuthStore.getState().token,
});

/** Respuesta cruda del backend para una sesión de caja. */
interface CashSessionRow {
  readonly id: string;
  readonly businessDate: string;
  readonly openingAmount: number;
  readonly expectedAmount: number;
  readonly countedAmount: number | null;
  readonly difference: number;
  readonly status: string;
  readonly notes: string;
  readonly openedAt: string;
  readonly closedAt: string | null;
}

type OpenBody = {
  readonly businessDate: string;
  readonly openingAmount: number;
};

/** Body que envía el frontend al cerrar (UI en español). */
export type CloseBody = {
  readonly contado: number;
  readonly retiros: number;
};

function unwrap<T>(
  envelope:
    | { readonly ok: true; readonly data?: T }
    | { readonly ok: false; readonly error?: { readonly message?: string } },
): T {
  if (!envelope.ok) {
    throw new Error(envelope.error?.message ?? "Error desconocido");
  }
  if (envelope.data === undefined) {
    throw new Error("Respuesta vacía del servidor");
  }
  return envelope.data;
}

function mapToCajaEstadoView(session: CashSessionRow | null): CajaEstadoView {
  if (session === null) {
    return {
      abierta: false,
      esperado: 0,
      gastosDia: { count: 0, total: 0 },
      porMetodo: [],
      sesion: null,
    };
  }
  return {
    abierta: session.status === "open",
    esperado: session.expectedAmount,
    gastosDia: { count: 0, total: 0 },
    porMetodo: [],
    sesion: {
      apertura: session.openingAmount,
      estado: session.status,
      fecha: session.businessDate,
      id: session.id,
    },
  };
}

function mapToCajaCierreView(session: CashSessionRow): CajaCierreView {
  const diferencia = session.difference;
  return {
    contado: session.countedAmount ?? 0,
    diferencia,
    esperado: session.expectedAmount,
    resultado: diferencia > 0 ? "sobrante" : diferencia < 0 ? "faltante" : "exacto",
  };
}

export async function list(): Promise<{ items: unknown[]; total: number }> {
  const envelope = await client.request<{ items: unknown[]; total: number }>("GET", "/cash-sessions");
  return unwrap(envelope);
}

export async function current(): Promise<CajaEstadoView> {
  const envelope = await client.request<CashSessionRow>("GET", "/cash-sessions/current");
  const session = unwrap(envelope);
  return mapToCajaEstadoView(session);
}

export async function open(body: OpenBody): Promise<void> {
  const envelope = await client.request<void>("POST", "/cash-sessions", { body });
  if (!envelope.ok) {
    throw new Error(envelope.error?.message ?? "Error desconocido");
  }
}

export async function close(id: string, body: CloseBody): Promise<CajaCierreView> {
  // El backend espera countedAmount = contado - retiros
  const countedAmount = Math.max(0, body.contado - body.retiros);
  const envelope = await client.request<CashSessionRow>("POST", `/cash-sessions/${id}/close`, {
    body: { countedAmount },
  });
  const session = unwrap(envelope);
  return mapToCajaCierreView(session);
}

export async function movement(id: string, body: unknown): Promise<unknown> {
  const envelope = await client.request<unknown>("POST", `/cash-sessions/${id}/movements`, { body });
  return unwrap(envelope);
}
