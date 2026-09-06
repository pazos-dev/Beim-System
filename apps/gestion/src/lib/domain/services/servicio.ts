import { z } from "zod";

// Client-safe servicio policy: no platform or server runtime imports, so
// Client Components can import it without dragging server modules into the
// browser bundle. Single source for writer gates and mutation input shapes
// (SRV-2/SRV-3: admin-only writes, server-validated price, OCC on updates).
export const SERVICIO_WRITE_ROLE_VALUES = ["administrador", "administrador_principal"] as const;

export type ServicioWriteRole = (typeof SERVICIO_WRITE_ROLE_VALUES)[number];

export const SERVICIO_WRITE_ROLES: ReadonlySet<string> = new Set(SERVICIO_WRITE_ROLE_VALUES);

export const createServicioInputSchema = z.object({
  displayName: z.string().min(1).max(120),
  price: z.number().min(0)
});

export type CreateServicioInput = z.infer<typeof createServicioInputSchema>;

export const updateServicioInputSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  price: z.number().min(0).optional(),
  active: z.boolean().optional()
});

export type UpdateServicioInput = z.infer<typeof updateServicioInputSchema>;

export const toggleServicioInputSchema = z.object({
  active: z.boolean(),
  expectedVersion: z.number().int().min(0)
});

export type ToggleServicioInput = z.infer<typeof toggleServicioInputSchema>;
