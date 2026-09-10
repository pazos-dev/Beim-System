import { describe, expect, it, vi } from "vitest";
import type { AuditReader } from "./audit.js";
import { DEFAULT_LIMIT, DEFAULT_PAGE, MAX_LIMIT, makeAuditHandlers } from "./audit.js";

const FILTER = {
  action: "order.create",
  actorUserId: "11111111-1111-4111-8111-111111111111",
  from: "2026-08-11",
  to: "2026-09-09"
};

function baseReader(): AuditReader {
  return {
    listAudits: vi.fn(async (query: unknown) => ({ query }))
  };
}

describe("audit handlers (thin delegation over the read port)", () => {
  it("forwards filters to the reader with default pagination", async () => {
    const reader = baseReader();
    await makeAuditHandlers(reader).listAudits({ ...FILTER });
    expect(reader.listAudits).toHaveBeenCalledWith({ ...FILTER, page: DEFAULT_PAGE, limit: DEFAULT_LIMIT });
  });

  it("clamps page and limit to the legacy default/max contract", async () => {
    const reader = baseReader();
    const handlers = makeAuditHandlers(reader);
    await handlers.listAudits({ ...FILTER, page: 0, limit: 500 });
    expect(reader.listAudits).toHaveBeenCalledWith({ ...FILTER, page: 1, limit: MAX_LIMIT });
  });

  it("bubbles reader failures by identity (no error remap)", async () => {
    const failure = new Error("db down");
    const reader = baseReader();
    reader.listAudits = vi.fn(async () => {
      throw failure;
    });
    await expect(makeAuditHandlers(reader).listAudits({ ...FILTER })).rejects.toBe(failure);
  });
});
