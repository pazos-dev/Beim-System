// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NewOrderFrame } from "../NewOrderFrame";

const pushMock = vi.fn();
const invalidateMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock })
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: invalidateMock })
  };
});

describe("NewOrderFrame", () => {
  beforeEach(() => {
    pushMock.mockReset();
    invalidateMock.mockReset();
  });

  it("renderiza el iframe vendored con versión y nextNumber, con sandbox mínimo", () => {
    const { container } = renderFrame();
    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toBe("/boleta/index.html?v=2026-09-05&nextNumber=1000");
    expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin allow-forms");
    expect(iframe?.getAttribute("title")).toBe("Formulario de nueva orden de trabajo");
  });

  it("muestra el fallback cuando el iframe no puede cargar", () => {
    renderFrame();
    const iframe = document.querySelector("iframe");
    expect(iframe).not.toBeNull();
    if (iframe) fireEvent.error(iframe);
    expect(screen.getByText("Formulario de creación no disponible")).toBeInTheDocument();
  });

  it("ignora postMessage de origen no verificado", () => {
    const { container } = renderFrame();
    expect(container.querySelector("iframe")).not.toBeNull();
    dispatchMessage(
      { type: "ORDEN_CREADA", payload: { numero: "0001-1000" } },
      "https://otro-origen.example"
    );
    expect(pushMock).not.toHaveBeenCalled();
    expect(invalidateMock).not.toHaveBeenCalled();
  });

  it("navega a la lista con filtro Todas al recibir ORDEN_CREADA del origen correcto", () => {
    const { container } = renderFrame();
    expect(container.querySelector("iframe")).not.toBeNull();
    dispatchMessage(
      { type: "ORDEN_CREADA", payload: { numero: "0001-1000" } },
      window.location.origin
    );
    expect(invalidateMock).toHaveBeenCalledWith({ queryKey: ["ordenes"] });
    expect(pushMock).toHaveBeenCalledWith("/app/ordenes?estado=todas");
  });
});

function dispatchMessage(data: unknown, origin: string): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data,
      origin,
      source: window
    })
  );
}

function renderFrame(): { container: HTMLElement } {
  const { container } = render(<NewOrderFrame nextNumber={1000} version="2026-09-05" />);
  return { container };
}