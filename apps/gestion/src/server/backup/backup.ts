import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { JsonStore } from "../data/json-store.js";
import { auditDocumentSchema, instantSchema, type GestionError } from "../data/schemas.js";
import { AuditRepository, buildAuditEvent } from "../handlers/audit.js";
import type { AuthActor } from "../handlers/auth.js";
import { createGestionError, ERROR_CODES } from "../handlers/errors.js";
import { err, ok, type Result } from "../handlers/result.js";

const BACKUP_FILE_NAMES = ["clientes.json", "categorias.json", "productos.json", "servicios.json",
  "ordenes.json", "ventas.json", "compras.json", "movimientos-stock.json", "sesiones-caja.json",
  "gastos.json", "users.json", "audit.json"] as const;

const backupIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/, { error: "Invalid backup id." });
const backupFileEntrySchema = z.object({ hash: z.string().regex(/^[a-f0-9]{64}$/), version: z.number().int().nonnegative() });
export const backupManifestSchema = z.object({
  id: backupIdSchema,
  instante: instantSchema,
  actorId: z.string().min(1),
  files: z.record(z.string(), backupFileEntrySchema)
});
export type BackupManifest = z.infer<typeof backupManifestSchema>;
export interface BackupSummary { id: string; instante: string; actorId: string; files: number }

function sha256(contents: string): string {
  return createHash("sha256").update(contents, "utf8").digest("hex");
}
async function writeAtomic(filePath: string, contents: string): Promise<void> {
  const temporaryPath = `${filePath}.tmp`;
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(temporaryPath, contents, "utf8");
  await rename(temporaryPath, filePath);
}
const versionSchema = z.object({ version: z.number().int().nonnegative() });
function documentVersion(contents: string): number | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents) as unknown;
  } catch {
    return null;
  }
  const checked = versionSchema.safeParse(parsed);
  return checked.success ? checked.data.version : null;
}
function auditOf(dataDirectory: string): AuditRepository {
  return new AuditRepository(new JsonStore(join(dataDirectory, "audit.json"), auditDocumentSchema));
}

async function snapshotBackup(dataDirectory: string, actor: AuthActor): Promise<Result<BackupSummary, GestionError>> {
  const instante = new Date().toISOString();
  const id = `b_${randomUUID()}`;
  const directory = join(dataDirectory, "backups", id);
  const entries: Record<string, { hash: string; version: number }> = {};
  try {
    for (const name of BACKUP_FILE_NAMES) {
      const contents = await readFile(join(dataDirectory, name), "utf8");
      const version = documentVersion(contents);
      if (version === null) throw new Error(`Invalid document: ${name}`);
      entries[name] = { hash: sha256(contents), version };
      await writeAtomic(join(directory, name), contents);
    }
    const manifest = backupManifestSchema.parse({ id, instante, actorId: actor.id, files: entries });
    if (JSON.stringify(manifest).includes("credential")) throw new Error("The manifest must not contain credentials.");
    await writeAtomic(join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  } catch {
    await rm(directory, { force: true, recursive: true });
    return err(createGestionError(ERROR_CODES.STORAGE_ERROR));
  }
  return ok({ id, instante, actorId: actor.id, files: BACKUP_FILE_NAMES.length });
}

export async function createBackup(dataDirectory: string, actor: AuthActor): Promise<Result<BackupSummary, GestionError>> {
  const created = await snapshotBackup(dataDirectory, actor);
  if (!created.ok) return created;
  const recorded = await auditOf(dataDirectory).append(buildAuditEvent(
    { actorId: actor.id, accion: "backup.create", entidad: "backup", entidadId: created.value.id }, "ok"));
  if (!recorded.ok) return err(createGestionError(ERROR_CODES.AUDIT_FAILURE));
  return created;
}

async function restoreCore(dataDirectory: string, id: string): Promise<Result<BackupSummary, GestionError>> {
  if (!backupIdSchema.safeParse(id).success) return err(createGestionError(ERROR_CODES.VALIDATION_ERROR));
  const directory = join(dataDirectory, "backups", id);
  let manifest: BackupManifest;
  try {
    manifest = backupManifestSchema.parse(JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")) as unknown);
  } catch {
    return err(createGestionError(ERROR_CODES.VALIDATION_ERROR));
  }
  const payloads: Array<{ name: string; contents: string }> = [];
  try {
    for (const name of BACKUP_FILE_NAMES) {
      const contents = await readFile(join(directory, name), "utf8");
      if (sha256(contents) !== manifest.files[name]?.hash) throw new Error(`Corrupt backup file: ${name}`);
      payloads.push({ name, contents });
    }
  } catch {
    return err(createGestionError(ERROR_CODES.VALIDATION_ERROR));
  }
  const rollback: Array<{ name: string; contents: string }> = [];
  try {
    for (const name of BACKUP_FILE_NAMES) rollback.push({ name, contents: await readFile(join(dataDirectory, name), "utf8") });
  } catch {
    return err(createGestionError(ERROR_CODES.STORAGE_ERROR));
  }
  try {
    for (const file of payloads) await writeAtomic(join(dataDirectory, file.name), file.contents);
  } catch {
    for (const file of rollback) {
      try {
        await writeAtomic(join(dataDirectory, file.name), file.contents);
      } catch {
        // Best effort: report the restore failure even if rollback is partial.
      }
    }
    return err(createGestionError(ERROR_CODES.STORAGE_ERROR));
  }
  return ok({ id, instante: manifest.instante, actorId: manifest.actorId, files: payloads.length });
}

export async function restoreBackup(dataDirectory: string, actor: AuthActor, id: string): Promise<Result<BackupSummary, GestionError>> {
  const restored = await restoreCore(dataDirectory, id);
  if (!restored.ok) return restored;
  const recorded = await auditOf(dataDirectory).append(buildAuditEvent(
    { actorId: actor.id, accion: "backup.restore", entidad: "backup", entidadId: id }, "ok"));
  if (!recorded.ok) return err(createGestionError(ERROR_CODES.AUDIT_FAILURE));
  return restored;
}

export async function listBackups(dataDirectory: string): Promise<Result<BackupSummary[], GestionError>> {
  let entries: string[];
  try {
    entries = await readdir(join(dataDirectory, "backups"));
  } catch {
    return ok([]);
  }
  const backups: BackupSummary[] = [];
  for (const entry of entries) {
    try {
      const manifest = backupManifestSchema.parse(
        JSON.parse(await readFile(join(dataDirectory, "backups", entry, "manifest.json"), "utf8")) as unknown);
      backups.push({ id: manifest.id, instante: manifest.instante, actorId: manifest.actorId, files: Object.keys(manifest.files).length });
    } catch {
      // Skip incomplete backup directories; only verifiable backups are listed.
    }
  }
  backups.sort((a, b) => (a.instante < b.instante ? -1 : 1));
  return ok(backups);
}
