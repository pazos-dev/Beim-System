import type { StateCreator } from "zustand";

import type { UiState } from "../ui-store";

// Same key as THEME_STORAGE_KEY in components/features/ConfiguracionPanel.tsx,
// which remains the owner of DOM application (document class toggle) and the
// media-query listener. This slice only holds the value and persists it.
export const THEME_STORAGE_KEY = "gestion-theme";

export type Theme = "claro" | "oscuro" | "sistema";

export interface SettingsSlice {
  readonly theme: Theme;
  readonly setTheme: (theme: Theme) => void;
}

const DEFAULT_THEME: Theme = "sistema";

function isTheme(value: unknown): value is Theme {
  return value === "claro" || value === "oscuro" || value === "sistema";
}

function readStoredTheme(): Theme {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // Visual preference only; storage failure never blocks startup.
  }
  return DEFAULT_THEME;
}

function persistTheme(theme: Theme): void {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Visual preference only; storage failure never blocks the update.
  }
}

export const createSettingsSlice: StateCreator<UiState, [], [], SettingsSlice> = (set) => ({
  setTheme: (theme) => {
    persistTheme(theme);
    set({ theme });
  },
  theme: readStoredTheme()
});
