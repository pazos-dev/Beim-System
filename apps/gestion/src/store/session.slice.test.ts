import { beforeEach, describe, expect, it, vi } from "vitest";

import { selectSessionRole, useSessionStore } from "./session.slice";

const ACTOR = {
  displayName: "Ada Lovelace",
  id: "u_1",
  role: "vendedor" as const,
  username: "ada"
};

function recordingStorage(): { setItem: ReturnType<typeof vi.fn>; getItem: (key: string) => null; removeItem: ReturnType<typeof vi.fn> } {
  return {
    getItem: () => null,
    removeItem: vi.fn(),
    setItem: vi.fn()
  };
}

beforeEach(() => {
  useSessionStore.setState({ actor: null });
  vi.unstubAllGlobals();
});

describe("session slice", () => {
  it("defaults actor to null", () => {
    expect(useSessionStore.getState().actor).toBeNull();
    expect(selectSessionRole(useSessionStore.getState())).toBeUndefined();
  });

  it("stores the actor and exposes its role via selector", () => {
    useSessionStore.getState().setUser(ACTOR);

    expect(useSessionStore.getState().actor).toEqual(ACTOR);
    expect(selectSessionRole(useSessionStore.getState())).toBe("vendedor");
  });

  it("clears the actor on logout without touching storage", () => {
    const storage = recordingStorage();
    vi.stubGlobal("window", { localStorage: storage });
    useSessionStore.getState().setUser(ACTOR);

    useSessionStore.getState().clearUser();

    expect(useSessionStore.getState().actor).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });
});
