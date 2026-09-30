import { Page } from "@playwright/test";
import { test, expect } from "playwright-test-coverage";
import { Role, User } from "../src/service/pizzaService";

type MockAccount = { user: User; password: string };

// Stateful fake of the service's user, auth, order, and franchise endpoints so
// updates persist across logout and login just like the real backend.
async function mockUserApi(page: Page) {
  const accounts: MockAccount[] = [
    { user: { id: "1", name: "常用名字", email: "a@jwt.com", roles: [{ role: Role.Admin }] }, password: "admin" },
  ];
  const franchises: any[] = [];
  let loggedIn: MockAccount | undefined;
  let nextId = 2;

  await page.route(/\/api\/auth$/, async (route) => {
    const request = route.request();
    const method = request.method();

    if (method === "POST") {
      const { name, email, password } = request.postDataJSON();
      loggedIn = { user: { id: String(nextId++), name, email, roles: [{ role: Role.Diner }] }, password };
      accounts.push(loggedIn);
      await route.fulfill({ json: { user: loggedIn.user, token: `token${loggedIn.user.id}` } });
      return;
    }

    if (method === "PUT") {
      const { email, password } = request.postDataJSON();
      const account = accounts.find((a) => a.user.email === email && a.password === password);
      if (!account) {
        await route.fulfill({ status: 404, json: { message: "unknown user" } });
        return;
      }
      loggedIn = account;
      await route.fulfill({ json: { user: account.user, token: `token${account.user.id}` } });
      return;
    }

    expect(method).toBe("DELETE");
    loggedIn = undefined;
    await route.fulfill({ json: { message: "logout successful" } });
  });

  await page.route(/\/api\/user\/me$/, async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({ json: loggedIn?.user });
  });

  await page.route(/\/api\/user\/\d+$/, async (route) => {
    const request = route.request();
    expect(request.method()).toBe("PUT");
    const userId = new URL(request.url()).pathname.split("/").pop();
    expect(userId).toBe(loggedIn?.user.id);

    const { name, email, password } = request.postDataJSON();
    const account = loggedIn!;
    if (name) account.user.name = name;
    if (email) account.user.email = email;
    if (password) account.password = password;
    await route.fulfill({ json: { user: account.user, token: `token${account.user.id}` } });
  });

  await page.route(/\/api\/order$/, async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({ json: { dinerId: loggedIn?.user.id, orders: [], page: 1 } });
  });

  await page.route(/\/api\/franchise(\?.*)?$/, async (route) => {
    const request = route.request();

    if (request.method() === "GET") {
      const nameFilter = new URL(request.url()).searchParams.get("name") || "*";
      const searchName = nameFilter.replace(/\*/g, "").toLowerCase();
      await route.fulfill({
        json: { franchises: franchises.filter((f) => f.name.toLowerCase().includes(searchName)), more: false },
      });
      return;
    }

    expect(request.method()).toBe("POST");
    const franchiseReq = request.postDataJSON();
    const franchise = { id: franchises.length + 1, name: franchiseReq.name, admins: [] as any[], stores: [] };
    for (const admin of franchiseReq.admins) {
      const account = accounts.find((a) => a.user.email === admin.email)!;
      account.user.roles!.push({ role: Role.Franchisee, objectId: String(franchise.id) });
      franchise.admins.push({ id: account.user.id, name: account.user.name, email: account.user.email });
    }
    franchises.push(franchise);
    await route.fulfill({ json: franchise });
  });

  await page.route(/\/api\/franchise\/\d+$/, async (route) => {
    expect(route.request().method()).toBe("GET");
    const userId = new URL(route.request().url()).pathname.split("/").pop();
    await route.fulfill({ json: franchises.filter((f) => f.admins.some((a: any) => a.id === userId)) });
  });
}

test.beforeEach(async ({ page }) => {
  await mockUserApi(page);
});

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
