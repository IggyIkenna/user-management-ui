import { describe, expect, it, beforeEach } from "vitest";
import { runProviderProvisioning } from "../../server/providers.js";

// Skipped by default — exercises live upstream fail-modes; on sandboxed envs
// (no egress) the SDK clients stall past the 20s timeout. Opt in explicitly
// via RUN_PROVIDER_INTEGRATION=1 when net access is available.
const RUN_INTEGRATION = process.env.RUN_PROVIDER_INTEGRATION === "1";

describe.skipIf(!RUN_INTEGRATION)("Provider failure integration paths", () => {
  beforeEach(() => {
    process.env.GITHUB_ADMIN_PAT = "";
    process.env.SLACK_ADMIN_TOKEN = "";
    process.env.MS_TENANT_ID = "";
    process.env.MS_GRAPH_CLIENT_ID = "";
    process.env.MS_GRAPH_CLIENT_SECRET = "";
    process.env.GCP_TARGET_PROJECT_ID = "";
    process.env.AWS_ACCESS_KEY_ID = "";
    process.env.AWS_SECRET_ACCESS_KEY = "";
    process.env.PORTAL_API_BASE_URL = "";
    process.env.PORTAL_SERVICE_TOKEN = "";
  });

  it("returns failed steps when provider credentials are unavailable", async () => {
    const steps = await runProviderProvisioning({
      role: "admin",
      email: "integration@test.com",
      firebase_uid: "fb-int-1",
      github_handle: "integration-user",
      access_template: null,
      product_slugs: [],
    });

    const byService = Object.fromEntries(steps.map((s) => [s.service, s]));
    expect(byService.github.status).toBe("failed");
    expect(byService.slack.status).toBe("failed");
    expect(byService.microsoft365.status).toBe("failed");
    expect(byService.gcp.status).toBe("failed");
    expect(byService.aws.status).toBe("failed");
  }, 20000);
});
