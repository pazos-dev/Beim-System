import { JsonClienteRepository } from "../adapters/json-cliente-repository";
import { ClienteUseCases } from "../use-cases/clientes";

export function createClienteUseCases(dataDirectory: string): ClienteUseCases {
  return new ClienteUseCases(new JsonClienteRepository(dataDirectory));
}
