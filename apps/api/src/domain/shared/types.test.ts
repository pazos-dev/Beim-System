import { describe, expect, it } from "vitest";

import {
  CURRENCIES,
  PAYMENT_STATUSES,
  REPAIR_STATUSES,
  ROLES,
  createMoney,
  createProductId,
  createUserId,
  isPaymentStatus,
  isRepairStatus,
  isRole,
  type Clock,
  type Uuid
} from "./types.js";

describe("shared-kernel Types (slice 0.1)", () => {
  describe("Money", () => {
    it("creates money with a non-negative amount and closed currency", () => {
      expect(createMoney(1500.5, "UYU")).toEqual({ amount: 1500.5, currency: "UYU" });
      expect(createMoney(0, "USD")).toEqual({ amount: 0, currency: "USD" });
      expect(createMoney(10, "USDT")).toEqual({ amount: 10, currency: "USDT" });
    });

    it("rejects negative, non-finite, or unknown-currency money (fail-closed)", () => {
      expect(() => createMoney(-1, "UYU")).toThrow();
      expect(() => createMoney(Number.NaN, "UYU")).toThrow();
      expect(() => createMoney(10, "ARS")).toThrow();
      expect(CURRENCIES).toEqual(["UYU", "USD", "USDT"]);
    });
  });

  describe("UserId / ProductId", () => {
    it("accepts a uuid as UserId and rejects anything else", () => {
      const id = "123e4567-e89b-12d3-a456-426614174000";
      expect(createUserId(id)).toBe(id);
      expect(() => createUserId("not-a-uuid")).toThrow();
      expect(() => createUserId("")).toThrow();
    });

    it("accepts a non-empty ProductId and rejects blank ids", () => {
      expect(createProductId("prod-1")).toBe("prod-1");
      expect(() => createProductId("")).toThrow();
      expect(() => createProductId("   ")).toThrow();
    });
  });

  describe("Role", () => {
    it("covers the closed console + webshop sets", () => {
      expect([...ROLES]).toEqual([
        "vendedor",
        "tecnico",
        "caja",
        "administrador",
        "administrador_principal",
        "cliente",
        "admin",
        "superadmin"
      ]);
    });

    it("guards unknown roles", () => {
      expect(isRole("vendedor")).toBe(true);
      expect(isRole("superadmin")).toBe(true);
      expect(isRole("owner")).toBe(false);
      expect(isRole("")).toBe(false);
    });
  });

  describe("RepairStatus", () => {
    it("covers the closed 5-state set", () => {
      expect([...REPAIR_STATUSES]).toEqual(["Ingresado", "En reparación", "Listo", "Entregado", "Cancelado"]);
    });

    it("guards unknown states", () => {
      expect(isRepairStatus("Listo")).toBe(true);
      expect(isRepairStatus("En camino")).toBe(false);
    });
  });

  describe("PaymentStatus", () => {
    it("covers both realms (orders + receipts + journal)", () => {
      expect([...PAYMENT_STATUSES]).toEqual([
        "Pendiente de pago",
        "Pendiente",
        "Pagado",
        "Sin abonar",
        "Anulado",
        "Cancelado"
      ]);
    });

    it("guards unknown states", () => {
      expect(isPaymentStatus("Pagado")).toBe(true);
      expect(isPaymentStatus("Anulado")).toBe(true);
      expect(isPaymentStatus("Parcial")).toBe(false);
    });
  });

  describe("Clock / Uuid", () => {
    it("lets tests inject deterministic doubles", () => {
      const fixed = new Date("2026-01-01T00:00:00.000Z");
      const clock: Clock = { now: () => fixed };
      const uuid: Uuid = { generate: () => "123e4567-e89b-12d3-a456-426614174000" };

      expect(clock.now()).toBe(fixed);
      expect(createUserId(uuid.generate())).toBe("123e4567-e89b-12d3-a456-426614174000");
    });
  });
});
