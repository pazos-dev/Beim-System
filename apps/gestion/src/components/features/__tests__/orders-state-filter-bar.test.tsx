// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ORDER_STATE_FILTERS } from "../../../lib/domain/orders/orden";
import { OrdersStateFilterBar } from "../OrdersStateFilterBar";

const counts = {
  todas: 5,
  abiertas: 3,
  en_diagnostico: 2,
  presupuesto: 1,
  aprobado: 0,
  espera_repuesto: 0,
  en_proceso: 0,
  finalizadas: 1,
  canceladas: 0
};

describe("OrdersStateFilterBar", () => {
  it("renders every domain filter with its count badge", () => {
    render(<OrdersStateFilterBar activeFilter="en_diagnostico" counts={counts} onChange={vi.fn()} />);

    for (const filter of ORDER_STATE_FILTERS) {
      expect(screen.getByRole("button", { name: new RegExp(filter.label) })).toBeInTheDocument();
    }
    expect(screen.getByLabelText("5 órdenes")).toBeInTheDocument();
    expect(screen.getByLabelText("2 órdenes")).toBeInTheDocument();
  });

  it("marks the active filter pressed and reports clicks", () => {
    const onChange = vi.fn();
    render(<OrdersStateFilterBar activeFilter="en_diagnostico" counts={counts} onChange={onChange} />);

    expect(screen.getByRole("button", { name: /En diagnóstico/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: /Presupuesto/ }));
    expect(onChange).toHaveBeenCalledWith("presupuesto");
  });
});