import { rm } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSeedDirectory } from "../../test/seed-dir";
import { createOrderStores, OrderHandler, toOrderActor } from "./orders";

let directory = "";

describe("order cliente link (CLI-6)", () => {
  beforeAll(async () => {
    directory = await createSeedDirectory("gestion-orders-cliente-link-");
  });

  afterAll(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it("rejects unknown clienteId with NOT_FOUND_OR_FORBIDDEN and persists nothing", async () => {
    const handler = new OrderHandler(createOrderStores(directory));
    const actor = toOrderActor({
      id: "u-vendedor",
      username: "vendedor",
      displayName: "Vendedor",
      role: "vendedor"
    });
    const before = await handler.list(actor);
    const result = await handler.create(actor, { clienteId: "missing", total: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
    const after = await handler.list(actor);
    if (before.ok && after.ok) expect(after.value.length).toBe(before.value.length);
  });
});
