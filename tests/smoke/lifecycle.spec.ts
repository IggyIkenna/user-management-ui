import { expect, test } from "@playwright/test";

test.describe("user lifecycle smoke", () => {
  test.beforeEach(async ({ page }) => {
    let users = [
      {
        id: "usr-001",
        firebase_uid: "fb-001",
        name: "Smoke Admin",
        email: "smoke-admin@test.com",
        role: "admin",
        github_handle: "smokeadmin",
        product_slugs: [],
        status: "active",
        provisioned_at: new Date().toISOString(),
        last_modified: new Date().toISOString(),
        services: {
          github: "provisioned",
          slack: "provisioned",
          microsoft365: "provisioned",
          gcp: "provisioned",
          aws: "provisioned",
          portal: "provisioned",
        },
      },
    ];

    await page.route("**/api/v1/**", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const path = url.pathname;
      const method = req.method();

      if (method === "GET" && path === "/api/v1/users") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ users, total: users.length }),
        });
      }

      if (method === "GET" && /^\/api\/v1\/users\/[^/]+$/.test(path)) {
        const id = path.split("/").pop() as string;
        const user = users.find((u) => u.id === id);
        return route.fulfill({
          status: user ? 200 : 404,
          contentType: "application/json",
          body: JSON.stringify(user ? { user } : { error: "not found" }),
        });
      }

      if (method === "POST" && path === "/api/v1/users/quota-check") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            quota: { ok: true, checks: [] },
          }),
        });
      }

      if (method === "GET" && path === "/api/v1/access-templates") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ templates: [], total: 0 }),
        });
      }

      if (method === "POST" && path === "/api/v1/users/onboard") {
        const payload = req.postDataJSON();
        const user = {
          id: `usr-00${users.length + 1}`,
          firebase_uid: `fb-00${users.length + 1}`,
          name: payload.name,
          email: payload.email,
          role: payload.role,
          github_handle: payload.github_handle,
          product_slugs: payload.product_slugs || [],
          status: "active",
          provisioned_at: new Date().toISOString(),
          last_modified: new Date().toISOString(),
          services: {
            github: payload.role === "admin" ? "provisioned" : "not_applicable",
            slack: "provisioned",
            microsoft365: "provisioned",
            gcp: "provisioned",
            aws: "provisioned",
            portal: "provisioned",
          },
        };
        users.push(user);
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            user,
            provisioning_steps: [
              {
                service: "firebase",
                label: "Firebase Auth",
                status: "success",
              },
            ],
          }),
        });
      }

      if (method === "POST" && path.endsWith("/offboard")) {
        const id = path.split("/")[4];
        users = users.map((u) =>
          u.id === id ? { ...u, status: "offboarded" } : u,
        );
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            user: users.find((u) => u.id === id),
            revocation_steps: [],
          }),
        });
      }

      if (method === "POST" && path.endsWith("/reprovision")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            workflow_execution: "smoke/reprovision/1",
            workflow_state: "STARTED",
            provisioning_steps: [],
          }),
        });
      }

      if (method === "GET" && path.includes("/workflows")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ runs: [], total: 0 }),
        });
      }

      if (method === "GET" && path.endsWith("/documents")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ documents: [], total: 0 }),
        });
      }

      if (method === "GET" && path.endsWith("/effective-access")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ effective_access: [] }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });
  });

  test("onboard flow", async ({ page }) => {
    await page.goto("/onboard");
    await page.getByPlaceholder("John Doe").fill("Smoke User");
    await page
      .getByPlaceholder("john@odum-research.com")
      .fill("smoke-user@test.com");
    await page.getByLabel("Role").click();
    await page.getByRole("option", { name: "Admin" }).click();
    await page.getByRole("button", { name: "Onboard User" }).click();
    await expect(page.getByText("User Onboarded")).toBeVisible();
  });

  test("offboard flow", async ({ page }) => {
    await page.goto("/users/usr-001/offboard");
    await expect(
      page.locator("span.font-medium").getByText("Smoke Admin"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Offboard User" }).click();
    await page.getByRole("button", { name: "Confirm Offboard" }).click();
    await expect(page.getByText("User Offboarded")).toBeVisible();
  });

  test("reprovision flow", async ({ page }) => {
    await page.goto("/users/usr-001");
    await page.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Re-provision" }).click();
    await expect(page.getByText("Workflow History")).toBeVisible();
  });
});
