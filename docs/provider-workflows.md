# Provider Workflow Definitions

This file defines the production workflow contract for `user-management-ui`.

## Global Orchestration Workflows

- `GOOGLE_WORKFLOW_ONBOARD`: orchestrates onboarding lifecycle
- `GOOGLE_WORKFLOW_MODIFY`: applies role/template/profile updates
- `GOOGLE_WORKFLOW_OFFBOARD`: handles provider deprovisioning lifecycle
- `GOOGLE_WORKFLOW_REPROVISION`: reruns provider provisioning for an existing user
- `GOOGLE_WORKFLOW_QUOTA`: returns quota gate checks for Slack and M365
- `GOOGLE_WORKFLOW_SYNC`: background drift sync and reconciliation
- `GOOGLE_WORKFLOW_BREAKGLASS_APPROVAL`: handles privileged exception approvals

## Provider Subflows (Optional but Recommended)

- `GOOGLE_WORKFLOW_GITHUB`
  - create org invite
  - assign mapped teams from template
  - revoke membership on offboard
- `GOOGLE_WORKFLOW_SLACK`
  - invite by email
  - map channels from template
  - deactivate user and remove channels on offboard
- `GOOGLE_WORKFLOW_M365`
  - create/enable user
  - assign license/group
  - disable user on offboard
- `GOOGLE_WORKFLOW_GCP`
  - add/remove IAM bindings based on role/template
  - apply service-account policy where required
- `GOOGLE_WORKFLOW_AWS`
  - IAM Identity Center assignment flow
  - breakglass IAM fallback only when enabled
- `GOOGLE_WORKFLOW_PORTAL`
  - provision/update portal profile
  - offboard/revoke portal access

## Execution Control Flags

- `WORKFLOW_EXECUTION_ENABLED`
  - `true`: invoke live Google Workflows API
  - `false`: return synthetic execution IDs for non-prod environments
- `REAL_PROVIDER_EXECUTION_ENABLED`
  - `true`: call live provider APIs from backend
  - `false`: run orchestration without direct provider mutations

## Collaborator M365 Policy

- `COLLABORATOR_M365_ENABLED=true` is the default policy.
- This means collaborator roles are treated as M365-eligible for quota checks and provisioning.
