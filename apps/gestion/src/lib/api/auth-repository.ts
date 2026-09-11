/**
 * Auth Repository — Adapter pattern for authentication API.
 * Translates backend gestion-login to frontend auth contract.
 */

import { HttpClient } from "./http-client";
import type { ApiEnvelope } from "./http-client";
import type { UserActor } from "./auth-store";

export interface LoginCredentials {
  readonly username: string;
  readonly password: string;
}

export interface LoginResponse {
  readonly token: string;
  readonly expiresAt: string;
  readonly user: UserActor;
}

export class AuthRepository {
  private readonly publicClient: HttpClient;

  public constructor() {
    // Auth login is public (no token needed).
    this.publicClient = new HttpClient({ getToken: () => null });
  }

  public async login(credentials: LoginCredentials): Promise<ApiEnvelope<LoginResponse>> {
    return this.publicClient.request<LoginResponse>("POST", "/auth/gestion-login", {
      body: credentials,
    });
  }

  public async logout(token: string): Promise<ApiEnvelope<{ loggedOut: boolean }>> {
    // Logout requires a valid Bearer token.
    const client = new HttpClient({ getToken: () => token });
    return client.request<{ loggedOut: boolean }>("POST", "/auth/logout", {});
  }
}

/** Singleton instance for convenience. */
export const authRepository = new AuthRepository();
