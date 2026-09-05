import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { JsonStore } from "./json-store";

const documentSchema = z.object({
  version: z.number().int().nonnegative(),
  value: z.string()
});

describe("JsonStore", () => {
  it("writes atomically and returns STORAGE_ERROR when rename fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gestion-store-"));
    const filePath = join(directory, "document.json");
    const normalStore = new JsonStore(filePath, documentSchema);
    await normalStore.write({ version: 1, value: "current" });

    const failingStore = new JsonStore(filePath, documentSchema, {
      fileSystem: {
        rename: async () => {
          throw new Error("simulated rename failure");
        }
      }
    });

    const result = await failingStore.write({ version: 2, value: "candidate" });
    const current = await normalStore.read();

    expect(result).toMatchObject({ ok: false, error: { code: "STORAGE_ERROR" } });
    expect(current).toMatchObject({ ok: true, value: { version: 1, value: "current" } });
    await expect(rm(directory, { recursive: true, force: true })).resolves.toBeUndefined();
  });

  it("serializes concurrent writes and rejects the stale version", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gestion-store-"));
    const filePath = join(directory, "document.json");
    const store = new JsonStore(filePath, documentSchema);
    await store.write({ version: 1, value: "current" });

    const results = await Promise.all([
      store.write({ version: 2, value: "first" }),
      store.write({ version: 2, value: "second" })
    ]);
    const current = await store.read();

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(current).toMatchObject({ ok: true, value: { version: 2 } });
    await rm(directory, { recursive: true, force: true });
  });
});
