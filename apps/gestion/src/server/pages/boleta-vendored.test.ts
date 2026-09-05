import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Anclaje estructural de la boleta vendored en public/boleta/ (D8):
// la copia es un artefacto nuevo; el legacy sistema-gestion/boleta NO se
// modifica. Estos chequeos protegen la reversión del slice sin requerir un
// harness de navegador para el script vanilla legacy.

const SCRIPT_PATH = join(process.cwd(), "public", "boleta", "script.js");
const HTML_PATH = join(process.cwd(), "public", "boleta", "index.html");

async function readVendored(): Promise<{ script: string; html: string }> {
  const [script, html] = await Promise.all([readFile(SCRIPT_PATH, "utf8"), readFile(HTML_PATH, "utf8")]);
  return { script, html };
}

describe("boleta vendored en public/boleta", () => {
  it("expone un botón de guardado y un selector de cliente de gestión en el HTML", async () => {
    const { html } = await readVendored();
    expect(html).toContain('id="save-btn"');
    expect(html).toContain('id="gestion-client-select"');
    expect(html).toContain('name="clientRef"');
  });

  it("crea la orden contra la API de gestión con idempotencia por intento", async () => {
    const { script } = await readVendored();
    expect(script).toContain("GESTION_ORDENES_API");
    expect(script).toContain("/api/gestion/ordenes");
    expect(script).toContain('"x-idempotency-key"');
    expect(script).toContain("crypto.randomUUID()");
  });

  it("notifica al padre con ORDEN_CREADA tras el guardado exitoso", async () => {
    const { script } = await readVendored();
    expect(script).toContain('"ORDEN_CREADA"');
    expect(script).toContain("window.parent.postMessage");
  });

  it("mapea el input extendido sin persistir el desbloqueo", async () => {
    const { script } = await readVendored();
    // El payload de gestión usa los campos extendidos del schema de órdenes.
    expect(script).toContain("buildGestionOrderInput");
    expect(script).toContain("deviceBrand");
    expect(script).toContain("estimatedTimeUnit");
    expect(script).toContain("boletaNumero");
    // El desbloqueo NO se persiste: no se envía en el POST a gestión.
    const gestionBlock = script.slice(script.indexOf("buildGestionOrderInput"));
    const postBlock = gestionBlock.slice(0, gestionBlock.indexOf("async function saveGestionEmbeddedReceipt"));
    expect(postBlock).not.toContain("unlockCode");
    expect(postBlock).not.toContain("unlockPassword");
    expect(postBlock).not.toContain("unlockPattern");
  });

  it("mantiene el flujo local de la boleta cuando no está embebida", async () => {
    const { script } = await readVendored();
    expect(script).toContain("IS_EMBEDDED_IN_GESTION");
    expect(script).toContain("!BOLETA_ACTOR_ID");
    expect(script).toContain("localStorage");
  });
});