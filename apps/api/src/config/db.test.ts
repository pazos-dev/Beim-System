import { beforeEach, describe, expect, it, vi } from "vitest";

// The pool must read a DATABASE_URL before db.ts evaluates, and "pg" is
// replaced by an in-memory fake so no TCP connection is ever attempted.
process.env.DATABASE_URL = "postgres://beim@127.0.0.1:5432/beim_api_test";

const queryLog: string[] = [];
const hooks = {
  fail: false as false | "begin" | "work" | "rollback"
};

vi.mock("pg", () => {
  const fakeClient = {
    query: vi.fn(async (text: string) => {
      queryLog.push(text);
      if (hooks.fail === "begin" && text === "BEGIN") throw new Error("begin failed");
      if (hooks.fail === "work" && !["BEGIN", "COMMIT", "ROLLBACK"].includes(text))
        throw new Error("work failed");
      if (hooks.fail === "rollback" && text === "ROLLBACK") throw new Error("rollback failed");
      return { rows: [] };
    }),
    release: vi.fn(async () => {
      queryLog.push("RELEASE");
    })
  };

  class FakePool {
    connect(): Promise<typeof fakeClient> {
      return Promise.resolve(fakeClient);
    }

    query(text: string, _params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }> {
      queryLog.push(text);
      return Promise.resolve({ rows: [{ id: 1 }], rowCount: 1 });
    }

    end(): Promise<void> {
      return Promise.resolve(undefined);
    }
  }

  return { Pool: FakePool };
});

const { pool, query, withTransaction } = await import("./db.js");

beforeEach(() => {
  queryLog.length = 0;
  hooks.fail = false;
});

describe("withTransaction", () => {
  it("runs the work between BEGIN and COMMIT and releases the client once", async () => {
    const result = await withTransaction(async (client) => {
      await client.query("INSERT INTO t (id) VALUES ($1)", [1]);
      return "committed";
    });

    expect(result).toBe("committed");
    expect(queryLog).toEqual(["BEGIN", "INSERT INTO t (id) VALUES ($1)", "COMMIT", "RELEASE"]);
    expect(queryLog.filter((entry) => entry === "COMMIT")).toHaveLength(1);
    expect(queryLog.filter((entry) => entry === "RELEASE")).toHaveLength(1);
  });

  it("rolls back and rethrows when the work function rejects", async () => {
    await expect(
      withTransaction(async (client) => {
        await client.query("INSERT INTO t (id) VALUES ($1)", [1]);
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(queryLog).toEqual(["BEGIN", "INSERT INTO t (id) VALUES ($1)", "ROLLBACK", "RELEASE"]);
  });

  it("rolls back a query failure raised inside the transaction", async () => {
    hooks.fail = "work";

    await expect(
      withTransaction(async (client) => {
        await client.query("UPDATE products SET stock = stock - 1 WHERE id = $1", [7]);
      })
    ).rejects.toThrow("work failed");

    expect(queryLog).toEqual([
      "BEGIN",
      "UPDATE products SET stock = stock - 1 WHERE id = $1",
      "ROLLBACK",
      "RELEASE"
    ]);
  });

  it("rethrows the original error even when ROLLBACK itself fails", async () => {
    hooks.fail = "rollback";

    await expect(
      withTransaction(async (client) => {
        await client.query("INSERT INTO t (id) VALUES ($1)", [1]);
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(queryLog).toEqual(["BEGIN", "INSERT INTO t (id) VALUES ($1)", "ROLLBACK", "RELEASE"]);
  });

  it("still releases the client when BEGIN itself fails", async () => {
    hooks.fail = "begin";

    await expect(withTransaction(async () => "unreachable")).rejects.toThrow("begin failed");
    expect(queryLog).toEqual(["BEGIN", "RELEASE"]);
  });
});

describe("query helper", () => {
  it("forwards text and params to the pool and returns typed rows", async () => {
    const result = await query<{ id: number }>("SELECT 1 AS id", [42]);
    expect(result.rows).toEqual([{ id: 1 }]);
    expect(queryLog).toEqual(["SELECT 1 AS id"]);
  });
});

describe("pool", () => {
  it("is exported and exposes the pg Pool lifecycle surface", () => {
    expect(typeof pool.connect).toBe("function");
    expect(typeof pool.query).toBe("function");
    expect(typeof pool.end).toBe("function");
  });
});