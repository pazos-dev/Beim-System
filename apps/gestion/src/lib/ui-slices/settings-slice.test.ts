import { afterEach, describe, expect, it, vi } from "vitest";

import { THEME_STORAGE_KEY } from "./settings-slice";

function mockStorage(initial: Record<string, string> = {}): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
} {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    }
  };
}

function stubWindowWith(storage: { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void }): void {
  vi.stubGlobal("window", { localStorage: storage });
}

async function freshStore(): Promise<typeof import("../ui-store").useUiStore> {
  vi.resetModules();
  const module = await import("../ui-store");
  return module.useUiStore;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("settings slice", () => {
  it("defaults theme to sistema without a window (SSR)", async () => {
    const useUiStore = await freshStore();

    expect(useUiStore.getState().theme).toBe("sistema");
  });

  it("initializes theme from the existing gestion-theme key", async () => {
    stubWindowWith(mockStorage({ [THEME_STORAGE_KEY]: "oscuro" }));

    const useUiStore = await freshStore();

    expect(useUiStore.getState().theme).toBe("oscuro");
  });

  it("falls back to sistema for an unknown stored value", async () => {
    stubWindowWith(mockStorage({ [THEME_STORAGE_KEY]: "neon" }));

    const useUiStore = await freshStore();

    expect(useUiStore.getState().theme).toBe("sistema");
  });

  it("persists setTheme back to the same key", async () => {
    const storage = mockStorage();
    stubWindowWith(storage);
    const useUiStore = await freshStore();

    useUiStore.getState().setTheme("claro");

    expect(useUiStore.getState().theme).toBe("claro");
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe("claro");
  });

  it("updates theme without a window and never throws", async () => {
    const useUiStore = await freshStore();

    expect(() => useUiStore.getState().setTheme("oscuro")).not.toThrow();
    expect(useUiStore.getState().theme).toBe("oscuro");
  });
});
