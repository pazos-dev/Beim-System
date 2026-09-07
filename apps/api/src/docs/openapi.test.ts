import type { Express } from "express";
import { describe, expect, it } from "vitest";
import { OPENAPI_ROUTES } from "./openapi.js";

// Same reason as app.test.ts: createApp's module graph builds the shared Pool
// at import time, so point DATABASE_URL at the test database first. This suite
// never issues a query — it only inspects the Express route stack.
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

const { createApp } = await import("../app.js");
const { gestionRouter } = await import("../modules/gestion/router.js");
const { webshopRouter } = await import("../modules/webshop/router.js");

interface RouteSignature {
  method: string;
  path: string;
}

interface LayerLike {
  route?: { path: unknown; methods: Record<string, boolean> };
  name?: string;
  handle?: { stack?: LayerLike[] };
}

/**
 * Mounted module routers with their app.ts mount path. Matched by router
 * identity (not by parsing Express layer internals, which changed shape in
 * Express 5): an unmapped mounted router throws instead of silently passing.
 */
const MOUNTED_ROUTERS: Array<{ router: unknown; basePath: string }> = [
  { router: webshopRouter, basePath: "/api/v1" },
  { router: gestionRouter, basePath: "/api/v1" }
];

/** Top-level stack, supporting both Express 4 (app._router) and 5 (app.router). */
function appStack(app: Express): LayerLike[] {
  const holder = app as unknown as {
    router?: { stack?: LayerLike[] };
    _router?: { stack?: LayerLike[] };
  };
  const stack = holder.router?.stack ?? holder._router?.stack;
  if (stack === undefined) throw new Error("unsupported Express internals: no router stack found");
  return stack;
}

/** Recursively lists every (method, path) the app actually serves. */
function collectRoutes(stack: LayerLike[], basePath: string): RouteSignature[] {
  const out: RouteSignature[] = [];
  for (const layer of stack) {
    if (layer.route !== undefined) {
      const rawPaths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const rawPath of rawPaths) {
        if (typeof rawPath !== "string") continue;
        for (const [method, enabled] of Object.entries(layer.route.methods)) {
          if (enabled && method !== "_all") {
            out.push({ method: method.toUpperCase(), path: `${basePath}${rawPath}` });
          }
        }
      }
      continue;
    }
    if (layer.handle?.stack !== undefined) {
      const mounted = MOUNTED_ROUTERS.find((entry) => entry.router === layer.handle);
      if (mounted === undefined) {
        throw new Error(`unmapped mounted router layer (${layer.name ?? "anonymous"}): add it to MOUNTED_ROUTERS`);
      }
      out.push(...collectRoutes(layer.handle.stack, `${basePath}${mounted.basePath}`));
    }
  }
  return out;
}

/** Express ":id" → OpenAPI "{id}" so both sides share one spelling. */
function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

/** Docs endpoints serve the contract itself — they are not part of it. */
function isDocsRoute(path: string): boolean {
  return path === "/openapi.json" || path === "/docs" || path.startsWith("/docs/");
}

function realRoutes(app: Express): RouteSignature[] {
  return collectRoutes(appStack(app), "")
    .map((route) => ({ method: route.method, path: toOpenApiPath(route.path) }))
    .filter((route) => !isDocsRoute(route.path));
}

describe("openapi registry anti-drift", () => {
  it("documents every real route (a new route without docs fails here)", () => {
    const real = realRoutes(createApp());

    expect(real.length).toBeGreaterThan(0);

    const documented = new Set(OPENAPI_ROUTES.map((route) => `${route.method.toUpperCase()} ${route.path}`));
    const missing = real
      .map((route) => `${route.method} ${route.path}`)
      .filter((key) => !documented.has(key));

    expect(missing).toEqual([]);
  });

  it("documents no route that does not exist (no invented endpoints)", () => {
    const real = new Set(realRoutes(createApp()).map((route) => `${route.method} ${route.path}`));

    const invented = OPENAPI_ROUTES.map((route) => `${route.method.toUpperCase()} ${route.path}`).filter(
      (key) => !real.has(key)
    );

    expect(invented).toEqual([]);
  });

  it("serves the generated contract at GET /openapi.json without auth", async () => {
    const { default: request } = await import("supertest");
    const res = await request(createApp()).get("/openapi.json");

    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.paths["/api/v1/sales-batch"]).toBeDefined();
    expect(res.body.paths["/api/v1/orders"]).toBeDefined();
    expect(res.body.paths["/health"]).toBeDefined();
    expect(res.body.components.securitySchemes.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer"
    });
  });
});
