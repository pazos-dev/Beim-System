// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "../Button";
import { Input } from "../Input";

describe("base controls", () => {
  it("renders a labelled input and a named button", () => {
    render(
      <form>
        <Input id="search" label="Buscar" />
        <Button type="submit">Guardar</Button>
      </form>
    );

    expect(screen.getByRole("textbox", { name: "Buscar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toHaveAttribute("type", "submit");
  });

  it("reports an input error accessibly", () => {
    render(<Input id="name" label="Nombre" error="El nombre es obligatorio." />);

    const input = screen.getByRole("textbox", { name: "Nombre" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("El nombre es obligatorio.");
  });

  it("supports keyboard activation", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Continuar</Button>);

    fireEvent.keyDown(screen.getByRole("button", { name: "Continuar" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
