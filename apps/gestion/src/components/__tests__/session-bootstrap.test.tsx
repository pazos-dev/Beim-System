// @vitest-environment jsdom
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQueryClient } from "../../test/query-client";
import { useUiStore } from "../../lib/ui-store";
import { useAuthStore, type UserActor } from "../../lib/api/auth-store";
import { SessionBootstrap } from "../SessionBootstrap";

const pushMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock })
}));

const ACTOR: UserActor = {
  id: "u_ana",
  name: "Ana Vendedora",
  role: "vendedor",
  username: "ana"
};

function setAuthState(token: string | null, actor: UserActor | null): void {
  useAuthStore.setState({ token, actor, hasHydrated: true });
}

function resetStores(): void {
  useUiStore.setState({ actor: null });
  useAuthStore.setState({
    actor: null,
    error: null,
    hasHydrated: false,
    isLoading: false,
    token: null
  });
}

describe("SessionBootstrap", () => {
  beforeEach(() => {
    pushMock.mockClear();
    resetStores();
  });

  it("sincroniza el actor del auth-store al ui-store cuando hay token", async () => {
    setAuthState("valid-token", ACTOR);

    renderWithQueryClient(<SessionBootstrap />);

    await waitFor(() =>
      expect(useUiStore.getState().actor).toEqual({
        displayName: ACTOR.name,
        id: ACTOR.id,
        role: ACTOR.role,
        username: ACTOR.username
      })
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("redirige a /login y limpia el actor cuando no hay token", async () => {
    setAuthState(null, null);

    useUiStore.getState().setUser({
      displayName: "Ana Vendedora",
      id: "u_ana",
      role: "vendedor",
      username: "ana"
    });

    renderWithQueryClient(<SessionBootstrap />);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
    expect(useUiStore.getState().actor).toBeNull();
  });
});
