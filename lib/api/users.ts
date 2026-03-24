import { apiClient } from "@/lib/api/client";
import type {
  ModifyUserRequest,
  OffboardRequest,
  OnboardRequest,
  Person,
  ProvisioningStep,
  QuotaCheckResult,
  WorkflowExecution,
  WorkflowRun,
  EffectiveAccessResult,
} from "@/lib/api/types";

export async function listUsers() {
  return apiClient.get<{ users: Person[]; total: number }>("/users");
}

export async function getUser(id: string) {
  return apiClient.get<{ user: Person }>(`/users/${id}`);
}

export async function checkOnboardQuota(payload: Pick<OnboardRequest, "email" | "role">) {
  return apiClient.post<{ quota: QuotaCheckResult }>("/users/quota-check", payload);
}

export async function onboardUser(req: OnboardRequest) {
  return apiClient.post<{ user: Person; provisioning_steps: ProvisioningStep[] }>(
    "/users/onboard",
    req,
  );
}

export async function modifyUser(id: string, req: ModifyUserRequest) {
  return apiClient.put<{ user: Person }>(`/users/${id}`, req);
}

export async function offboardUser(id: string, req: OffboardRequest) {
  return apiClient.post<{ user: Person; revocation_steps: ProvisioningStep[] }>(
    `/users/${id}/offboard`,
    req,
  );
}

export async function reprovisionUser(id: string) {
  return apiClient.post<{
    workflow_execution: string;
    workflow_state: string;
    workflow_error?: string | null;
  }>(`/users/${id}/reprovision`);
}

export async function listUserWorkflowRuns(id: string) {
  return apiClient.get<{ runs: WorkflowRun[]; total: number }>(`/users/${id}/workflows`);
}

export async function getWorkflowExecutionStatus(executionName: string) {
  return apiClient.get<{ execution: WorkflowExecution }>("/workflows/execution", {
    params: { name: executionName },
  });
}

export async function getEffectiveAccess(id: string) {
  return apiClient.get<EffectiveAccessResult>(`/users/${id}/effective-access`);
}
