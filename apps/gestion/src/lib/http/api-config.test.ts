import { describe, expect, it } from "vitest";

import { DEFAULT_API_BASE_URL, joinApiPath, resolveApiBaseUrl } from "./api-config";

describe("resolveApiBaseUrl", () => {
  it("defaults to the local backend when no env is set", () => {
    expect(resolveApiBaseUrl({})).toBe("http://localhost:4000/api/v1");
    expect(DEFAULT_API_BASE_URL).toBe("http://localhost:4000/api/v1");
  });

  it("prefers NEXT_PUBLIC_BEIM_API_BASE_URL over BEIM_API_BASE_URL", () => {
    expect(
      resolveApiBaseUrl({
        BEIM_API_BASE_URL: "http://srv:4000/api/v1",
        NEXT_PUBLIC_BEIM_API_BASE_URL: "https://api.example.com/api/v1/"
      })
    ).toBe("https://api.example.com/api/v1");
  });

  it("falls back to BEIM_API_BASE_URL and strips trailing slashes", () => {
    expect(resolveApiBaseUrl({ BEIM_API_BASE_URL: "http://srv:4000/api/v1///" })).toBe(
      "http://srv:4000/api/v1"
    );
  });

  it("trims whitespace and treats empty strings as unset", () => {
    expect(
      resolveApiBaseUrl({
        BEIM_API_BASE_URL: "   ",
        NEXT_PUBLIC_BEIM_API_BASE_URL: "  http://srv:4000/api/v1/  "
      })
    ).toBe("http://srv:4000/api/v1");
    expect(resolveApiBaseUrl({ NEXT_PUBLIC_BEIM_API_BASE_URL: "" })).toBe(DEFAULT_API_BASE_URL);
  });
});

describe("joinApiPath", () => {
  it("joins base and path with exactly one separator", () => {
    expect(joinApiPath("http://localhost:4000/api/v1", "/clients")).toBe(
      "http://localhost:4000/api/v1/clients"
    );
    expect(joinApiPath("http://localhost:4000/api/v1/", "clients")).toBe(
      "http://localhost:4000/api/v1/clients"
    );
  });

  it("never duplicates the /api/v1 prefix", () => {
    const url = joinApiPath(DEFAULT_API_BASE_URL, "/clients");
    expect(url.match(/\/api\/v1/g)).toHaveLength(1);
  });
});
