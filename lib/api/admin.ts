import { apiClient } from "@/lib/api/client";
import type { HealthCheckResult, HealthCheckHistoryEntry } from "@/lib/api/types";

export async function runHealthChecks() {
  return apiClient.post<HealthCheckResult>("/admin/health-checks");
}

export async function listHealthCheckHistory() {
  return apiClient.get<{ runs: HealthCheckHistoryEntry[] }>("/admin/health-checks/history");
}
