/**
 * E2E tests for protected pages after real login.
 */
import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.fill("input[name='username']", "e2e-test");
  await page.fill("input[name='password']", "TestPass-1234!");
  await page.click("button[type='submit']");
  await expect(page).toHaveURL(/\/app/, { timeout: 10000 });
}

test.describe("Protected pages", () => {
  test("dashboard loads after login", async ({ page }) => {
    await login(page);
    await expect(page.locator("h1")).toContainText("Dashboard");
  });

  test("clientes page loads after login", async ({ page }) => {
    await login(page);
    await page.goto("/app/clientes");
    await expect(page.locator("h1")).toContainText("Clientes");
  });

  test("stock page loads after login", async ({ page }) => {
    await login(page);
    await page.goto("/app/stock");
    await expect(page.locator("h1")).toContainText("Stock");
  });

  test("ventas page loads after login", async ({ page }) => {
    await login(page);
    await page.goto("/app/ventas");
    await expect(page.locator("h1")).toContainText("Ventas");
  });

  test("caja page loads after login", async ({ page }) => {
    await login(page);
    await page.goto("/app/caja");
    await expect(page.locator("h1")).toContainText("Caja");
  });

  test("navigation sidebar is visible after login", async ({ page }) => {
    await login(page);
    await expect(page.locator("nav, [role='navigation']")).toBeVisible();
  });
});
