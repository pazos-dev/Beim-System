import { beforeEach, describe, expect, it } from "vitest";

import { useUiStore } from "../ui-store";
import type { UserActor } from "./user-slice";

const ACTOR: UserActor = {
  displayName: "Ada Lovelace",
  id: "u_1",
  role: "vendedor",
  username: "ada"
};

beforeEach(() => {
  useUiStore.setState({ actor: null });
});

describe("user slice", () => {
  it("defaults actor to null so components keep owning session state", () => {
    expect(useUiStore.getState().actor).toBeNull();
  });

  it("stores the actor provided to setUser", () => {
    useUiStore.getState().setUser(ACTOR);

    expect(useUiStore.getState().actor).toEqual(ACTOR);
  });

  it("clears the actor via clearUser", () => {
    useUiStore.getState().setUser(ACTOR);

    useUiStore.getState().clearUser();

    expect(useUiStore.getState().actor).toBeNull();
  });
});
