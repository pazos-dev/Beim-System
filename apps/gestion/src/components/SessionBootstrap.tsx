"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuthStore, useActor } from "../lib/api/auth-store";
import { useUiStore } from "../lib/ui-store";
import type { UserActor as UiUserActor } from "../lib/ui-slices/user-slice";

// Clave de consulta anterior; se conserva para que los importadores existentes
// sigan resolviéndola desde este módulo.
export const SESSION_QUERY_KEY = ["gestion", "session"] as const;

function toUiActor(actor: NonNullable<ReturnType<typeof useActor>>): UiUserActor {
  return {
    id: actor.id,
    username: actor.username,
    displayName: actor.name,
    role: actor.role,
  };
}

// Hook de compatibilidad: expone el estado de la sesión basado en el token
// almacenado, sin realizar ninguna petición a la red.
export function useSessionSync(): {
  readonly isError: boolean;
  readonly isLoading: boolean;
  readonly data: UiUserActor | null;
} {
  const token = useAuthStore((state) => state.token);
  const actor = useActor();
  const hasHydrated = useAuthStore((state) => state.hasHydrated);

  return {
    isError: hasHydrated && token === null,
    isLoading: !hasHydrated,
    data: actor ? toUiActor(actor) : null,
  };
}

// Montado una vez bajo QueryProvider en app/app/layout.tsx. No renderiza nada;
// su única responsabilidad es sincronizar el actor del auth-store con el
// ui-store y redirigir a /login cuando no hay token.
export function SessionBootstrap() {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const actor = useActor();
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const setUser = useUiStore((state) => state.setUser);
  const clearUser = useUiStore((state) => state.clearUser);

  useEffect(() => {
    if (!hasHydrated) return;

    if (token === null) {
      clearUser();
      router.push("/login");
      return;
    }

    if (actor !== null) {
      setUser(toUiActor(actor));
    }
  }, [hasHydrated, token, actor, router, setUser, clearUser]);

  return null;
}
