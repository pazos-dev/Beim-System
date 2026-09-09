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
  useSessionStore.setState({ actor: null, token: null });
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

describe("session token (memory-only Bearer)", () => {
  it("defaults token to null", () => {
    expect(useSessionStore.getState().token).toBeNull();
  });

  it("setSession stores actor and token together", () => {
    useSessionStore.getState().setSession(ACTOR, "recorded-dev-token");

    expect(useSessionStore.getState().actor).toEqual(ACTOR);
    expect(useSessionStore.getState().token).toBe("recorded-dev-token");
    expect(selectSessionRole(useSessionStore.getState())).toBe("vendedor");
  });

  it("clearSession drops actor and token together", () => {
    useSessionStore.getState().setSession(ACTOR, "recorded-dev-token");

    useSessionStore.getState().clearSession();

    expect(useSessionStore.getState().actor).toBeNull();
    expect(useSessionStore.getState().token).toBeNull();
  });

  it("legacy clearUser is fail-closed and also drops a stale token", () => {
    useSessionStore.getState().setSession(ACTOR, "recorded-dev-token");

    useSessionStore.getState().clearUser();

    expect(useSessionStore.getState().actor).toBeNull();
    expect(useSessionStore.getState().token).toBeNull();
  });

  it("never writes the token to storage", () => {
    const storage = recordingStorage();
    vi.stubGlobal("window", { localStorage: storage });

    useSessionStore.getState().setSession(ACTOR, "recorded-dev-token");
    useSessionStore.getState().clearSession();

    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });
});
