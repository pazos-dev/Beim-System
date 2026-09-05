import { z } from "zod";

export const migrationStateSchema = z.object({
  version: z.number().int().nonnegative(),
  estado: z.enum(["bloqueado", "pendiente", "retirado"]),
  ultimoDryRun: z.string().nullable()
});
export type MigrationState = z.infer<typeof migrationStateSchema>;

const legacyDumpSchema = z.record(z.string(), z.unknown());

export interface MigrationMapping {
  legacyKey: string;
  owner: string;
  registros: number;
}
export interface MigrationAmbiguo {
  legacyKey: string;
  candidatos: readonly [string, string];
  registros: number;
}
export interface MigrationBloqueo {
  legacyKey: string;
  motivo: string;
}
export interface MigrationPlan {
  mappings: MigrationMapping[];
  ambiguos: MigrationAmbiguo[];
  bloqueos: MigrationBloqueo[];
  estado: string;
}

const OWNER_BY_LEGACY_KEY: Readonly<Record<string, string>> = {
  "sistema-gestion-capital-inicial-v1": "sesiones-caja",
  "sistema-gestion-accounting-state-v1": "gastos",
  "sistema-gestion-menu-v1": "menu",
  "sistema-gestion-category-tree-v1": "categorias",
  "beim_boleta_marcas_v1": "productos",
  "beim_boleta_modelos_v1": "productos",
  "sistema-gestion-purchase-suppliers-v1": "compras",
  "sistema-gestion-fixed-expense-names-v1": "gastos"
};
const AMBIGUOUS_CANDIDATES: Readonly<Record<string, readonly [string, string]>> = {
  "sistema-gestion-stock-category-order-v1": ["categorias", "productos"],
  "sistema-gestion-report-expense-categories-reset-v1": ["gastos", "categorias"],
  "sistema-gestion-report-expense-categories-clear-v2": ["gastos", "categorias"]
};
const DATA_SUB_OWNERS: Readonly<Record<string, string>> = {
  clientes: "clientes",
  ordenes: "ordenes",
  productos: "productos",
  ventas: "ventas",
  gastos: "gastos"
};
const SECRET_KEY_PATTERN = /password|passwd|secret|token|credential|api[_-]?key|private[_-]?key/i;
const SECRET_MOTIVO = "Posible secreto o PII: revision manual requerida.";

function countRegistros(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value === null || value === undefined) return 0;
  return 1;
}
function hasSecretKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSecretKey);
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).some(([key, child]) => SECRET_KEY_PATTERN.test(key) || hasSecretKey(child));
  }
  return false;
}
// Dry-run puro: funcion sincrona sin E/S; nunca escribe stores ni muta migration-state.json.
export function dryRun(legacyDump: unknown, estado = "bloqueado"): MigrationPlan {
  const parsed = legacyDumpSchema.safeParse(legacyDump);
  const dump: Record<string, unknown> = parsed.success ? parsed.data : {};
  const bloqueos: MigrationBloqueo[] = [];
  for (const [legacyKey, value] of Object.entries(dump)) {
    if (SECRET_KEY_PATTERN.test(legacyKey) || hasSecretKey(value)) {
      bloqueos.push({ legacyKey, motivo: SECRET_MOTIVO });
    }
  }
  if (bloqueos.length > 0) return { mappings: [], ambiguos: [], bloqueos, estado };
  const mappings: MigrationMapping[] = [];
  const ambiguos: MigrationAmbiguo[] = [];
  for (const [legacyKey, value] of Object.entries(dump)) {
    const candidatos = AMBIGUOUS_CANDIDATES[legacyKey];
    if (candidatos !== undefined) {
      ambiguos.push({ legacyKey, candidatos, registros: countRegistros(value) });
      continue;
    }
    if (legacyKey === "sistema-gestion-data-v1" && typeof value === "object" && value !== null) {
      for (const [subKey, subValue] of Object.entries(value)) {
        const owner = DATA_SUB_OWNERS[subKey];
        if (owner !== undefined) mappings.push({ legacyKey: `${legacyKey}.${subKey}`, owner, registros: countRegistros(subValue) });
      }
      continue;
    }
    const owner = OWNER_BY_LEGACY_KEY[legacyKey];
    if (owner !== undefined) mappings.push({ legacyKey, owner, registros: countRegistros(value) });
  }
  return { mappings, ambiguos, bloqueos, estado };
}
