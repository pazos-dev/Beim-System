/**
 * Clients paging tests (issue #98, breaking change).
 *
 * GET /clients now answers {items,total,page,limit} (it used to answer a
 * bare array): fixed role='cliente', name order, combinable active filter
 * (#87) + ILIKE search over name/email, page default 1, limit default 20,
 * max 100. Runs against beim_api_test (see src/db/testDb.ts).
 */
import type { Express } from "express";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { expect, it } from "vitest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";

// Point the shared Pool at the test database: this suite issues queries, and
// config/db.ts builds the Pool from DATABASE_URL at module evaluation time
// (same pattern as app.test.ts). setupTestDatabase() re-asserts it.
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

setupTestDatabase();

// Dynamic imports AFTER setupTestDatabase() set DATABASE_URL at module top.
const { createApp } = await import("../../app.js");
const { clientsService } = await import("./services/crud.js");

interface TestIdentityOptions {
  roles?: string[] | null;
}

/** createApp with an injected identity (tests stand in for the auth module). */
function appWith({ roles }: TestIdentityOptions = {}): Express {
  return createApp({
    resolveIdentity:
      roles === undefined || roles === null ? undefined : () => ({ userId: "u-test", roles })
  });
}

const OPERATOR = ["vendedor"];

async function createPagingClient(name: string, email: string): Promise<string> {
  const res = await request(appWith({ roles: OPERATOR }))
    .post("/api/v1/clients")
    .send({ name, email, phone: "099000003" });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

describePg("clients paging (issue #98)", () => {
  it("pages through 3 clients with limit 2 (page 1/2, total 3)", async () => {
    const prefix = `paging-${randomUUID().slice(0, 8)}`;
    const ids = await Promise.all([
      createPagingClient(`${prefix}-Alpha`, `${prefix}-alpha@beim.test`),
      createPagingClient(`${prefix}-Beta`, `${prefix}-beta@beim.test`),
      createPagingClient(`${prefix}-Gamma`, `${prefix}-gamma@beim.test`)
    ]);

    const page1 = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/clients")
      .query({ active: "all", search: prefix, limit: 2, page: 1 });
    expect(page1.status).toBe(200);
    expect(page1.body.data).toMatchObject({ total: 3, page: 1, limit: 2 });
    expect(page1.body.data.items).toHaveLength(2);

    const page2 = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/clients")
      .query({ active: "all", search: prefix, limit: 2, page: 2 });
    expect(page2.status).toBe(200);
    expect(page2.body.data).toMatchObject({ total: 3, page: 2, limit: 2 });
    expect(page2.body.data.items).toHaveLength(1);

    const seen = [...page1.body.data.items, ...page2.body.data.items].map((c: { id: string }) => c.id);
    expect([...seen].sort()).toEqual([...ids].sort());
  });

  it("search matches by name (case-insensitive)", async () => {
    const prefix = `pagname-${randomUUID().slice(0, 8)}`;
    const id = await createPagingClient(`${prefix}-Zeta Unico`, `${prefix}@beim.test`);

    const res = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/clients")
      .query({ active: "all", search: "zeta unico" });
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.items.some((c: { id: string }) => c.id === id)).toBe(true);
  });

  it("search matches by email", async () => {
    const prefix = `pagmail-${randomUUID().slice(0, 8)}`;
    const id = await createPagingClient(`${prefix}-Nombre`, `correo-unico-${prefix}@beim.test`);

    const res = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/clients")
      .query({ active: "all", search: `correo-unico-${prefix}` });
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.items.some((c: { id: string }) => c.id === id)).toBe(true);
  });

  it("defaults to page 1 / limit 20", async () => {
    const prefix = `pagdef-${randomUUID().slice(0, 8)}`;
    await createPagingClient(`${prefix}-Solo`, `${prefix}@beim.test`);

    const res = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/clients")
      .query({ active: "all", search: prefix });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 1, page: 1, limit: 20 });
    expect(res.body.data.items).toHaveLength(1);
  });

  it("clamps limit above 100 to 100 (service level, same contract as users list)", async () => {
    const result = await clientsService.list({ active: "all", limit: 500 });
    expect(result.limit).toBe(100);
    expect(result.page).toBe(1);
    expect(result.total).toBeGreaterThanOrEqual(result.items.length);
  });

  it("combines active with search (default hides unapproved, active=false shows them)", async () => {
    const prefix = `pagact-${randomUUID().slice(0, 8)}`;
    const approvedId = await createPagingClient(`${prefix}-Aprobado`, `${prefix}-a@beim.test`);
    const pendingId = await createPagingClient(`${prefix}-Pendiente`, `${prefix}-p@beim.test`);
    const approved = await request(appWith({ roles: OPERATOR }))
      .put(`/api/v1/clients/${approvedId}`)
      .send({ active: true });
    expect(approved.status).toBe(200);

    const def = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/clients")
      .query({ search: prefix });
    expect(def.status).toBe(200);
    expect(def.body.data.total).toBe(1);
    expect(def.body.data.items[0].id).toBe(approvedId);

    const inactive = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/clients")
      .query({ search: prefix, active: "false" });
    expect(inactive.status).toBe(200);
    expect(inactive.body.data.total).toBe(1);
    expect(inactive.body.data.items[0].id).toBe(pendingId);
  });
});
