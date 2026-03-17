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
  name: string;
  email: string;
  role: UserRole;
  github_handle?: string;
  microsoft_upn?: string;
  slack_handle?: string;
  gcp_email?: string;
  aws_iam_arn?: string;
  product_slugs: string[];
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
}

export interface ProvisioningStep {
  service: keyof UserServices;
  label: string;
  status: "pending" | "running" | "success" | "failed";
  message?: string;
}
