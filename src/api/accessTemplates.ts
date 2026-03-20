import { apiClient } from "@/api/client";
import type { AccessTemplate } from "@/api/types";

export interface AccessTemplateRequest {
  name: string;
  description: string;
  aws_permission_sets: string[];
  slack_channels: string[];
  github_teams: string[];
}

export async function listAccessTemplates() {
  return apiClient.get<{ templates: AccessTemplate[]; total: number }>(
    "/access-templates",
  );
}

export async function createAccessTemplate(payload: AccessTemplateRequest) {
  return apiClient.post<{ template: AccessTemplate }>("/access-templates", payload);
}

export async function updateAccessTemplate(
  id: string,
  payload: Partial<AccessTemplateRequest>,
) {
  return apiClient.put<{ template: AccessTemplate }>(`/access-templates/${id}`, payload);
}

export async function deleteAccessTemplate(id: string) {
  return apiClient.delete<{ deleted: boolean; id: string }>(`/access-templates/${id}`);
}
