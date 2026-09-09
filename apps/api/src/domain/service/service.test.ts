import { describe, expect, it } from "vitest";

import { ValidationError } from "../../errors/taxonomy.js";
import { createServiceId } from "../shared/types.js";
import {
  activateService,
  createService,
  deactivateService,
  renameService,
  repriceService,
  updateService,
  type CreateServiceInput,
  type Service
} from "./service.js";

const SERVICE_ID = createServiceId("123e4567-e89b-12d3-a456-426614174000");

function stockedService(overrides: Partial<CreateServiceInput> = {}): Service {
  return createService({
    id: SERVICE_ID,
    name: "Cambio de pantalla",
    priceAmount: 100,
    priceCurrency: "UYU",
    ...overrides
  });
}

describe("Service aggregate (domain slice)", () => {
  describe("createService", () => {
    it("creates a labor entry with Money price and active defaulting to true", () => {
      const service = stockedService();

      expect(service.id).toBe(SERVICE_ID);
      expect(service.name).toBe("Cambio de pantalla");
      expect(service.price).toEqual({ amount: 100, currency: "UYU" });
      expect(service.active).toBe(true);
      expect(service.data).toEqual({});
      expect(service.updatedAt).toBeNull();
    });

    it("rejects an empty name, a negative price, or an unknown currency", () => {
      expect(() => stockedService({ name: "   " })).toThrow(ValidationError);
      expect(() => stockedService({ priceAmount: -1 })).toThrow(ValidationError);
      expect(() => stockedService({ priceCurrency: "ARS" })).toThrow(ValidationError);
    });

    it("rejects a non-uuid service id", () => {
      expect(() => stockedService({ id: "not-a-uuid" as never })).toThrow(ValidationError);
    });
  });

  describe("rename()", () => {
    it("changes the name and keeps every other field unchanged", () => {
      const service = stockedService();

      const renamed = renameService(service, "Reparación de placa");

      expect(renamed.name).toBe("Reparación de placa");
      expect(renamed.price).toEqual(service.price);
      expect(renamed.active).toBe(service.active);
      expect(service.name).toBe("Cambio de pantalla");
    });

    it("rejects an empty name", () => {
      expect(() => renameService(stockedService(), "  ")).toThrow(ValidationError);
    });
  });

  describe("reprice()", () => {
    it("moves the price from 100 to 120 leaving the rest unchanged", () => {
      const service = stockedService();

      const repriced = repriceService(service, 120);

      expect(repriced.price).toEqual({ amount: 120, currency: "UYU" });
      expect(repriced.name).toBe(service.name);
      expect(repriced.active).toBe(service.active);
      expect(service.price).toEqual({ amount: 100, currency: "UYU" });
    });

    it("rejects a negative price", () => {
      expect(() => repriceService(stockedService(), -5)).toThrow(ValidationError);
    });
  });

  describe("activate()/deactivate()", () => {
    it("deactivates an active service and reactivates it back", () => {
      const service = stockedService();

      const inactive = deactivateService(service);

      expect(inactive.active).toBe(false);
      expect(inactive.name).toBe(service.name);
      expect(service.active).toBe(true);

      expect(activateService(inactive).active).toBe(true);
    });

    it("keeps the flag stable when already in the target state", () => {
      expect(activateService(stockedService()).active).toBe(true);
      expect(deactivateService(deactivateService(stockedService())).active).toBe(false);
    });
  });

  describe("updateService()", () => {
    it("merges only the present fields", () => {
      const service = stockedService();

      const renamed = updateService(service, { name: "Diagnóstico" });

      expect(renamed.name).toBe("Diagnóstico");
      expect(renamed.price).toEqual(service.price);
      expect(renamed.active).toBe(service.active);
      expect(renamed.data).toEqual(service.data);
    });

    it("merges price and active flags while keeping name and data", () => {
      const service = stockedService();

      const updated = updateService(service, { priceAmount: 150, active: false });

      expect(updated.price).toEqual({ amount: 150, currency: "UYU" });
      expect(updated.active).toBe(false);
      expect(updated.name).toBe(service.name);
    });

    it("shallow-merges data remainders instead of replacing them", () => {
      const service = stockedService({ data: { note: "keep", level: 1 } });

      const updated = updateService(service, { data: { level: 2 } });

      expect(updated.data).toEqual({ note: "keep", level: 2 });
    });

    it("returns an equal copy when the patch is empty", () => {
      const service = stockedService();

      expect(updateService(service, {})).toEqual(service);
    });
  });
});
