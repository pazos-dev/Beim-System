import type { TxClient, UnitOfWork } from "../../domain/shared/ports.js";
import type { Clock } from "../../domain/shared/ports.js";
import type { UserId } from "../../domain/shared/types.js";
import type { Client, Session, User } from "../../domain/user/user.js";

/** Tx-bound user/client/session access; adapters own SQL, hashes stay out of domain. */
export interface AuthUserStore {
  findUserById(tx: TxClient, id: UserId): Promise<User | null>;
  findUserByUsername(tx: TxClient, username: string): Promise<{ user: User; passwordHash: string } | null>;
  saveUser(tx: TxClient, user: User): Promise<void>;
  savePasswordHash(tx: TxClient, id: UserId, passwordHash: string): Promise<void>;
  findClientById(tx: TxClient, id: UserId): Promise<Client | null>;
  saveClient(tx: TxClient, client: Client): Promise<void>;
  findSessionsByUser(tx: TxClient, userId: UserId): Promise<Session[]>;
  saveSession(tx: TxClient, session: Session): Promise<void>;
}

/** Hashing/verification adapter; `null` runs the constant-time dummy path and returns false. */
export interface PasswordCrypto {
  hash(password: string): Promise<string>;
  verify(password: string, storedHash: string | null): Promise<boolean>;
}

/** Opaque console-token material; randomness and TTL policy live in the adapter. */
export interface ConsoleSessionBridge {
  issueToken(): { token: string; tokenHash: string };
  sessionExpiry(now: Date): Date;
}

export interface AuthDeps {
  uow: UnitOfWork;
  store: AuthUserStore;
  crypto: PasswordCrypto;
  bridge: ConsoleSessionBridge;
  clock: Clock;
}
