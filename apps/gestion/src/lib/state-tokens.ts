export const STATE_TOKENS = {
  EN_DIAGNOSTICO: "en_diagnostico",
  PRESUPUESTADO: "presupuestado",
  ESPERANDO_APROBACION: "esperando_aprobacion",
  APROBADO: "aprobado",
  ESPERANDO_REPUESTO: "esperando_repuesto",
  EN_REPARACION: "en_reparacion",
  CONTROL_CALIDAD: "control_calidad",
  LISTO_PARA_RETIRAR: "listo_para_retirar",
  FINALIZADO: "finalizado",
  ENTREGADO: "entregado",
  CANCELADO: "cancelado"
} as const;

export type StateToken = (typeof STATE_TOKENS)[keyof typeof STATE_TOKENS];

export const STATE_TOKEN_VALUES = [
  STATE_TOKENS.EN_DIAGNOSTICO,
  STATE_TOKENS.PRESUPUESTADO,
  STATE_TOKENS.ESPERANDO_APROBACION,
  STATE_TOKENS.APROBADO,
  STATE_TOKENS.ESPERANDO_REPUESTO,
  STATE_TOKENS.EN_REPARACION,
  STATE_TOKENS.CONTROL_CALIDAD,
  STATE_TOKENS.LISTO_PARA_RETIRAR,
  STATE_TOKENS.FINALIZADO,
  STATE_TOKENS.ENTREGADO,
  STATE_TOKENS.CANCELADO
] as const;

export const STATE_TOKEN_LABELS: Readonly<Record<StateToken, string>> = {
  en_diagnostico: "En diagnóstico",
  presupuestado: "Presupuestado",
  esperando_aprobacion: "Esperando aprobación",
  aprobado: "Aprobado",
  esperando_repuesto: "Esperando repuesto",
  en_reparacion: "En reparación",
  control_calidad: "Control de calidad",
  listo_para_retirar: "Listo para retirar",
  finalizado: "Finalizado",
  entregado: "Entregado",
  cancelado: "Cancelado"
};

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_");
}

export function isStateToken(value: string): value is StateToken {
  return (STATE_TOKEN_VALUES as readonly string[]).includes(value);
}

/**
 * Mechanical variants of the spec's own UI labels whose normalized form does
 * not match their canonical token (e.g. "Control de calidad" -> control_de_calidad).
 * Legacy-only states (ingresado, pendiente, ...) are NOT aliases; their mapping
 * belongs to the parity/migration slice.
 */
const LABEL_VARIANTS: Readonly<Record<string, StateToken>> = {
  control_de_calidad: STATE_TOKENS.CONTROL_CALIDAD
};

export function normalizeStateToken(input: unknown): StateToken | undefined {
  if (typeof input !== "string") return undefined;

  const normalized = normalizeText(input);
  if (isStateToken(normalized)) return normalized;
  return LABEL_VARIANTS[normalized];
}
