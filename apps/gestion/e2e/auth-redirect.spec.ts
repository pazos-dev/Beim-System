import { expect, test } from "@playwright/test";

test("redirects an unauthenticated app visit to login", async ({ page }) => {
  await page.goto("/app");

  await expect(page).toHaveURL("http://localhost:3000/login");
});
