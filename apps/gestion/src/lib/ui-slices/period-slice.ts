import type { StateCreator } from "zustand";

import type { Period } from "../../components/features/PeriodFilter";
import type { UiState } from "../ui-store";

export interface PeriodSlice {
  readonly period: Period;
  readonly setPeriod: (period: Period) => void;
}

const DEFAULT_PERIOD: Period = { type: "day", value: "" };

export const createPeriodSlice: StateCreator<UiState, [], [], PeriodSlice> = (set) => ({
  period: DEFAULT_PERIOD,
  setPeriod: (period) => set({ period })
});
