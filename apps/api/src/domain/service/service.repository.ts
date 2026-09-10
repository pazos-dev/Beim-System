/**
 * Service repository port (domain slice, change `clean-arch-domain`).
 *
 * One interface for the `Service` root (no-stock catalog entry, no
 * children). Zero implementations in `domain/`.
 */
import type { ServiceId } from "../shared/types.js";
import type { Service } from "./service.js";

export interface ServiceRepository {
  findById(id: ServiceId): Promise<Service | null>;
  save(service: Service): Promise<void>;
}
