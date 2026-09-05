import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ERROR_CODES } from "../handlers/errors";
import { JsonStore } from "./json-store";
import { EntityRepository, type RepositoryActor } from "./repositories";

const testEntitySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  ownerId: z.string().min(1)
});

type TestEntity = z.infer<typeof testEntitySchema>;

const collectionSchema = z.object({
  items: z.array(testEntitySchema),
  version: z.number().int().nonnegative()
});

const ownerA: RepositoryActor = { hasGlobalAccess: false, id: "u_a" };
const ownerB: RepositoryActor = { hasGlobalAccess: false, id: "u_b" };
const globalReader: RepositoryActor = { hasGlobalAccess: true, id: "u_admin" };

async function createRepository(
  directory: string,
  fileName: string,
  seed: TestEntity[] = [{ id: "e_1", label: "Alpha", ownerId: "u_a" }],
  auditSink?: (event: { action: string }) => void
): Promise<{ filePath: string; repository: EntityRepository<TestEntity> }> {
  const filePath = join(directory, fileName);
  const store = new JsonStore(filePath, collectionSchema);
  await store.write({ items: seed, version: 1 });
  const repository = new EntityRepository({
    auditSink,
    entitySchema: testEntitySchema,
    store: new JsonStore(filePath, collectionSchema)
  });
  return { filePath, repository };
}

describe("EntityRepository", () => {
  it("filters reads by owner and hides foreign entities", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gestion-repo-"));
    const { repository } = await createRepository(directory, "items.json", [
      { id: "e_1", label: "Alpha", ownerId: "u_a" },
      { id: "e_2", label: "Beta", ownerId: "u_b" }
    ]);

    const mine = await repository.list(ownerA);
    const foreign = await repository.getById(ownerA, "e_2");
    const global = await repository.list(globalReader);

    expect(mine).toMatchObject({ ok: true, value: [{ id: "e_1" }] });
    expect(foreign).toMatchObject({ ok: false, error: { code: ERROR_CODES.NOT_FOUND_OR_FORBIDDEN } });
    expect(global.ok && global.value).toHaveLength(2);
    await rm(directory, { force: true, recursive: true });
  });

  it("rejects creates under another owner without writing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gestion-repo-"));
    const { filePath, repository } = await createRepository(directory, "items.json");

    const result = await repository.create(ownerB, { id: "e_2", label: "Beta", ownerId: "u_a" });
    const raw = await readFile(filePath, "utf8");

    expect(result).toMatchObject({ ok: false, error: { code: ERROR_CODES.FORBIDDEN } });
    expect(JSON.parse(raw) as unknown).toMatchObject({ items: [{ id: "e_1" }], version: 1 });
    await rm(directory, { force: true, recursive: true });
  });

  it("keeps a valid file without tmp leftovers when atomic write fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gestion-repo-"));
    const filePath = join(directory, "items.json");
    const seedStore = new JsonStore(filePath, collectionSchema);
    await seedStore.write({ items: [{ id: "e_1", label: "Alpha", ownerId: "u_a" }], version: 1 });

    const failingStore = new JsonStore(filePath, collectionSchema, {
      fileSystem: {
        writeFile: async () => {
          throw new Error("simulated mid-write failure");
        }
      }
    });
    const repository = new EntityRepository({ entitySchema: testEntitySchema, store: failingStore });

    const result = await repository.create(ownerA, { id: "e_2", label: "Beta", ownerId: "u_a" });
    const raw = await readFile(filePath, "utf8");
    const leftovers = (await readdir(directory)).filter((entry) => entry.endsWith(".tmp"));

    expect(result).toMatchObject({ ok: false, error: { code: ERROR_CODES.STORAGE_ERROR } });
    expect(JSON.parse(raw) as unknown).toMatchObject({ version: 1 });
    expect(leftovers).toEqual([]);
    await rm(directory, { force: true, recursive: true });
  });

  it("reports CONFLICT on stale versions without losing data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gestion-repo-"));
    const { filePath, repository } = await createRepository(directory, "items.json");

    const first = await repository.update(ownerA, "e_1", { id: "e_1", label: "Alpha v2", ownerId: "u_a" });
    const stale = await repository.update(
      ownerA,
      "e_1",
      { id: "e_1", label: "Stale", ownerId: "u_a" },
      1
    );
    const raw = await readFile(filePath, "utf8");

    expect(first).toMatchObject({ ok: true });
    expect(stale).toMatchObject({ ok: false, error: { code: ERROR_CODES.CONFLICT } });
    expect(JSON.parse(raw) as unknown).toMatchObject({ items: [{ label: "Alpha v2" }], version: 2 });
    await rm(directory, { force: true, recursive: true });
  });

  it("treats storage failures as non-durable without mutating the original", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gestion-repo-"));
    const filePath = join(directory, "items.json");
    const seedStore = new JsonStore(filePath, collectionSchema);
    await seedStore.write({ items: [{ id: "e_1", label: "Alpha", ownerId: "u_a" }], version: 1 });

    const brokenStore = new JsonStore(filePath, collectionSchema, {
      fileSystem: {
        readFile: async () => {
          throw new Error("simulated storage outage");
        }
      }
    });
    const repository = new EntityRepository({ entitySchema: testEntitySchema, store: brokenStore });

    const listed = await repository.list(ownerA);
    const created = await repository.create(ownerA, { id: "e_2", label: "Beta", ownerId: "u_a" });
    const raw = await readFile(filePath, "utf8");
    const leftovers = (await readdir(directory)).filter((entry) => entry.endsWith(".tmp"));

    expect(listed).toMatchObject({ ok: false, error: { code: ERROR_CODES.STORAGE_ERROR } });
    expect(created).toMatchObject({ ok: false, error: { code: ERROR_CODES.STORAGE_ERROR } });
    expect(JSON.parse(raw) as unknown).toMatchObject({ version: 1 });
    expect(leftovers).toEqual([]);
    await rm(directory, { force: true, recursive: true });
  });

  it("blocks mutations when the audit sink fails and keeps audit details minimal", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gestion-repo-"));
    const seen: Array<Record<string, unknown>> = [];
    const { filePath, repository } = await createRepository(directory, "items.json", undefined, (event) => {
      seen.push(event as unknown as Record<string, unknown>);
    });

    const created = await repository.create(ownerA, { id: "e_2", label: "Beta", ownerId: "u_a" });
    const failing = new EntityRepository({
      auditSink: () => {
        throw new Error("audit unavailable");
      },
      entitySchema: testEntitySchema,
      store: new JsonStore(filePath, collectionSchema)
    });
    const blocked = await failing.create(ownerA, { id: "e_3", label: "Gamma", ownerId: "u_a" });
    const raw = await readFile(filePath, "utf8");

    expect(created).toMatchObject({ ok: true });
    expect(blocked).toMatchObject({ ok: false, error: { code: ERROR_CODES.AUDIT_FAILURE } });
    expect(JSON.parse(raw) as unknown).toMatchObject({ items: [{ id: "e_1" }, { id: "e_2" }], version: 2 });
    expect(Object.keys(seen[0] as Record<string, unknown>).sort()).toEqual(
      ["action", "actorId", "entityId", "version"]
    );
    await rm(directory, { force: true, recursive: true });
  });
});
