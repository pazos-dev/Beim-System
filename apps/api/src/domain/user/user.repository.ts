/**
 * User repository port (domain slice, change `clean-arch-domain`).
 *
 * One interface for the `User` root; `Client` and `Session` are reached
 * only through it (children via roots). Zero implementations in `domain/`.
 */
import type { UserId } from "../shared/types.js";
import type { Client, User } from "./user.js";

export interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  findClientById(id: UserId): Promise<Client | null>;
  save(user: User): Promise<void>;
  saveClient(client: Client): Promise<void>;
}
