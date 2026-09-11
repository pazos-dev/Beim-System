import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ERROR_CODES } from "../shared/errors";
import { GestionHttpClient, type GestionHttpFetch } from "./http-client";

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

interface MockResponse {
  status: number;
  body: unknown;
}

/** Records every request and answers with a configurable response, never touching the network. */
function fetchSpy(
  handler: (request: RecordedRequest) => MockResponse | Promise<MockResponse>
): { calls: RecordedRequest[]; fetchImpl: GestionHttpFetch } {
  const calls: RecordedRequest[] = [];
  const fetchImpl: GestionHttpFetch = async (url, init) => {
    const request: RecordedRequest = {
      url,
      method: init.method,
      headers: init.headers,
      body: init.body
    };
    calls.push(request);
    const response = await handler(request);
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body
    };
  };
  return { calls, fetchImpl };
}

const itemSchema = z.object({ id: z.string().min(1) });

function makeClient(fetchImpl: GestionHttpFetch): GestionHttpClient {
  return new GestionHttpClient({
    baseUrl: "http://localhost:4000/",
    token: "tok-123",
    fetchImpl
  });
}

describe("GestionHttpClient", () => {
  it("joins the base URL, uses the verb and sends the Bearer token", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [] }
    }));
    const client = makeClient(fetchImpl);

    const result = await client.request("GET", "/api/v1/clients", { dataSchema: z.array(itemSchema) });

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/clients");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.headers.Authorization).toBe("Bearer tok-123");
  });

  it("serializes the body as JSON with a Content-Type header", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: { id: "a" } }
    }));
    const client = makeClient(fetchImpl);

    await client.request("POST", "/api/v1/clients", { body: { displayName: "Maria" }, dataSchema: itemSchema });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.headers["Content-Type"]).toBe("application/json");
    expect(calls[0]?.body).toBe(JSON.stringify({ displayName: "Maria" }));
  });

  it("returns the data from a success envelope", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: { id: "a" } }
    }));
    const client = makeClient(fetchImpl);

    const result = await client.request("GET", "/api/v1/clients/a", { dataSchema: itemSchema });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ id: "a" });
  });

  it("returns the remote error code and message from an error envelope", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 409,
      body: { ok: false, error: { code: "CONFLICT", message: "Stale expectedVersion." } }
    }));
    const client = makeClient(fetchImpl);

    const result = await client.request("PATCH", "/api/v1/clients/a", {
      body: { expectedVersion: 1 }
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFLICT");
      expect(result.error.message).toBe("Stale expectedVersion.");
    }
  });

  it.each([
    [400, "VALIDATION_ERROR"],
    [401, "AUTHENTICATION_REQUIRED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND_OR_FORBIDDEN"],
    [409, "CONFLICT"],
    [422, "VALIDATION_ERROR"],
    [500, "STORAGE_ERROR"],
    [503, "DEPENDENCY_UNAVAILABLE"]
  ])("maps HTTP %s to %s when the body is not a valid envelope", async (status, code) => {
    const { fetchImpl } = fetchSpy(() => ({ status, body: { not: "an envelope" } }));
    const client = makeClient(fetchImpl);

    const result = await client.request("GET", "/api/v1/clients");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });

  it("fails closed with DEPENDENCY_UNAVAILABLE on a malformed success payload", async () => {
    const { fetchImpl } = fetchSpy(() => ({ status: 200, body: { ok: true } }));
    const client = makeClient(fetchImpl);

    const result = await client.request("GET", "/api/v1/clients");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("fails closed with DEPENDENCY_UNAVAILABLE when data does not match the schema", async () => {
    const { fetchImpl } = fetchSpy(() => ({ status: 200, body: { ok: true, data: { nope: true } } }));
    const client = makeClient(fetchImpl);

    const result = await client.request("GET", "/api/v1/clients/a", { dataSchema: itemSchema });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("fails closed with DEPENDENCY_UNAVAILABLE when the body is not JSON", async () => {
    const fetchImpl: GestionHttpFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("invalid json");
      }
    });
    const client = makeClient(fetchImpl);

    const result = await client.request("GET", "/api/v1/clients");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("fails closed with DEPENDENCY_UNAVAILABLE on network failure", async () => {
    const fetchImpl: GestionHttpFetch = async () => {
      throw new Error("connection refused");
    };
    const client = makeClient(fetchImpl);

    const result = await client.request("GET", "/api/v1/clients");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("keeps ERROR_CODES aligned with the gestion error taxonomy", () => {
    expect(ERROR_CODES.DEPENDENCY_UNAVAILABLE).toBe("DEPENDENCY_UNAVAILABLE");
    expect(ERROR_CODES.STORAGE_ERROR).toBe("STORAGE_ERROR");
  });
});
