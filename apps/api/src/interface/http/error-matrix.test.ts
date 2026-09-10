import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { AppError } from "../../errors/AppError.js";
import { ERROR_CODES } from "../../errors/taxonomy.js";
import { interfaceErrorHandler, renderAntiEnumerationCreated, renderError } from "./errorHandler.js";
import { paginationSchema } from "./dtos/pagination.js";

/** Builds a minimal app whose single route throws the given error. */
function appThrowing(error: unknown): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.get("/probe", (_req, _res, next) => next(error));
  app.use(interfaceErrorHandler);
  return app;
}

describe("interface error matrix (frozen contract)", () => {
  it("renders 401 AUTHENTICATION_REQUIRED with the frozen envelope", async () => {
    const { status, body } = renderError(
      new AppError("AUTHENTICATION_REQUIRED", "Autenticación requerida", ERROR_CODES.AUTHENTICATION_REQUIRED)
    );
    expect(status).toBe(401);
    expect(body).toEqual({
      ok: false,
      error: { code: "AUTHENTICATION_REQUIRED", message: "Autenticación requerida" }
    });
    const res = await request(
      appThrowing(
        new AppError("AUTHENTICATION_REQUIRED", "Autenticación requerida", ERROR_CODES.AUTHENTICATION_REQUIRED)
      )
    ).get("/probe");
    expect(res.status).toBe(401);
    expect(res.body).toEqual(body);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("renders 403 FORBIDDEN with the frozen envelope", async () => {
    const { status, body } = renderError(
      new AppError("FORBIDDEN", "No tiene permisos para realizar esta operación", ERROR_CODES.FORBIDDEN)
    );
    expect(status).toBe(403);
    expect(body).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "No tiene permisos para realizar esta operación" }
    });
    const res = await request(
      appThrowing(new AppError("FORBIDDEN", "No tiene permisos para realizar esta operación", ERROR_CODES.FORBIDDEN))
    ).get("/probe");
    expect(res.status).toBe(403);
    expect(res.body).toEqual(body);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("renders 404 NOT_FOUND_OR_FORBIDDEN with the frozen envelope", async () => {
    const { status, body } = renderError(
      new AppError("NOT_FOUND_OR_FORBIDDEN", "Recurso no encontrado", ERROR_CODES.NOT_FOUND_OR_FORBIDDEN)
    );
    expect(status).toBe(404);
    expect(body).toEqual({
      ok: false,
      error: { code: "NOT_FOUND_OR_FORBIDDEN", message: "Recurso no encontrado" }
    });
    const res = await request(
      appThrowing(
        new AppError("NOT_FOUND_OR_FORBIDDEN", "Recurso no encontrado", ERROR_CODES.NOT_FOUND_OR_FORBIDDEN)
      )
    ).get("/probe");
    expect(res.status).toBe(404);
    expect(res.body).toEqual(body);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("renders 422 VALIDATION_ERROR with field-level details", async () => {
    const details = [{ path: "limit", message: "Number must be less than or equal to 100" }];
    const { status, body } = renderError(
      new AppError("VALIDATION_ERROR", "Datos de entrada inválidos", ERROR_CODES.VALIDATION_ERROR, details)
    );
    expect(status).toBe(422);
    expect(body).toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Datos de entrada inválidos", details }
    });
    const res = await request(
      appThrowing(new AppError("VALIDATION_ERROR", "Datos de entrada inválidos", ERROR_CODES.VALIDATION_ERROR, details))
    ).get("/probe");
    expect(res.status).toBe(422);
    expect(res.body).toEqual(body);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("renders 429 TOO_MANY_REQUESTS with the frozen envelope", async () => {
    const { status, body } = renderError(
      new AppError("TOO_MANY_REQUESTS", "Demasiadas solicitudes", ERROR_CODES.TOO_MANY_REQUESTS)
    );
    expect(status).toBe(429);
    expect(body).toEqual({
      ok: false,
      error: { code: "TOO_MANY_REQUESTS", message: "Demasiadas solicitudes" }
    });
    const res = await request(
      appThrowing(new AppError("TOO_MANY_REQUESTS", "Demasiadas solicitudes", ERROR_CODES.TOO_MANY_REQUESTS))
    ).get("/probe");
    expect(res.status).toBe(429);
    expect(res.body).toEqual(body);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("renders 413 PAYLOAD_TOO_LARGE with the frozen envelope", async () => {
    const { status, body } = renderError(
      new AppError("PAYLOAD_TOO_LARGE", "Archivo demasiado grande", ERROR_CODES.PAYLOAD_TOO_LARGE)
    );
    expect(status).toBe(413);
    expect(body).toEqual({
      ok: false,
      error: { code: "PAYLOAD_TOO_LARGE", message: "Archivo demasiado grande" }
    });
    const res = await request(
      appThrowing(new AppError("PAYLOAD_TOO_LARGE", "Archivo demasiado grande", ERROR_CODES.PAYLOAD_TOO_LARGE))
    ).get("/probe");
    expect(res.status).toBe(413);
    expect(res.body).toEqual(body);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("renders 415 UNSUPPORTED_MEDIA_TYPE with the frozen envelope", async () => {
    const { status, body } = renderError(
      new AppError("UNSUPPORTED_MEDIA_TYPE", "Tipo de medio no soportado", ERROR_CODES.UNSUPPORTED_MEDIA_TYPE)
    );
    expect(status).toBe(415);
    expect(body).toEqual({
      ok: false,
      error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Tipo de medio no soportado" }
    });
    const res = await request(
      appThrowing(
        new AppError("UNSUPPORTED_MEDIA_TYPE", "Tipo de medio no soportado", ERROR_CODES.UNSUPPORTED_MEDIA_TYPE)
      )
    ).get("/probe");
    expect(res.status).toBe(415);
    expect(res.body).toEqual(body);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("renders unknown errors as 500 INTERNAL_ERROR without leaking the cause", async () => {
    const { status, body } = renderError(new Error("secreto de conexión pg://internal"));
    expect(status).toBe(500);
    expect(body).toEqual({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Error interno del servidor" }
    });
    const res = await request(appThrowing(new Error("secreto de conexión pg://internal"))).get("/probe");
    expect(res.status).toBe(500);
    expect(res.body).toEqual(body);
    expect(JSON.stringify(res.body)).not.toContain("secreto");
  });

  it("renders register duplicates as 201 anti-enumeration with a null user", () => {
    const { status, body } = renderAntiEnumerationCreated();
    expect(status).toBe(201);
    expect(body).toEqual({ ok: true, data: { user: null } });
  });
});

describe("interface pagination DTO (strict edge validation)", () => {
  it("coerces page/limit strings and applies defaults 1/20", () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(paginationSchema.parse({ page: "2", limit: "10" })).toEqual({ page: 2, limit: 10 });
  });

  it("rejects page 0 and limit 500 (bounds 1..100)", () => {
    expect(paginationSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(paginationSchema.safeParse({ limit: 500 }).success).toBe(false);
    expect(paginationSchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    expect(paginationSchema.safeParse({ page: 1, limit: 20, unknown: "x" }).success).toBe(false);
  });
});
