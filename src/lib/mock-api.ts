import type { Person, OnboardRequest, ProvisioningStep } from "@/api/types";

const MOCK_DELAY_MS =
  typeof import.meta !== "undefined"
    ? parseInt(import.meta.env?.VITE_MOCK_DELAY_MS || "60", 10)
    : 60;

const MOCK_USERS: Person[] = [
  {
    id: "usr-001",
    name: "Ikenna Igboaka",
    email: "ikenna@odum-research.com",
    role: "admin",
    github_handle: "IggyIkenna",
    microsoft_upn: "ikenna@odum-research.com",
    slack_handle: "ikenna",
    gcp_email: "ikenna@odum-research.com",
    product_slugs: [],
    status: "active",
    provisioned_at: "2025-06-01T00:00:00Z",
    last_modified: "2026-03-10T12:00:00Z",
    services: {
      github: "provisioned",
      slack: "provisioned",
      microsoft365: "provisioned",
      gcp: "provisioned",
      portal: "provisioned",
    },
  },
  {
    id: "usr-002",
    name: "datadodo",
    email: "datadodo@github.com",
    role: "collaborator",
    github_handle: "datadodo",
    product_slugs: [],
    status: "active",
    provisioned_at: "2025-09-15T00:00:00Z",
    last_modified: "2026-03-10T12:00:00Z",
    services: {
      github: "provisioned",
      slack: "provisioned",
      microsoft365: "not_applicable",
      gcp: "provisioned",
      portal: "provisioned",
    },
  },
  {
    id: "usr-003",
    name: "CosmicTrader",
    email: "cosmictrader@github.com",
    role: "collaborator",
    github_handle: "CosmicTrader",
    product_slugs: [],
    status: "active",
    provisioned_at: "2025-09-15T00:00:00Z",
    last_modified: "2026-03-10T12:00:00Z",
    services: {
      github: "provisioned",
      slack: "provisioned",
      microsoft365: "not_applicable",
      gcp: "provisioned",
      portal: "provisioned",
    },
  },
  {
    id: "usr-004",
    name: "James Chen",
    email: "james.chen@elysium-capital.com",
    role: "client",
    product_slugs: ["elysium"],
    status: "active",
    provisioned_at: "2026-01-15T00:00:00Z",
    last_modified: "2026-03-01T12:00:00Z",
    services: {
      github: "not_applicable",
      slack: "provisioned",
      microsoft365: "not_applicable",
      gcp: "not_applicable",
      portal: "provisioned",
    },
  },
  {
    id: "usr-005",
    name: "Sarah Mbeki",
    email: "sarah@odum-research.com",
    role: "accounting",
    microsoft_upn: "sarah@odum-research.com",
    product_slugs: [],
    status: "active",
    provisioned_at: "2026-02-01T00:00:00Z",
    last_modified: "2026-03-05T12:00:00Z",
    services: {
      github: "not_applicable",
      slack: "provisioned",
      microsoft365: "provisioned",
      gcp: "not_applicable",
      portal: "provisioned",
    },
  },
  {
    id: "usr-006",
    name: "Marcus Johnson",
    email: "marcus@investors.com",
    role: "investor",
    product_slugs: [],
    status: "active",
    provisioned_at: "2026-02-15T00:00:00Z",
    last_modified: "2026-03-15T12:00:00Z",
    services: {
      github: "not_applicable",
      slack: "provisioned",
      microsoft365: "not_applicable",
      gcp: "not_applicable",
      portal: "provisioned",
    },
  },
  {
    id: "usr-007",
    name: "Elena Petrova",
    email: "elena@board.odum-research.com",
    role: "board",
    product_slugs: [],
    status: "active",
    provisioned_at: "2025-12-01T00:00:00Z",
    last_modified: "2026-01-10T12:00:00Z",
    services: {
      github: "not_applicable",
      slack: "provisioned",
      microsoft365: "not_applicable",
      gcp: "not_applicable",
      portal: "provisioned",
    },
  },
  {
    id: "usr-008",
    name: "David Kim",
    email: "david@odum-research.com",
    role: "operations",
    microsoft_upn: "david@odum-research.com",
    product_slugs: [],
    status: "offboarded",
    provisioned_at: "2025-08-01T00:00:00Z",
    last_modified: "2026-03-01T12:00:00Z",
    services: {
      github: "not_applicable",
      slack: "not_applicable",
      microsoft365: "not_applicable",
      gcp: "not_applicable",
      portal: "not_applicable",
    },
  },
];

let users = [...MOCK_USERS];

function jsonResponse<T>(d: T, s = 200): Response {
  return new Response(JSON.stringify(d), {
    status: s,
    headers: { "Content-Type": "application/json" },
  });
}

function simulateProvisioning(role: string): ProvisioningStep[] {
  const steps: ProvisioningStep[] = [];

  if (role === "admin" || role === "collaborator") {
    steps.push({ service: "github", label: "GitHub", status: "success" });
  }
  steps.push({ service: "slack", label: "Slack", status: "success" });
  if (role === "admin" || role === "accounting" || role === "operations") {
    steps.push({ service: "microsoft365", label: "Microsoft 365", status: "success" });
  }
  if (role === "admin" || role === "collaborator") {
    steps.push({ service: "gcp", label: "GCP IAM", status: "success" });
  }
  steps.push({ service: "portal", label: "Website Portal", status: "success" });

  return steps;
}

function handleRoutes(
  path: string,
  method: string,
  body: string | null,
): Response | null {
  if (path.endsWith("/health")) {
    return jsonResponse({ status: "healthy", mock: true });
  }

  if (path.includes("/users") && method === "GET") {
    const id = path.match(/\/users\/(.+)/)?.[1];
    if (id) {
      const user = users.find((u) => u.id === id);
      return user
        ? jsonResponse({ user })
        : jsonResponse({ error: "User not found" }, 404);
    }
    return jsonResponse({ users, total: users.length });
  }

  if (path.includes("/users/onboard") && method === "POST") {
    const req: OnboardRequest = body ? JSON.parse(body) : {};
    const newUser: Person = {
      id: `usr-${String(users.length + 1).padStart(3, "0")}`,
      name: req.name,
      email: req.email,
      role: req.role,
      github_handle: req.github_handle,
      product_slugs: req.product_slugs || [],
      status: "active",
      provisioned_at: new Date().toISOString(),
      last_modified: new Date().toISOString(),
      services: {
        github:
          req.role === "admin" || req.role === "collaborator"
            ? "provisioned"
            : "not_applicable",
        slack: "provisioned",
        microsoft365:
          req.role === "admin" || req.role === "accounting" || req.role === "operations"
            ? "provisioned"
            : "not_applicable",
        gcp:
          req.role === "admin" || req.role === "collaborator"
            ? "provisioned"
            : "not_applicable",
        portal: "provisioned",
      },
    };
    users = [...users, newUser];
    const steps = simulateProvisioning(req.role);
    return jsonResponse({ user: newUser, provisioning_steps: steps });
  }

  if (path.match(/\/users\/(.+)\/offboard/) && method === "POST") {
    const id = path.match(/\/users\/(.+)\/offboard/)?.[1];
    users = users.map((u) =>
      u.id === id
        ? {
            ...u,
            status: "offboarded" as const,
            last_modified: new Date().toISOString(),
            services: {
              github: "not_applicable",
              slack: "not_applicable",
              microsoft365: "not_applicable",
              gcp: "not_applicable",
              portal: "not_applicable",
            },
          }
        : u,
    );
    const user = users.find((u) => u.id === id);
    return jsonResponse({
      user,
      revocation_steps: [
        { service: "github", label: "GitHub", status: "success" },
        { service: "slack", label: "Slack", status: "success" },
        { service: "microsoft365", label: "Microsoft 365", status: "success" },
        { service: "gcp", label: "GCP IAM", status: "success" },
        { service: "portal", label: "Website Portal", status: "success" },
      ],
    });
  }

  if (path.match(/\/users\/(.+)/) && method === "PUT") {
    const id = path.match(/\/users\/(.+)/)?.[1];
    const updates = body ? JSON.parse(body) : {};
    users = users.map((u) =>
      u.id === id
        ? { ...u, ...updates, last_modified: new Date().toISOString() }
        : u,
    );
    const user = users.find((u) => u.id === id);
    return user
      ? jsonResponse({ user })
      : jsonResponse({ error: "User not found" }, 404);
  }

  if (path.includes("/roles")) {
    return jsonResponse({
      roles: [
        { id: "admin", label: "Admin", description: "Full system access" },
        { id: "collaborator", label: "Collaborator", description: "Dev collaborator (per-repo GitHub access)" },
        { id: "board", label: "Board", description: "Board member" },
        { id: "client", label: "Client", description: "Product client (portal access per slug)" },
        { id: "shareholder", label: "Shareholder", description: "Shareholder report access" },
        { id: "accounting", label: "Accounting", description: "Financial access (M365 + portal)" },
        { id: "operations", label: "Operations", description: "Ops access (M365 + portal)" },
        { id: "investor", label: "Investor", description: "Investment decks + doc upload" },
      ],
    });
  }

  return null;
}

async function handle(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
  const path = url.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "");
  const method = init?.method?.toUpperCase() || "GET";
  const body =
    init?.body && typeof init.body === "string" ? init.body : null;

  const result = handleRoutes(path, method, body);
  if (result) return result;

  console.warn("[MOCK user-mgmt] unhandled:", method, path);
  return jsonResponse({});
}

export function installMockHandlers(mockMode = false) {
  if (!mockMode) return;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    if (url.includes("/api/")) return handle(url, init);
    return orig(input, init);
  };
  console.info(
    "%c[MOCK MODE] user-management-ui",
    "color:#fbbf24;font-weight:bold",
  );
}
