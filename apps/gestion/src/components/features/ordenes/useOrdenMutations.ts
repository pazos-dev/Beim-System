"use client";

import { useQueryClient } from "@tanstack/react-query";

// Ordenes are created inside the vendored receipt frame, not by a direct
// fetch in this codebase. This hook owns the ["ordenes"] invalidation that
// must run when the frame announces ORDEN_CREADA.
export function useNotifyOrdenCreated() {
  const queryClient = useQueryClient();
  return function notifyOrdenCreated(): void {
    void queryClient.invalidateQueries({ queryKey: ["ordenes"] });
  };
}
