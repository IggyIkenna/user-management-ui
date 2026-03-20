export type UserRole =
  | "admin"
  | "collaborator"
  | "board"
  | "client"
  | "shareholder"
  | "accounting"
  | "operations"
  | "investor";

export type UserStatus = "active" | "offboarded" | "pending";
export type ProvisioningStatus =
  | "provisioned"
  | "not_applicable"
  | "pending"
  | "failed";
export type OffboardAction = "deactivate" | "delete";

export interface UserServices {
  github: ProvisioningStatus;
  slack: ProvisioningStatus;
  microsoft365: ProvisioningStatus;
  gcp: ProvisioningStatus;
  aws: ProvisioningStatus;
  portal: ProvisioningStatus;
}

export interface Person {
  id: string;
  firebase_uid: string;
  name: string;
  email: string;
  role: UserRole;
  github_handle?: string;
  microsoft_upn?: string;
  slack_handle?: string;
  gcp_email?: string;
  aws_iam_arn?: string;
  product_slugs: string[];
  access_template_id?: string;
  access_template?: AccessTemplate | null;
  service_messages?: Partial<Record<keyof UserServices, string>>;
  workflow_failure_reason?: string;
  status: UserStatus;
  provisioned_at: string;
  last_modified: string;
  services: UserServices;
}

export interface OnboardRequest {
  name: string;
  email: string;
  role: UserRole;
  github_handle?: string;
  product_slugs: string[];
  access_template_id?: string;
}

export interface ProvisioningStep {
  service: keyof UserServices | "firebase";
  label: string;
  status: "pending" | "running" | "success" | "failed";
  message?: string;
}

export interface ModifyUserRequest {
  role?: UserRole;
  github_handle?: string;
  product_slugs?: string[];
  access_template_id?: string;
}

export interface OffboardRequest {
  actions: Record<keyof UserServices | "firebase", OffboardAction>;
}

export interface FirebaseAuthUser {
  uid: string;
  email: string;
  display_name: string;
  disabled: boolean;
  custom_claims?: Record<string, string | boolean | number>;
}

export interface ServiceQuota {
  service: "slack" | "microsoft365";
  used: number;
  limit: number;
  available: number;
}

export interface QuotaCheckResult {
  ok: boolean;
  checks: ServiceQuota[];
  message?: string;
}

export interface AccessTemplate {
  id: string;
  name: string;
  description: string;
  aws_permission_sets: string[];
  slack_channels: string[];
  github_teams: string[];
  assigned_user_count?: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRun {
  id: string;
  firebase_uid: string;
  run_type: "onboard" | "modify" | "offboard" | "reprovision" | string;
  workflow_name: string;
  execution_name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowExecution {
  name: string;
  state: string;
  argument?: string;
  result?: string;
  error?: string;
  startTime?: string;
  endTime?: string;
}

export interface HealthCheckItem {
  provider: string;
  ok: boolean;
  message: string;
  details?: unknown;
  checked_at: string;
}

export interface HealthCheckResult {
  ok: boolean;
  checked_at: string;
  checks: HealthCheckItem[];
}

export interface HealthCheckHistoryEntry {
  id: string;
  ok: boolean;
  checked_at: string;
  checks: HealthCheckItem[];
}
