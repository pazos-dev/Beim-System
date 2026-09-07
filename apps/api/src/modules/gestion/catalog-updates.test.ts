/**
 * HTTP-layer tests for catalog update/deactivate (issue #87).
 *
 * Single deactivation path: PUT with optional `active` (no separate disable
 * endpoint). Clients reuse the users approve/disable flow (is_approved +
 * session revocation); services/categories/purchases map `active` to their
 * stored flag. Lists exclude inactive rows by default (`active` query:
 * "true"/"false"/"all"). Runs against beim_api_test (see src/db/testDb.ts).
 */
import type { Express } from "express";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { expect, it } from "vitest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";

setupTestDatabase();

// Dynamic imports AFTER setupTestDatabase() set DATABASE_URL at module top.
const { createApp } = await import("../../app.js");

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
const ADMIN = ["administrador"];
const CLIENT_ROLE = ["cliente"];
const UNKNOWN_ID = "00000000-0000-0000-0000-000000000000";

async function createClient(name = "Cliente Update"): Promise<string> {
  const email = `catalog-${randomUUID().slice(0, 8)}@beim.test`;
  const res = await request(appWith({ roles: OPERATOR }))
    .post("/api/v1/clients")
    .send({ name, email, phone: "099000001" });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

async function createService(name = "Servicio Update"): Promise<string> {
  const res = await request(appWith({ roles: ADMIN }))
    .post("/api/v1/services")
    .send({ name, data: { durationMin: 30 } });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

async function createCategory(suffix: string): Promise<string> {
  const id = `cup-cat-${suffix}`;
  const res = await request(appWith({ roles: ADMIN }))
    .post("/api/v1/categories")
    .send({ id, name: "Categoria Update", code: "CUP" });
  expect(res.status).toBe(201);
  return id;
}

async function createPurchase(supplier = "Proveedor Update"): Promise<string> {
  const res = await request(appWith({ roles: ADMIN }))
    .post("/api/v1/purchases")
    .send({ supplierName: supplier, data: { invoice: "C-1" } });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

describePg("catalog updates — clients", () => {
  it("operator updates name/email/phone partially (200) and GET by id reflects it", async () => {
    const id = await createClient();
    // New operator-created clients start unapproved: approve to exercise the flow.
    const approved = await request(appWith({ roles: OPERATOR })).put(`/api/v1/clients/${id}`).send({
      active: true
    });
    expect(approved.status).toBe(200);
    expect(approved.body.data.isApproved).toBe(true);

    const updated = await request(appWith({ roles: OPERATOR })).put(`/api/v1/clients/${id}`).send({
      name: "Cliente Renombrado",
      phone: "099000002"
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ id, name: "Cliente Renombrado", phone: "099000002" });

    const byId = await request(appWith({ roles: OPERATOR })).get(`/api/v1/clients/${id}`);
    expect(byId.status).toBe(200);
    expect(byId.body.data.name).toBe("Cliente Renombrado");
  });

  it("active:false disables (hidden from default list, shown with active=false/all); active:true re-enables", async () => {
    const id = await createClient("Cliente Activo");
    await request(appWith({ roles: OPERATOR })).put(`/api/v1/clients/${id}`).send({ active: true });

    const visible = await request(appWith({ roles: OPERATOR })).get("/api/v1/clients");
    expect(visible.status).toBe(200);
    expect(visible.body.data.some((c: { id: string }) => c.id === id)).toBe(true);

    const disabled = await request(appWith({ roles: OPERATOR }))
      .put(`/api/v1/clients/${id}`)
      .send({ active: false });
    expect(disabled.status).toBe(200);
    expect(disabled.body.data.isApproved).toBe(false);

    const hidden = await request(appWith({ roles: OPERATOR })).get("/api/v1/clients");
    expect(hidden.body.data.some((c: { id: string }) => c.id === id)).toBe(false);

    const inactiveOnly = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/clients")
      .query({ active: "false" });
    expect(inactiveOnly.status).toBe(200);
    expect(inactiveOnly.body.data.some((c: { id: string }) => c.id === id)).toBe(true);

    const all = await request(appWith({ roles: OPERATOR })).get("/api/v1/clients").query({ active: "all" });
    expect(all.status).toBe(200);
    expect(all.body.data.some((c: { id: string }) => c.id === id)).toBe(true);

    const reenabled = await request(appWith({ roles: OPERATOR }))
      .put(`/api/v1/clients/${id}`)
      .send({ active: true });
    expect(reenabled.status).toBe(200);
    expect(reenabled.body.data.isApproved).toBe(true);

    const back = await request(appWith({ roles: OPERATOR })).get("/api/v1/clients");
    expect(back.body.data.some((c: { id: string }) => c.id === id)).toBe(true);
  });
});

describePg("catalog updates — services", () => {
  it("admin updates name partially (200) and GET by id reflects it", async () => {
    const id = await createService();
    const updated = await request(appWith({ roles: ADMIN })).put(`/api/v1/services/${id}`).send({
      name: "Servicio Renombrado"
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ id, name: "Servicio Renombrado" });

    const byId = await request(appWith({ roles: OPERATOR })).get(`/api/v1/services/${id}`);
    expect(byId.status).toBe(200);
    expect(byId.body.data.name).toBe("Servicio Renombrado");
  });

  it("active:false hides from default list (shown with active=false/all); active:true restores", async () => {
    const id = await createService("Servicio Visible");

    const disabled = await request(appWith({ roles: ADMIN }))
      .put(`/api/v1/services/${id}`)
      .send({ active: false });
    expect(disabled.status).toBe(200);
    expect(disabled.body.data.active).toBe(false);

    const hidden = await request(appWith({ roles: OPERATOR })).get("/api/v1/services");
    expect(hidden.body.data.some((s: { id: string }) => s.id === id)).toBe(false);

    const inactiveOnly = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/services")
      .query({ active: "false" });
    expect(inactiveOnly.body.data.some((s: { id: string }) => s.id === id)).toBe(true);

    const all = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/services")
      .query({ active: "all" });
    expect(all.body.data.some((s: { id: string }) => s.id === id)).toBe(true);

    const reenabled = await request(appWith({ roles: ADMIN }))
      .put(`/api/v1/services/${id}`)
      .send({ active: true });
    expect(reenabled.body.data.active).toBe(true);

    const back = await request(appWith({ roles: OPERATOR })).get("/api/v1/services");
    expect(back.body.data.some((s: { id: string }) => s.id === id)).toBe(true);
  });
});

describePg("catalog updates — categories", () => {
  it("admin updates name/code partially (200) and GET by id reflects it", async () => {
    const id = await createCategory(randomUUID().slice(0, 8));
    const updated = await request(appWith({ roles: ADMIN })).put(`/api/v1/categories/${id}`).send({
      name: "Categoria Renombrada",
      code: "REN"
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ id, name: "Categoria Renombrada", code: "REN" });

    const byId = await request(appWith({ roles: OPERATOR })).get(`/api/v1/categories/${id}`);
    expect(byId.status).toBe(200);
    expect(byId.body.data.name).toBe("Categoria Renombrada");
  });

  it("active:false hides from default list (shown with active=false/all); active:true restores", async () => {
    const id = await createCategory(randomUUID().slice(0, 8));

    const disabled = await request(appWith({ roles: ADMIN }))
      .put(`/api/v1/categories/${id}`)
      .send({ active: false });
    expect(disabled.status).toBe(200);
    expect(disabled.body.data.active).toBe(false);

    const hidden = await request(appWith({ roles: OPERATOR })).get("/api/v1/categories");
    expect(hidden.body.data.some((c: { id: string }) => c.id === id)).toBe(false);

    const inactiveOnly = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/categories")
      .query({ active: "false" });
    expect(inactiveOnly.body.data.some((c: { id: string }) => c.id === id)).toBe(true);

    const all = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/categories")
      .query({ active: "all" });
    expect(all.body.data.some((c: { id: string }) => c.id === id)).toBe(true);

    const reenabled = await request(appWith({ roles: ADMIN }))
      .put(`/api/v1/categories/${id}`)
      .send({ active: true });
    expect(reenabled.body.data.active).toBe(true);

    const back = await request(appWith({ roles: OPERATOR })).get("/api/v1/categories");
    expect(back.body.data.some((c: { id: string }) => c.id === id)).toBe(true);
  });
});

describePg("catalog updates — purchases", () => {
  it("admin updates supplierName partially (200) and GET by id reflects it", async () => {
    const id = await createPurchase();
    const updated = await request(appWith({ roles: ADMIN }))
      .put(`/api/v1/purchases/${id}`)
      .send({ supplierName: "Proveedor Renombrado" });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ id, supplierName: "Proveedor Renombrado" });

    const byId = await request(appWith({ roles: OPERATOR })).get(`/api/v1/purchases/${id}`);
    expect(byId.status).toBe(200);
    expect(byId.body.data.supplierName).toBe("Proveedor Renombrado");
  });

  it("active:false hides from default list (shown with active=false/all); active:true restores", async () => {
    const id = await createPurchase("Proveedor Visible");

    const disabled = await request(appWith({ roles: ADMIN }))
      .put(`/api/v1/purchases/${id}`)
      .send({ active: false });
    expect(disabled.status).toBe(200);
    expect(disabled.body.data.active).toBe(false);

    const hidden = await request(appWith({ roles: OPERATOR })).get("/api/v1/purchases");
    expect(hidden.body.data.some((p: { id: string }) => p.id === id)).toBe(false);

    const inactiveOnly = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/purchases")
      .query({ active: "false" });
    expect(inactiveOnly.body.data.some((p: { id: string }) => p.id === id)).toBe(true);

    const all = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/purchases")
      .query({ active: "all" });
    expect(all.body.data.some((p: { id: string }) => p.id === id)).toBe(true);

    const reenabled = await request(appWith({ roles: ADMIN }))
      .put(`/api/v1/purchases/${id}`)
      .send({ active: true });
    expect(reenabled.body.data.active).toBe(true);

    const back = await request(appWith({ roles: OPERATOR })).get("/api/v1/purchases");
    expect(back.body.data.some((p: { id: string }) => p.id === id)).toBe(true);
  });
});

describePg("catalog updates — permission matrix", () => {
  it("operator PUT clients OK but 403 on PUT services/categories/purchases", async () => {
    const clientId = await createClient("Cliente Matriz");
    const serviceId = await createService("Servicio Matriz");
    const categoryId = await createCategory(randomUUID().slice(0, 8));
    const purchaseId = await createPurchase("Proveedor Matriz");

    expect(
      (await request(appWith({ roles: OPERATOR })).put(`/api/v1/clients/${clientId}`).send({ name: "Ok" }))
        .status
    ).toBe(200);
    expect(
      (await request(appWith({ roles: OPERATOR })).put(`/api/v1/services/${serviceId}`).send({ name: "No" }))
        .status
    ).toBe(403);
    expect(
      (await request(appWith({ roles: OPERATOR })).put(`/api/v1/categories/${categoryId}`).send({ name: "No" }))
        .status
    ).toBe(403);
    expect(
      (
        await request(appWith({ roles: OPERATOR }))
          .put(`/api/v1/purchases/${purchaseId}`)
          .send({ supplierName: "No" })
      ).status
    ).toBe(403);
  });

  it("anonymous caller sees 404 on all four PUTs", async () => {
    const serviceId = await createService("Servicio Anonimo");
    const categoryId = await createCategory(randomUUID().slice(0, 8));
    const purchaseId = await createPurchase("Proveedor Anonimo");
    const clientId = await createClient("Cliente Anonimo");

    expect((await request(appWith()).put(`/api/v1/clients/${clientId}`).send({ name: "No" })).status).toBe(
      404
    );
    expect((await request(appWith()).put(`/api/v1/services/${serviceId}`).send({ name: "No" })).status).toBe(
      404
    );
    expect(
      (await request(appWith()).put(`/api/v1/categories/${categoryId}`).send({ name: "No" })).status
    ).toBe(404);
    expect(
      (await request(appWith()).put(`/api/v1/purchases/${purchaseId}`).send({ supplierName: "No" })).status
    ).toBe(404);
  });

  it("cliente role is forbidden (403) on all four PUTs", async () => {
    const serviceId = await createService("Servicio Cliente");
    const categoryId = await createCategory(randomUUID().slice(0, 8));
    const purchaseId = await createPurchase("Proveedor Cliente");
    const clientId = await createClient("Cliente Cliente");

    expect(
      (await request(appWith({ roles: CLIENT_ROLE })).put(`/api/v1/clients/${clientId}`).send({ name: "No" }))
        .status
    ).toBe(403);
    expect(
      (await request(appWith({ roles: CLIENT_ROLE })).put(`/api/v1/services/${serviceId}`).send({ name: "No" }))
        .status
    ).toBe(403);
    expect(
      (await request(appWith({ roles: CLIENT_ROLE })).put(`/api/v1/categories/${categoryId}`).send({ name: "No" }))
        .status
    ).toBe(403);
    expect(
      (
        await request(appWith({ roles: CLIENT_ROLE }))
          .put(`/api/v1/purchases/${purchaseId}`)
          .send({ supplierName: "No" })
      ).status
    ).toBe(403);
  });
});

describePg("catalog updates — errors", () => {
  it("unknown uuid answers 404 on all four PUTs; malformed uuid answers 422", async () => {
    expect(
      (await request(appWith({ roles: OPERATOR })).put(`/api/v1/clients/${UNKNOWN_ID}`).send({ name: "No" }))
        .status
    ).toBe(404);
    expect(
      (await request(appWith({ roles: ADMIN })).put(`/api/v1/services/${UNKNOWN_ID}`).send({ name: "No" }))
        .status
    ).toBe(404);
    expect(
      (await request(appWith({ roles: ADMIN })).put(`/api/v1/categories/no-existe-87`).send({ name: "No" }))
        .status
    ).toBe(404);
    expect(
      (
        await request(appWith({ roles: ADMIN }))
          .put(`/api/v1/purchases/${UNKNOWN_ID}`)
          .send({ supplierName: "No" })
      ).status
    ).toBe(404);

    const malformed = await request(appWith({ roles: OPERATOR }))
      .put("/api/v1/clients/not-a-uuid")
      .send({ name: "No" });
    expect(malformed.status).toBe(422);
    expect(malformed.body).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("validation 422: invalid email, garbage active body and garbage active query", async () => {
    const clientId = await createClient("Cliente Valido");
    const serviceId = await createService("Servicio Valido");

    const badEmail = await request(appWith({ roles: OPERATOR }))
      .put(`/api/v1/clients/${clientId}`)
      .send({ email: "no-es-email" });
    expect(badEmail.status).toBe(422);
    expect(badEmail.body).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });

    const badActiveBody = await request(appWith({ roles: ADMIN }))
      .put(`/api/v1/services/${serviceId}`)
      .send({ active: "basura" });
    expect(badActiveBody.status).toBe(422);

    const badActiveQuery = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/services")
      .query({ active: "basura" });
    expect(badActiveQuery.status).toBe(422);
    expect(badActiveQuery.body).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });
});
