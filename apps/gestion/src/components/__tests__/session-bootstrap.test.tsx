// @vitest-environment jsdom
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQueryClient } from "../../test/query-client";
import { useUiStore } from "../../lib/ui-store";
import { SessionBootstrap } from "../SessionBootstrap";

const ACTOR = {
  displayName: "Ana Vendedora",
  id: "u_ana",
  role: "vendedor",
  username: "ana"
};

function sessionResponse(actor: unknown, status = 200): Response {
  return Response.json({ data: actor, ok: status === 200 }, { status });
}

beforeEach(() => {
  useUiStore.setState({ actor: null });
  vi.unstubAllGlobals();
});

describe("SessionBootstrap", () => {
  it("stores the session actor when the request succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sessionResponse(ACTOR)));
    renderWithQueryClient(<SessionBootstrap />);

    await waitFor(() => expect(useUiStore.getState().actor).toEqual(ACTOR));
    expect(fetch).toHaveBeenCalledWith("/api/gestion/auth/session", { cache: "no-store" });
  });

  it("clears the stored actor when the session is unauthorized", async () => {
    useUiStore.getState().setUser(ACTOR);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sessionResponse(null, 401)));
    renderWithQueryClient(<SessionBootstrap />);

    await waitFor(() => expect(useUiStore.getState().actor).toBeNull());
  });

  it("clears the stored actor when the request fails", async () => {
    useUiStore.getState().setUser(ACTOR);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    renderWithQueryClient(<SessionBootstrap />);

    await waitFor(() => expect(useUiStore.getState().actor).toBeNull());
  });
});
