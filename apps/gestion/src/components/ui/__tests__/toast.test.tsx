// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider, useToast } from "../Toast";

function ToastTrigger() {
  const toast = useToast();
  return (
    <div>
      <button type="button" onClick={() => toast.success("Guardado correctamente.")}>
        Éxito
      </button>
      <button type="button" onClick={() => toast.error("No autorizado.")}>
        Error
      </button>
      <button type="button" onClick={() => toast.info("Hay novedades.")}>
        Información
      </button>
    </div>
  );
}

describe("ToastProvider", () => {
  it("announces success, error, and info messages and auto-dismisses them", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider duration={1000}>
        <ToastTrigger />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Éxito" }));
    fireEvent.click(screen.getByRole("button", { name: "Error" }));
    fireEvent.click(screen.getByRole("button", { name: "Información" }));

    expect(screen.getByRole("region", { name: "Notificaciones" })).toHaveAttribute(
      "aria-live",
      "polite"
    );
    expect(screen.getByText("Guardado correctamente.")).toBeInTheDocument();
    expect(screen.getByText("No autorizado.")).toBeInTheDocument();
    expect(screen.getByText("Hay novedades.")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByText("Guardado correctamente.")).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
