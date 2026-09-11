/**
 * E2E tests for auth flow.
 */
import { expect, test } from "@playwright/test";

test.describe("Auth", () => {
  test("redirects unauthenticated users from /app to /login", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows login form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("input[name='username']")).toBeVisible();
    await expect(page.locator("input[name='password']")).toBeVisible();
    await expect(page.locator("button[type='submit']")).toBeVisible();
  });

  test("shows error with invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill("input[name='username']", "invalid");
    await page.fill("input[name='password']", "wrong");
    await page.click("button[type='submit']");
    await expect(page.locator("[role='alert']")).toBeVisible();
  });

  test("has no console errors on login page", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    expect(consoleErrors).toEqual([]);
  });
});
