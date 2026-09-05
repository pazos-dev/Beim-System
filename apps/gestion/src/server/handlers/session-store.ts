import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { z } from "zod";

import { getSessionMaxAgeSeconds } from "./session";

// NOTA (seguridad): sesiones.json jamás se versiona — guarda tokens de sesión y es estado
// local como el resto de data/ (cubierto por `data/*` en .gitignore). NUNCA commitear datos.
//
// Diseño: el Map en memoria sigue siendo el nivel 1 (misma semántica que antes, sin cambios
// de comportamiento para callers existentes); el archivo es el nivel 2 que solo se lee ante
// un miss de memoria (reinicio del dev server) y se escribe en cada mutación (best-effort).

const sessionRoleSchema = z.enum([
  "vendedor",
  "tecnico",
  "caja",
  "administrador",
  "administrador_principal"
]);

const sessionActorSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  displayName: z.string().min(1),
  role: sessionRoleSchema
});

const sessionEntrySchema = z.object({
  token: z.string().min(1).max(256),
  actor: sessionActorSchema,
  createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative()
});

export const sessionsDocumentSchema = z.object({
  version: z.number().int().nonnegative(),
  sessions: z.array(sessionEntrySchema)
});

export type SessionActor = z.infer<typeof sessionActorSchema>;

export interface SessionRecord {
  actor: SessionActor;
  createdAt: number;
  expiresAt: number;
}

export const SESSIONS_FILE_NAME = "sesiones.json";

let configuredDirectory: string | null = null;
let cachedPath = "";
let cachedRecords: Map<string, SessionRecord> | null = null;
let cachedMtimeMs = -1;

export function configureSessionStore(dataDirectory: string): void {
  configuredDirectory = dataDirectory;
}

export function resolveSessionsFilePath(directory?: string): string {
  const resolved = directory
    ?? configuredDirectory
    ?? process.env.GESTION_DATA_DIR
    ?? join(process.cwd(), "data");
  return join(resolved, SESSIONS_FILE_NAME);
}

function isLive(record: SessionRecord, nowMs: number, maxAgeSeconds: number): boolean {
  return nowMs < record.expiresAt && nowMs < record.createdAt + maxAgeSeconds * 1000;
}

function parseEntries(raw: string): Map<string, SessionRecord> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  const validated = sessionsDocumentSchema.safeParse(parsed);
  if (!validated.success) {
    return null;
  }
  const records = new Map<string, SessionRecord>();
  for (const entry of validated.data.sessions) {
    records.set(entry.token, {
      actor: entry.actor,
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt
    });
  }
  return records;
}

/**
 * Nivel 2: lee las sesiones del archivo con caché por mtime. Nunca lanza:
 * archivo ausente o corrupto → miss (fail-closed, el caller resuelve null).
 */
export function loadSessionsFromDisk(filePath: string): Map<string, SessionRecord> {
  let mtimeMs = -1;
  try {
    mtimeMs = statSync(filePath).mtimeMs;
  } catch {
    cachedPath = filePath;
    cachedRecords = new Map<string, SessionRecord>();
    cachedMtimeMs = -1;
    return cachedRecords;
  }
  if (cachedRecords !== null && filePath === cachedPath && mtimeMs <= cachedMtimeMs) {
    return cachedRecords;
  }
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    cachedPath = filePath;
    cachedRecords = new Map<string, SessionRecord>();
    cachedMtimeMs = mtimeMs;
    return cachedRecords;
  }
  cachedPath = filePath;
  cachedRecords = parseEntries(raw) ?? new Map<string, SessionRecord>();
  cachedMtimeMs = mtimeMs;
  return cachedRecords;
}

/**
 * Nivel 2: persiste con escritura atómica (tmp+rename) y limpieza oportunista de
 * expiradas. Best-effort: si el disco falla, la sesión sigue válida en memoria.
 */
export function saveSessionsToDisk(filePath: string, records: Map<string, SessionRecord>): void {
  const nowMs = Date.now();
  const maxAgeSeconds = getSessionMaxAgeSeconds();
  const sessions = Array.from(records.entries())
    .filter(([, record]) => isLive(record, nowMs, maxAgeSeconds))
    .map(([token, record]) => ({
      token,
      actor: record.actor,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt
    }));
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify({ version: 1, sessions }, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, filePath);
    cachedPath = filePath;
    cachedRecords = parseEntries(JSON.stringify({ version: 1, sessions })) ?? new Map<string, SessionRecord>();
    cachedMtimeMs = statSync(filePath).mtimeMs;
  } catch {
    // Intencionalmente silencioso: la sesión en memoria sigue válida para este proceso.
  }
}

/** Simula un reinicio: vacía la memoria (L1+L2) y conserva el archivo. */
export function clearSessionMemoryForTests(): void {
  cachedPath = "";
  cachedRecords = null;
  cachedMtimeMs = -1;
}
