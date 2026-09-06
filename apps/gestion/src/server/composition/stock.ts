import { JsonStockRepository } from "../adapters/json-stock-repository";
import { StockUseCases } from "../use-cases/stock";

export function createStockUseCases(dataDirectory: string): StockUseCases {
  return new StockUseCases(new JsonStockRepository(dataDirectory));
}
