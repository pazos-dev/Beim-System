/**
 * E2E tests for login flow.
 */
import { expect, test } from "@playwright/test";

test.describe("Login", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("shows login form with username and password fields", async ({ page }) => {
    await expect(page.locator("input[name='username']")).toBeVisible();
    await expect(page.locator("input[name='password']")).toBeVisible();
    await expect(page.locator("button[type='submit']")).toBeVisible();
  });

  test("shows error with invalid credentials", async ({ page }) => {
    await page.fill("input[name='username']", "invalid-user");
    await page.fill("input[name='password']", "wrong-password");
    await page.click("button[type='submit']");

    await expect(page.locator("[role='alert']")).toBeVisible();
  });

  test("redirects to /app after successful login", async ({ page }) => {
    await page.fill("input[name='username']", "e2e-test");
    await page.fill("input[name='password']", "TestPass-1234!");
    await page.click("button[type='submit']");

    // Wait for navigation (SPA router may take a moment)
    await expect(page).toHaveURL(/\/app/, { timeout: 10000 });
  });
});
