"use client";

import { purchaseInputSchema } from "../../lib/domain/inventory/inventory";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

export interface PurchaseEntryValues {
  readonly productoId: string;
  readonly cantidad: string;
  readonly costoUnitario: string;
  readonly proveedor: string;
  readonly deposito: string;
  readonly comprobante: string;
}

export type PurchaseEntryFieldName = keyof PurchaseEntryValues;

export const EMPTY_PURCHASE_ENTRY_VALUES: PurchaseEntryValues = {
  cantidad: "",
  comprobante: "",
  costoUnitario: "",
  deposito: "",
  productoId: "",
  proveedor: ""
};

export function validatePurchaseEntry(values: PurchaseEntryValues) {
  return purchaseInputSchema.safeParse({
    ...(values.deposito.trim() === "" ? {} : { deposito: values.deposito.trim() }),
    ...(values.comprobante.trim() === "" ? {} : { comprobante: values.comprobante.trim() }),
    cantidad: Number(values.cantidad),
    costoUnitario: Number(values.costoUnitario),
    productoId: values.productoId.trim(),
    proveedor: values.proveedor.trim()
  });
}

export interface PurchaseEntryFieldsProps {
  readonly values: PurchaseEntryValues;
  readonly onChange: (field: PurchaseEntryFieldName, value: string) => void;
  readonly pending?: boolean;
  readonly formError?: string | null;
  readonly serverError?: string | null;
  readonly submitLabel?: string;
  readonly pendingLabel?: string;
}

export function PurchaseEntryFields({
  formError,
  onChange,
  pending = false,
  pendingLabel = "Registrando…",
  serverError,
  submitLabel = "Registrar compra",
  values
}: PurchaseEntryFieldsProps) {
  return (
    <>
      <Input
        label="Producto"
        onChange={(event) => onChange("productoId", event.target.value)}
        placeholder="ID del producto"
        value={values.productoId}
      />
      <Input
        label="Cantidad"
        min={1}
        onChange={(event) => onChange("cantidad", event.target.value)}
        placeholder="Cantidad"
        type="number"
        value={values.cantidad}
      />
      <Input
        label="Costo unitario"
        min={0}
        onChange={(event) => onChange("costoUnitario", event.target.value)}
        placeholder="Costo unitario"
        type="number"
        value={values.costoUnitario}
      />
      <Input
        label="Proveedor"
        onChange={(event) => onChange("proveedor", event.target.value)}
        placeholder="Proveedor"
        value={values.proveedor}
      />
      <Input
        label="Depósito (opcional)"
        onChange={(event) => onChange("deposito", event.target.value)}
        placeholder="principal o taller (opcional)"
        value={values.deposito}
      />
      <Input
        label="Comprobante (opcional)"
        onChange={(event) => onChange("comprobante", event.target.value)}
        placeholder="Número de comprobante (opcional)"
        value={values.comprobante}
      />
      {formError ? <p role="alert">{formError}</p> : null}
      {serverError ? <p role="alert">{serverError}</p> : null}
      <div className="flex justify-end">
        <Button disabled={pending} type="submit">
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </>
  );
}
