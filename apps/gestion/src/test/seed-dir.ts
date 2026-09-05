import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Directorio temporal de datos sembrado desde las fixtures sintéticas
// versionadas (`tests/fixtures/seeds/`). Cada test recibe una copia aislada:
// ningún test lee ni escribe `data/` (ignorada en git salvo `audit.json`).
// `GESTION_SEED_DIR` permite apuntar a otro origen sin tocar los tests.

export function seedSourceDirectory(): string {
  return process.env.GESTION_SEED_DIR ?? join(process.cwd(), "tests", "fixtures", "seeds");
}

export async function createSeedDirectory(prefix = "gestion-test-"): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  await cp(seedSourceDirectory(), directory, { recursive: true });
  return directory;
}
