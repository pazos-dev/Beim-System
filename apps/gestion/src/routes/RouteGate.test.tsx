// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useSessionStore } from "../store/session.slice";
import { findRoute } from "./route-table";
import { RouteGate } from "./RouteGate";

beforeEach(() => {
  useSessionStore.setState({ actor: null });
});

describe("RouteGate", () => {
  it("renders route content for an authorized role", () => {
    render(
      <RouteGate actorRole="caja" route={findRoute("/app/caja")}>
        <p>Contenido de caja</p>
      </RouteGate>
    );

    expect(screen.getByText("Contenido de caja")).toBeInTheDocument();
  });

  it("blocks an unauthorized role with access-denied", () => {
    render(
      <RouteGate actorRole="vendedor" route={findRoute("/app/caja")}>
        <p>Contenido de caja</p>
      </RouteGate>
    );

    expect(screen.queryByText("Contenido de caja")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders not-found for an unknown path", () => {
    render(
      <RouteGate actorRole="administrador_principal" route={findRoute("/app/unknown")}>
        <p>Contenido de caja</p>
      </RouteGate>
    );

    expect(screen.queryByText("Contenido de caja")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("reads the logged-in role from the session store when no role is passed", () => {
    useSessionStore.getState().setUser({
      displayName: "Caja",
      id: "u-caja",
      role: "caja",
      username: "caja"
    });

    render(
      <RouteGate route={findRoute("/app/caja")}>
        <p>Contenido de caja</p>
      </RouteGate>
    );

    expect(screen.getByText("Contenido de caja")).toBeInTheDocument();
  });

  it("denies an unauthenticated visitor without a role prop", () => {
    render(
      <RouteGate route={findRoute("/app/caja")}>
        <p>Contenido de caja</p>
      </RouteGate>
    );

    expect(screen.queryByText("Contenido de caja")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Acceso denegado.");
  });

  it("prefers the explicit role over the stored one", () => {
    useSessionStore.getState().setUser({
      displayName: "Vendedora",
      id: "u-vendedora",
      role: "vendedor",
      username: "vendedora"
    });

    render(
      <RouteGate actorRole="caja" route={findRoute("/app/caja")}>
        <p>Contenido de caja</p>
      </RouteGate>
    );

    expect(screen.getByText("Contenido de caja")).toBeInTheDocument();
  });
});
