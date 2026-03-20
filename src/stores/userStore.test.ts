import { describe, it, expect, beforeEach } from "vitest";
import { useUserStore } from "./userStore";
import type { Person } from "@/api/types";

const MOCK_USERS: Person[] = [
  {
    id: "usr-001",
    firebase_uid: "fb-001",
    name: "Ikenna Igboaka",
    email: "ikenna@odum-research.com",
    role: "admin",
    github_handle: "IggyIkenna",
    product_slugs: [],
    status: "active",
    provisioned_at: "2025-06-01T00:00:00Z",
    last_modified: "2026-03-10T12:00:00Z",
    services: {
      github: "provisioned",
      slack: "provisioned",
      microsoft365: "provisioned",
      gcp: "provisioned",
      aws: "provisioned",
      portal: "provisioned",
    },
  },
  {
    id: "usr-002",
    firebase_uid: "fb-002",
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
      aws: "provisioned",
      portal: "provisioned",
    },
  },
  {
    id: "usr-003",
    firebase_uid: "fb-003",
    name: "David Kim",
    email: "david@odum-research.com",
    role: "operations",
    product_slugs: [],
    status: "offboarded",
    provisioned_at: "2025-08-01T00:00:00Z",
    last_modified: "2026-03-01T12:00:00Z",
    services: {
      github: "not_applicable",
      slack: "not_applicable",
      microsoft365: "not_applicable",
      gcp: "not_applicable",
      aws: "not_applicable",
      portal: "not_applicable",
    },
  },
];

describe("useUserStore", () => {
  beforeEach(() => {
    const store = useUserStore.getState();
    store.setSearch("");
    store.setRoleFilter("all");
    store.setStatusFilter("all");
    store.setSelectedUser(null);
  });

  it("initializes with default filters", () => {
    const state = useUserStore.getState();
    expect(state.filters.search).toBe("");
    expect(state.filters.role).toBe("all");
    expect(state.filters.status).toBe("all");
    expect(state.selectedUserId).toBeNull();
  });

  it("sets search filter", () => {
    useUserStore.getState().setSearch("ikenna");
    expect(useUserStore.getState().filters.search).toBe("ikenna");
  });

  it("sets role filter", () => {
    useUserStore.getState().setRoleFilter("admin");
    expect(useUserStore.getState().filters.role).toBe("admin");
  });

  it("sets status filter", () => {
    useUserStore.getState().setStatusFilter("offboarded");
    expect(useUserStore.getState().filters.status).toBe("offboarded");
  });

  it("sets selected user", () => {
    useUserStore.getState().setSelectedUser("usr-001");
    expect(useUserStore.getState().selectedUserId).toBe("usr-001");
  });

  it("filters users by search (name)", () => {
    useUserStore.getState().setSearch("ikenna");
    const filtered = useUserStore.getState().filterUsers(MOCK_USERS);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("usr-001");
  });

  it("filters users by search (email)", () => {
    useUserStore.getState().setSearch("datadodo@");
    const filtered = useUserStore.getState().filterUsers(MOCK_USERS);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("usr-002");
  });

  it("filters users by role", () => {
    useUserStore.getState().setRoleFilter("admin");
    const filtered = useUserStore.getState().filterUsers(MOCK_USERS);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].role).toBe("admin");
  });

  it("filters users by status", () => {
    useUserStore.getState().setStatusFilter("offboarded");
    const filtered = useUserStore.getState().filterUsers(MOCK_USERS);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].status).toBe("offboarded");
  });

  it("combines search + role + status filters", () => {
    useUserStore.getState().setSearch("data");
    useUserStore.getState().setRoleFilter("collaborator");
    useUserStore.getState().setStatusFilter("active");
    const filtered = useUserStore.getState().filterUsers(MOCK_USERS);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("usr-002");
  });

  it("returns all users when no filters", () => {
    const filtered = useUserStore.getState().filterUsers(MOCK_USERS);
    expect(filtered).toHaveLength(3);
  });

  it("returns empty when no match", () => {
    useUserStore.getState().setSearch("nonexistent");
    const filtered = useUserStore.getState().filterUsers(MOCK_USERS);
    expect(filtered).toHaveLength(0);
  });

  it("search is case-insensitive", () => {
    useUserStore.getState().setSearch("IKENNA");
    const filtered = useUserStore.getState().filterUsers(MOCK_USERS);
    expect(filtered).toHaveLength(1);
  });
});
