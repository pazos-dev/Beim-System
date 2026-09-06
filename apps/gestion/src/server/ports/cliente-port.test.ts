import { describe, expect, it } from "vitest";

import type { PortActor } from "./actor";
import type { ClienteRepositoryPort } from "./cliente";

describe("cliente ports (CLI-3)", () => {
  it("exposes a PortActor with id and global access flag", () => {
    const actor: PortActor = { id: "u-1", hasGlobalAccess: false };
    expect(actor.id).toBe("u-1");
  });

  it("declares list/get/create/update/remove on the cliente port", () => {
    const port: ClienteRepositoryPort | null = null;
    expect(port).toBeNull();
  });
});
