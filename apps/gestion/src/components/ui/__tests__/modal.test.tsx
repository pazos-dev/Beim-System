// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Modal } from "../Modal";

function ModalHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir modal
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Detalle">
        <button type="button">Primera acción</button>
        <button type="button">Última acción</button>
      </Modal>
    </>
  );
}

describe("Modal", () => {
  it("moves focus into the dialog, traps Tab, and restores it after Escape", () => {
    render(<ModalHarness />);
    const trigger = screen.getByRole("button", { name: "Abrir modal" });

    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Detalle" });
    const firstAction = screen.getByRole("button", { name: "Primera acción" });
    const lastAction = screen.getByRole("button", { name: "Última acción" });

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(firstAction).toHaveFocus();

    lastAction.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Cerrar" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
