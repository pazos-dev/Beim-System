import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export const THEME_STORAGE_KEY = "gestion-theme-v1";
export const LEGACY_THEME_STORAGE_KEY = "gestion-theme";
export const THEME_VERSION = 1;

const THEME = {
  CLARO: "claro",
  OSCURO: "oscuro",
  SISTEMA: "sistema"
} as const;

export type Theme = (typeof THEME)[keyof typeof THEME];

export const DEFAULT_THEME: Theme = THEME.SISTEMA;

export interface ThemeSlice {
  readonly theme: Theme;
  readonly setTheme: (theme: Theme) => void;
}

function isTheme(value: unknown): value is Theme {
  return value === THEME.CLARO || value === THEME.OSCURO || value === THEME.SISTEMA;
}

function toTheme(value: unknown): Theme {
  return isTheme(value) ? value : DEFAULT_THEME;
}

interface PersistedThemeShape {
  readonly state?: { readonly theme?: unknown };
  readonly theme?: unknown;
}

function migrateTheme(persistedState: unknown): { theme: Theme } {
  if (typeof persistedState === "string") return { theme: toTheme(persistedState) };
  if (typeof persistedState === "object" && persistedState !== null) {
    const shape = persistedState as PersistedThemeShape;
    return { theme: toTheme(shape.state?.theme ?? shape.theme) };
  }
  return { theme: DEFAULT_THEME };
}

const noopStorage: StateStorage = {
  getItem: () => null,
  removeItem: () => undefined,
  setItem: () => undefined
};

function themeStorage(): StateStorage {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return noopStorage;
  const backing = window.localStorage;
  return {
    getItem: (key) => {
      try {
        const current = backing.getItem(key);
        if (current !== null) return current;
        // First-run import: v1 absent but the legacy raw string exists.
        if (key === THEME_STORAGE_KEY) {
          const legacy = backing.getItem(LEGACY_THEME_STORAGE_KEY);
          if (legacy !== null) return JSON.stringify({ state: { theme: legacy }, version: 0 });
        }
        return null;
      } catch {
        return null;
      }
    },
    removeItem: (key) => {
      try {
        backing.removeItem(key);
      } catch {
        // Visual preference only; storage failure never blocks startup.
      }
    },
    setItem: (key, value) => {
      try {
        backing.setItem(key, value);
        // The legacy key is deleted only after v1 persists.
        if (key === THEME_STORAGE_KEY) backing.removeItem(LEGACY_THEME_STORAGE_KEY);
      } catch {
        // Visual preference only; storage failure never blocks the update.
      }
    }
  };
}

export const useThemeStore = create<ThemeSlice>()(
  persist(
    (set) => ({
      setTheme: (theme) => set({ theme }),
      theme: DEFAULT_THEME
    }),
    {
      merge: (persistedState, currentState) => ({
        ...currentState,
        theme: toTheme((persistedState as { readonly theme?: unknown } | null)?.theme)
      }),
      migrate: (persistedState) => migrateTheme(persistedState),
      name: THEME_STORAGE_KEY,
      partialize: (state) => ({ theme: state.theme }),
      storage: createJSONStorage(() => themeStorage()),
      version: THEME_VERSION
    }
  )
);

export function selectPrefsTheme(state: ThemeSlice): Theme {
  return state.theme;
}

export function useThemePrefs(): Theme {
  return useThemeStore(selectPrefsTheme);
}
