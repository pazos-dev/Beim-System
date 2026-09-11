/**
 * E2E auth helper — injects a valid auth state for protected pages.
 * Use this to test protected pages without going through the login flow.
 */
import type { Page } from "@playwright/test";

export async function injectAuth(page: Page, token: string, actor: { id: string; username: string; name: string; role: string }): Promise<void> {
  await page.addInitScript(
    ({ token, actor }) => {
      // Set auth cookie
      document.cookie = `beim_auth_token=${encodeURIComponent(token)}; Path=/; SameSite=Lax`;
      document.cookie = `beim_auth_actor=${encodeURIComponent(JSON.stringify(actor))}; Path=/; SameSite=Lax`;
    },
    { token, actor }
  );
}

/** Default test actor. */
export const TEST_ACTOR = {
  id: "e2e-user",
  username: "e2e-test",
  name: "E2E Test User",
  role: "administrador"
} as const;

/** Default test token (must be a valid token for the backend). */
export const TEST_TOKEN = "e2e-test-token";
