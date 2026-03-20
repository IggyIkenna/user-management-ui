import { apiClient } from "@/api/client";
import type { HealthCheckHistoryEntry, HealthCheckResult } from "@/api/types";

export async function runHealthChecks() {
  return apiClient.post<HealthCheckResult>("/admin/health-checks");
}

export async function listHealthCheckHistory() {
  return apiClient.get<{ runs: HealthCheckHistoryEntry[]; total: number }>(
    "/admin/health-checks/history",
  );
}
