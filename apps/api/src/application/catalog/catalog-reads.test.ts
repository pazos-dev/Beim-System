import { describe, expect, it, vi } from "vitest";
import type { CatalogReadsPort } from "./catalog-reads.js";
import { makeCatalogReadsHandlers } from "./catalog-reads.js";

function basePort(): CatalogReadsPort {
  return {
    listPublished: vi.fn(async (query: unknown) => ({ query })),
    getPublishedById: vi.fn(async (id: unknown) => ({ id })),
    listSlides: vi.fn(async () => [{ id: "slide-1" }])
  };
}

describe("catalog reads handlers (thin delegation over the read port)", () => {
  it("forwards the list query to the reader untouched", async () => {
    const port = basePort();
    await makeCatalogReadsHandlers(port).listPublished({ page: 2, limit: 10, search: "taladro" });
    expect(port.listPublished).toHaveBeenCalledWith({ page: 2, limit: 10, search: "taladro" });
  });

  it("forwards get-by-id and bubbles null (router owns the 404)", async () => {
    const port = basePort();
    port.getPublishedById = vi.fn(async () => null);
    await expect(makeCatalogReadsHandlers(port).getPublishedById("prod-1")).resolves.toBeNull();
  });

  it("bubbles reader failures by identity (no error remap)", async () => {
    const failure = new Error("db down");
    const port = basePort();
    port.listSlides = vi.fn(async () => {
      throw failure;
    });
    await expect(makeCatalogReadsHandlers(port).listSlides()).rejects.toBe(failure);
  });
});
