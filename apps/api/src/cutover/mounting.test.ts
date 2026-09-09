import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { ReceiptRouterDeps } from "../interface/http/receipt/router.js";
import type { UserLegacyPort } from "./user-adapters.js";

// Same DB-free convention as src/app.test.ts: the cutover factories bind the
// legacy services (shared pool at import time), so point it at the test
// database BEFORE the dynamic imports below. This suite never issues a query.
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

const { interfaceErrorHandler } = await import("../interface/http/errorHandler.js");
const { CUTOVER_MOUNT_ENABLED, createCutoverReceiptRouter, createCutoverUserRouter, mountCutoverRouters } =
  await import("./mounting.js");

const OPERATOR = { userId: "op-1", roles: ["vendedor"] };
const ADMIN = { userId: "a1", roles: ["administrador_principal"] };

function fakeUserPort(): UserLegacyPort {
  return {
    auth: {
      login: vi.fn(async () => ({ token: "t" })),
      register: vi.fn(async () => null),
      gestionAccess: vi.fn(async () => ({ token: "t" })),
      gestionLogin: vi.fn(async () => ({ token: "t" })),
      logout: vi.fn(async () => undefined)
    },
    users: {
      listUsers: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20 })),
      approveUser: vi.fn(async () => ({})),
      setUserRole: vi.fn(async () => ({})),
      disableUser: vi.fn(async () => ({}))
    },
    gestionUsers: {
      listGestionUsers: vi.fn(async () => ({ items: [] })),
      createGestionUser: vi.fn(async () => null),
      setGestionUserRole: vi.fn(async () => ({})),
      setGestionUserActive: vi.fn(async () => ({})),
      resetGestionUserPassword: vi.fn(async () => ({}))
    }
  } as unknown as UserLegacyPort;
}

function fakeReceiptDeps(): ReceiptRouterDeps {
  return {
    nextNumber: vi.fn(async () => 7),
    listReceipts: vi.fn(async () => ({ items: [] })),
    createReceipt: vi.fn(async () => ({})),
    getReceiptById: vi.fn(async () => ({})),
    annulReceipt: vi.fn(async () => ({})),
    transitionRepairStatus: vi.fn(async () => ({})),
    getInvoicePdf: vi.fn(async () => ({ pdf: new Uint8Array([1]), receiptNumber: 7 }))
  };
}

function wiredApp(
  identity: { userId: string; roles: string[] } | null,
  path: "user" | "receipt"
): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (identity !== null) req.identity = identity;
    next();
  });
  app.use(
    "/api/v1",
    path === "user" ? createCutoverUserRouter(fakeUserPort()) : createCutoverReceiptRouter(fakeReceiptDeps())
  );
  app.use(interfaceErrorHandler);
  return app;
}

describe("cutover mounting factories (wiring only, no swap)", () => {
  it("stays disabled by default so nothing mounts in the composition root", () => {
    expect(CUTOVER_MOUNT_ENABLED).toBe(false);
    const app = express();
    expect(mountCutoverRouters(app)).toBe(false);
  });

  it("wires the user router behind its admin gate (anonymous sees 404)", async () => {
    const anonymous = await request(wiredApp(null, "user")).get("/api/v1/users");
    expect(anonymous.status).toBe(404);
    const admin = await request(wiredApp(ADMIN, "user")).get("/api/v1/users");
    expect(admin.status).toBe(200);
  });

  it("guards the guard-less receipt router with the operator gate at wiring", async () => {
    const anonymous = await request(wiredApp(null, "receipt")).get("/api/v1/receipts/next-number");
    expect(anonymous.status).toBe(404);
    const operator = await request(wiredApp(OPERATOR, "receipt")).get("/api/v1/receipts/next-number");
    expect(operator.status).toBe(200);
    expect(operator.body).toEqual({ ok: true, data: { receiptNumber: 7 } });
  });
});
