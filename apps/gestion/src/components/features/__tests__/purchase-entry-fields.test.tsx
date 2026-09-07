// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  EMPTY_PURCHASE_ENTRY_VALUES,
  PurchaseEntryFields,
  validatePurchaseEntry
} from "../PurchaseEntryFields";

describe("PurchaseEntryFields", () => {
  it("renders the shared entry fields with the stock-modal labels", () => {
    render(<PurchaseEntryFields onChange={() => undefined} values={EMPTY_PURCHASE_ENTRY_VALUES} />);
    expect(screen.getByLabelText("Producto")).toBeInTheDocument();
    expect(screen.getByLabelText("Cantidad")).toBeInTheDocument();
    expect(screen.getByLabelText("Costo unitario")).toBeInTheDocument();
    expect(screen.getByLabelText("Proveedor")).toBeInTheDocument();
    expect(screen.getByLabelText("Depósito (opcional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Comprobante (opcional)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar compra" })).toBeInTheDocument();
  });

  it("forwards per-field edits through onChange", () => {
    const onChange = vi.fn();
    render(<PurchaseEntryFields onChange={onChange} values={EMPTY_PURCHASE_ENTRY_VALUES} />);
    fireEvent.change(screen.getByLabelText("Proveedor"), { target: { value: "Proveedor Uno" } });
    expect(onChange).toHaveBeenCalledWith("proveedor", "Proveedor Uno");
    fireEvent.change(screen.getByLabelText("Cantidad"), { target: { value: "10" } });
    expect(onChange).toHaveBeenCalledWith("cantidad", "10");
  });

  it("disables submit and shows the pending label while pending", () => {
    render(
      <PurchaseEntryFields onChange={() => undefined} pending values={EMPTY_PURCHASE_ENTRY_VALUES} />
    );
    const submit = screen.getByRole("button", { name: "Registrando…" });
    expect(submit).toBeDisabled();
  });

  it("shows form and server errors as alerts", () => {
    render(
      <PurchaseEntryFields
        formError="Revisá los datos de la compra."
        onChange={() => undefined}
        serverError="No se pudo registrar la compra. Reintentá."
        values={EMPTY_PURCHASE_ENTRY_VALUES}
      />
    );
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(2);
  });
});

describe("validatePurchaseEntry", () => {
  it("accepts a valid entry and passes comprobante through", () => {
    const parsed = validatePurchaseEntry({
      ...EMPTY_PURCHASE_ENTRY_VALUES,
      cantidad: "10",
      comprobante: "FAC-001",
      costoUnitario: "120",
      deposito: "principal",
      productoId: "p_1",
      proveedor: "Proveedor Uno"
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toMatchObject({ comprobante: "FAC-001", deposito: "principal" });
    }
  });

  it("omits empty optional fields and rejects cantidad 0", () => {
    const omitted = validatePurchaseEntry({
      ...EMPTY_PURCHASE_ENTRY_VALUES,
      cantidad: "10",
      costoUnitario: "120",
      productoId: "p_1",
      proveedor: "Proveedor Uno"
    });
    expect(omitted.success).toBe(true);
    if (omitted.success) {
      expect(omitted.data).not.toHaveProperty("deposito");
      expect(omitted.data).not.toHaveProperty("comprobante");
    }
    const rejected = validatePurchaseEntry({
      ...EMPTY_PURCHASE_ENTRY_VALUES,
      cantidad: "0",
      costoUnitario: "120",
      productoId: "p_1",
      proveedor: "Proveedor Uno"
    });
    expect(rejected.success).toBe(false);
  });
});
