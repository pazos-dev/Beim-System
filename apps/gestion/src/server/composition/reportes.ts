import { JsonReporteRepository } from "../adapters/json-reporte-repository";
import { ReporteUseCases } from "../use-cases/reportes";

export function createReporteUseCases(dataDirectory: string): ReporteUseCases {
  return new ReporteUseCases(new JsonReporteRepository(dataDirectory));
}
