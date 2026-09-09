// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { findRoute } from "./route-table";
import { RouteGate } from "./RouteGate";

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
});
