// @vitest-environment jsdom
// Bearer transport (PR2): `SessionBootstrap` mounts the manual sync entry
// point only — there is no session endpoint to poll (the token is memory-only
// and a reload starts logged out). It must open zero sockets and never touch
// the slice on its own.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQueryClient } from "../../test/query-client";
import { useSessionStore, type UserActor } from "../../store/session.slice";
import { SessionBootstrap } from "../SessionBootstrap";

const ACTOR: UserActor = {
  displayName: "Ana Vendedora",
  id: "u_ana",
  role: "vendedor",
  username: "ana"
};

beforeEach(() => {
  useSessionStore.setState({ actor: null, token: null });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network socket opened during an offline test.");
    })
  );
});

describe("SessionBootstrap", () => {
  it("opens zero sockets on mount", () => {
    const fetchMock = vi.mocked(fetch);

    renderWithQueryClient(<SessionBootstrap />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves a logged-in session untouched", () => {
    useSessionStore.getState().setSession(ACTOR, "recorded-dev-token");

    renderWithQueryClient(<SessionBootstrap />);

    expect(useSessionStore.getState().actor).toEqual(ACTOR);
    expect(useSessionStore.getState().token).toBe("recorded-dev-token");
  });

  it("leaves a logged-out session cleared", () => {
    renderWithQueryClient(<SessionBootstrap />);

    expect(useSessionStore.getState().actor).toBeNull();
    expect(useSessionStore.getState().token).toBeNull();
  });
});
