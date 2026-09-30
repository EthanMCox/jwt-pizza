import { Page } from "@playwright/test";
import { test, expect } from "playwright-test-coverage";

function randomEmail(prefix = "user") {
  return `${prefix}${Math.floor(Math.random() * 10000)}@jwt.com`;
}

async function register(page: Page, name: string, email: string, password: string) {
  await page.goto("/");
  await page.getByRole("link", { name: "Register" }).click();
  await page.getByRole("textbox", { name: "Full name" }).fill(name);
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Register" }).click();
}

async function login(page: Page, email: string, password: string) {
  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Login" }).click();
}

async function logout(page: Page) {
  await page.getByRole("link", { name: "Logout" }).click();
  await expect(page.getByRole("link", { name: "Login" })).toBeVisible();
}

async function editUser(page: Page, fields: { name?: string; email?: string; password?: string }) {
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator("h3")).toContainText("Edit user");

  const dialog = page.getByRole("dialog");
  if (fields.name !== undefined) await dialog.getByRole("textbox").nth(0).fill(fields.name);
  if (fields.email !== undefined) await dialog.getByRole("textbox").nth(1).fill(fields.email);
  if (fields.password !== undefined) await dialog.getByRole("textbox").nth(2).fill(fields.password);
  await page.getByRole("button", { name: "Update" }).click();

  await page.waitForSelector('[role="dialog"].hidden', { state: "attached" });
}

test("updateUser", async ({ page }) => {
  const email = `user${Math.floor(Math.random() * 10000)}@jwt.com`;
  await page.goto("/");
  await page.getByRole("link", { name: "Register" }).click();
  await page.getByRole("textbox", { name: "Full name" }).fill("pizza diner");
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill("diner");
  await page.getByRole("button", { name: "Register" }).click();

  await page.getByRole("link", { name: "pd" }).click();

  await expect(page.getByRole("main")).toContainText("pizza diner");

  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator("h3")).toContainText("Edit user");
  await page.getByRole("textbox").first().fill("pizza dinerx");
  await page.getByRole("button", { name: "Update" }).click();

  await page.waitForSelector('[role="dialog"].hidden', { state: "attached" });

  await expect(page.getByRole("main")).toContainText("pizza dinerx");

  await page.getByRole("link", { name: "Logout" }).click();
  await page.getByRole("link", { name: "Login" }).click();

  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill("diner");
  await page.getByRole("button", { name: "Login" }).click();

  await page.getByRole("link", { name: "pd" }).click();

  await expect(page.getByRole("main")).toContainText("pizza dinerx");
});

test("updateUser password", async ({ page }) => {
  const email = randomEmail();
  await register(page, "pizza diner", email, "diner");
  await page.getByRole("link", { name: "pd" }).click();

  await editUser(page, { password: "newdiner" });
  await expect(page.getByRole("main")).toContainText("pizza diner");

  await logout(page);

  // The old password no longer works
  await login(page, email, "diner");
  await expect(page.getByRole("main")).toContainText("unknown user");
  await expect(page.getByRole("link", { name: "pd" })).toHaveCount(0);

  // The new password does
  await page.getByRole("textbox", { name: "Password" }).fill("newdiner");
  await page.getByRole("button", { name: "Login" }).click();
  await page.getByRole("link", { name: "pd" }).click();
  await expect(page.getByRole("main")).toContainText("pizza diner");
  await expect(page.getByRole("main")).toContainText(email);
});

test("updateUser email", async ({ page }) => {
  const email = randomEmail();
  const newEmail = randomEmail("updated");
  await register(page, "pizza diner", email, "diner");
  await page.getByRole("link", { name: "pd" }).click();

  await editUser(page, { email: newEmail });
  await expect(page.getByRole("main")).toContainText(newEmail);

  await logout(page);

  // The old email no longer works
  await login(page, email, "diner");
  await expect(page.getByRole("main")).toContainText("unknown user");
  await expect(page.getByRole("link", { name: "pd" })).toHaveCount(0);

  // The new email does, and the password was left unchanged
  await page.getByRole("textbox", { name: "Email address" }).fill(newEmail);
  await page.getByRole("button", { name: "Login" }).click();
  await page.getByRole("link", { name: "pd" }).click();
  await expect(page.getByRole("main")).toContainText(newEmail);
  await expect(page.getByRole("main")).toContainText("pizza diner");
});

test("updateUser as franchisee keeps franchisee role", async ({ page }) => {
  const email = randomEmail("franchisee");
  const franchiseName = `Franchise ${Math.floor(Math.random() * 10000)}`;
  await register(page, "pizza franchisee", email, "franchisee");
  await logout(page);

  // Admin makes the new user a franchisee
  await login(page, "a@jwt.com", "admin");
  await page.getByRole("link", { name: "Admin" }).click();
  await page.getByRole("button", { name: "Add Franchise" }).click();
  await page.getByRole("textbox", { name: "franchise name" }).fill(franchiseName);
  await page.getByRole("textbox", { name: "franchisee admin email" }).fill(email);
  await page.getByRole("button", { name: "Create" }).click();
  // The franchise list is paged, so filter to find the new one
  await page.getByRole("textbox", { name: "Filter franchises" }).fill(franchiseName);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("row").filter({ hasText: franchiseName })).toBeVisible();
  await logout(page);

  await login(page, email, "franchisee");
  await page.getByRole("link", { name: "pf" }).click();
  await expect(page.getByRole("main")).toContainText("Franchisee on");

  await editUser(page, { name: "pizza franchiseex" });
  await expect(page.getByRole("main")).toContainText("pizza franchiseex");
  await expect(page.getByRole("main")).toContainText("Franchisee on");

  await logout(page);
  await login(page, email, "franchisee");
  await page.getByRole("link", { name: "pf" }).click();
  await expect(page.getByRole("main")).toContainText("pizza franchiseex");
  await expect(page.getByRole("main")).toContainText("Franchisee on");

  // Still has access to their franchise
  await page.getByRole("navigation", { name: "Global" }).getByRole("link", { name: "Franchise" }).click();
  await expect(page.getByRole("main")).toContainText(franchiseName);
});
