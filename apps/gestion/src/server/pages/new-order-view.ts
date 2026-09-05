import { join } from "node:path";

import { nextOrderNumeroValue } from "../../lib/domain/orders/orden";
import { AuthService } from "../handlers/auth";
import {
  createOrderStores,
  ORDER_CREATE_ROLES
} from "../handlers/order-context";

function dataDirectory(): string {
  return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
}

export interface NewOrderView {
  nextNumber: number;
  version: string;
}

export type NewOrderViewResult = { redirect: string } | { view: NewOrderView };

export async function loadNewOrderView(
  cookieValue: string | undefined,
  directory = dataDirectory()
): Promise<NewOrderViewResult> {
  const service = new AuthService(directory);
  const session = await service.session(cookieValue);
  if (!session.ok || !ORDER_CREATE_ROLES.has(session.value.role)) {
    return { redirect: "/app/ordenes" };
  }

  const stores = createOrderStores(directory);
  const documentResult = await stores.ordenesDocument.read();
  const existing = documentResult.ok
    ? documentResult.value.ordenes.map((orden) => orden.numero)
    : [];
  const nextNumber = nextOrderNumeroValue(existing);
  const version = process.env.BOLETA_VERSION ?? "dev";

  return { view: { nextNumber, version } };
}