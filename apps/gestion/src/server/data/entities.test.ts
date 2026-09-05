import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { usersDocumentSchema } from "../handlers/auth";
import {
  auditDocumentSchema,
  categoriasDocumentSchema,
  comprasDocumentSchema,
  clientesDocumentSchema,
  gastosDocumentSchema,
  movimientosStockDocumentSchema,
  ordenesDocumentSchema,
  productosDocumentSchema,
  serviciosDocumentSchema,
  sesionesCajaDocumentSchema,
  ventasDocumentSchema
} from "./schemas";

const seedDirectory = process.env.GESTION_SEED_DIR ?? join(process.cwd(), "tests", "fixtures", "seeds");

async function readSeed(fileName: string): Promise<unknown> {
  const raw = await readFile(join(seedDirectory, fileName), "utf8");
  return JSON.parse(raw) as unknown;
}

const seedCases = [
  { file: "clientes.json", schema: clientesDocumentSchema },
  { file: "categorias.json", schema: categoriasDocumentSchema },
  { file: "productos.json", schema: productosDocumentSchema },
  { file: "servicios.json", schema: serviciosDocumentSchema },
  { file: "ordenes.json", schema: ordenesDocumentSchema },
  { file: "ventas.json", schema: ventasDocumentSchema },
  { file: "compras.json", schema: comprasDocumentSchema },
  { file: "movimientos-stock.json", schema: movimientosStockDocumentSchema },
  { file: "sesiones-caja.json", schema: sesionesCajaDocumentSchema },
  { file: "gastos.json", schema: gastosDocumentSchema },
  { file: "users.json", schema: usersDocumentSchema },
  { file: "audit.json", schema: auditDocumentSchema }
];

describe("entity seed documents", () => {
  for (const seedCase of seedCases) {
    it(`validates the synthetic seed ${seedCase.file}`, async () => {
      const parsed = seedCase.schema.safeParse(await readSeed(seedCase.file));
      expect(parsed.success).toBe(true);
    });
  }

  it("rejects an entity without ownership or concurrency version", async () => {
    const parsed = clientesDocumentSchema.safeParse({
      version: 1,
      clientes: [{ id: "c_1", displayName: "Sin propietario" }]
    });
    expect(parsed.success).toBe(false);
  });
});
