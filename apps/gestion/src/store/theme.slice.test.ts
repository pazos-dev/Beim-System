import { afterEach, describe, expect, it, vi } from "vitest";

import { LEGACY_THEME_STORAGE_KEY, THEME_STORAGE_KEY } from "./theme.slice";

function mockStorage(initial: Record<string, string> = {}): {
  data: Map<string, string>;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
} {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    }
  };
}

function stubWindowWith(storage: {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}): void {
  vi.stubGlobal("window", { localStorage: storage });
}

async function freshThemeStore(): Promise<typeof import("./theme.slice").useThemeStore> {
  vi.resetModules();
  const module = await import("./theme.slice");
  return module.useThemeStore;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("theme slice", () => {
  it("defaults to sistema without a window (SSR)", async () => {
    const useThemeStore = await freshThemeStore();

    expect(useThemeStore.getState().theme).toBe("sistema");
  });

  it("round-trips set theme across reloads", async () => {
    const storage = mockStorage();
    stubWindowWith(storage);
    const first = await freshThemeStore();
    first.getState().setTheme("oscuro");

    const second = await freshThemeStore();

    expect(second.getState().theme).toBe("oscuro");
    expect(storage.getItem(THEME_STORAGE_KEY)).toContain("oscuro");
  });

  it("migrates the legacy gestion-theme string on first run", async () => {
    const storage = mockStorage({ [LEGACY_THEME_STORAGE_KEY]: "claro" });
    stubWindowWith(storage);

    const useThemeStore = await freshThemeStore();

    expect(useThemeStore.getState().theme).toBe("claro");
  });

  it("falls back to sistema for unknown stored values", async () => {
    const storage = mockStorage({ [THEME_STORAGE_KEY]: JSON.stringify({ state: { theme: "neon" }, version: 1 }) });
    stubWindowWith(storage);

    const useThemeStore = await freshThemeStore();

    expect(useThemeStore.getState().theme).toBe("sistema");
  });

  it("survives session logout", async () => {
    const storage = mockStorage();
    stubWindowWith(storage);
    const useThemeStore = await freshThemeStore();
    useThemeStore.getState().setTheme("oscuro");
    const { useSessionStore } = await import("./session.slice");
    useSessionStore.getState().setUser({ displayName: "Ada", id: "u_1", role: "vendedor", username: "ada" });

    useSessionStore.getState().clearUser();

    expect(useThemeStore.getState().theme).toBe("oscuro");
    expect(storage.getItem(THEME_STORAGE_KEY)).toContain("oscuro");
  });

  it("never throws when storage fails", async () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("denied");
        },
        removeItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        }
      }
    });
    const useThemeStore = await freshThemeStore();

    expect(() => useThemeStore.getState().setTheme("oscuro")).not.toThrow();
    expect(useThemeStore.getState().theme).toBe("oscuro");
  });
});
