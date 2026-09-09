import { describe, expect, it } from "vitest";

import { JsonOrdenRepository } from "./json-orden-repository";
import type { OrdenRepositoryPort } from "./orden-port";

describe("OrdenRepositoryPort contract", () => {
  it("JsonOrdenRepository satisfies the port surface", () => {
    const port: OrdenRepositoryPort = new JsonOrdenRepository("/tmp/gestion-orden-port-check");
    expect(typeof port.list).toBe("function");
    expect(typeof port.getById).toBe("function");
    expect(typeof port.create).toBe("function");
  });
});
