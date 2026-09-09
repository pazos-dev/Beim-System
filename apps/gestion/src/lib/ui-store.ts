/**
 * @deprecated Canonical client state lives in `src/store/*` (session.slice,
 * theme.slice, ui.slice + selectors) with `Role` in `src/kernel/role`.
 * This module is a backward-compatible shim: the combined `useUiStore`
 * below keeps existing page/test importers compiling and behaving exactly
 * as before during slice-0. New code MUST import from `src/store/*` and
 * `src/kernel/*` directly. Pages migrate in slice-1; this file is deleted
 * in a later slice.
 */
import { create } from "zustand";

import {
  createModalsSlice,
  type ClienteDuplicateWarning,
  type ModalsSlice,
  type ServicioModalSelection
} from "./ui-slices/modals-slice";
import { createCajaSlice, type CajaSlice } from "./ui-slices/caja-slice";
import { createPeriodSlice, type PeriodSlice } from "./ui-slices/period-slice";
import { createSearchSlice, type SearchSlice } from "./ui-slices/search-slice";
import { createSettingsSlice, type SettingsSlice } from "./ui-slices/settings-slice";
import { createUserSlice, type UserSlice } from "./ui-slices/user-slice";

export type { ClienteDuplicateWarning, ModalsSlice, ServicioModalSelection };

/** @deprecated Use the `src/store/*` slices + `src/kernel/role` instead. */
export type UiState = SearchSlice & PeriodSlice & ModalsSlice & CajaSlice & UserSlice & SettingsSlice;

/** @deprecated Use `useSessionStore`/`useThemeStore`/`useUiSliceStore` instead. */
export const useUiStore = create<UiState>()((...args) => ({
  ...createSearchSlice(...args),
  ...createPeriodSlice(...args),
  ...createModalsSlice(...args),
  ...createCajaSlice(...args),
  ...createUserSlice(...args),
  ...createSettingsSlice(...args)
}));

// Canonical re-exports so `lib/ui-store` also resolves the new homes.
export type { Role } from "../kernel/role";
export { selectCajaFormRevision, selectPeriod, selectSidebarCollapsed, useUiModals } from "../store/selectors";
export { selectSessionRole, useSessionStore } from "../store/session.slice";
export { selectPrefsTheme, useThemePrefs, useThemeStore } from "../store/theme.slice";
export { useUiSliceStore } from "../store/ui.slice";
