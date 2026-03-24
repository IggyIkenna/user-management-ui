# Production Secret and Env Mapping

This document maps provider integrations to required env and secret references.

## Firebase and Workflows

- `GOOGLE_CLOUD_PROJECT_ID`
- `GOOGLE_CLOUD_LOCATION`
- `GOOGLE_WORKFLOW_*` names for global/provider workflows
- `GOOGLE_WORKFLOW_INVOKER_SERVICE_ACCOUNT`
- Firebase API key:
  - `FIREBASE_API_KEY` (direct env var), or
  - `SECRET_REF_FIREBASE_API_KEY` (Secret Manager ref; preferred)

## GitHub

- Env:
  - `GITHUB_ORG`
  - `GITHUB_INVITE_ROLE`
- Secret ref:
  - `SECRET_REF_GITHUB_ADMIN_PAT`

## Slack

- Env:
  - `SLACK_API_BASE_URL`
  - `SLACK_WORKSPACE_ID`
  - `SLACK_DEFAULT_CHANNEL_*` (optional defaults)
- Secret ref:
  - `SECRET_REF_SLACK_SCIM_TOKEN`
  - `SECRET_REF_SLACK_BOT_TOKEN`

## Microsoft 365 / Graph

- Env:
  - `MS_TENANT_ID`
  - `MS_GRAPH_CLIENT_ID`
  - `MS_GRAPH_SCOPE`
  - `MS_DEFAULT_DOMAIN`
  - `MS_DEFAULT_LICENSE_SKU`
  - `COLLABORATOR_M365_ENABLED`
- Secret ref:
  - `SECRET_REF_MS_GRAPH_CLIENT_SECRET`

## GCP IAM

- Env:
  - `GCP_TARGET_PROJECT_ID`
  - `GCP_TARGET_FOLDER_ID`
  - `GCP_TARGET_ORG_ID`
  - `GCP_DEFAULT_ROLE_ADMIN`
  - `GCP_DEFAULT_ROLE_COLLABORATOR`

## AWS IAM / Identity Center

- Env:
  - `AWS_REGION`
  - `AWS_BREAKGLASS_ENABLED`
  - `AWS_NATIVE_IAM_USER_PREFIX`
  - `AWS_NATIVE_IAM_USER_PATH`
  - `AWS_TEMPLATE_POLICY_MAP_JSON` (optional JSON mapping)
- Secret refs:
  - `SECRET_REF_AWS_ACCESS_KEY_ID`
  - `SECRET_REF_AWS_SECRET_ACCESS_KEY`
  - `AWS_SESSION_TOKEN` (optional)

## Portal

- Env:
  - `PORTAL_API_BASE_URL`
- Secret ref:
  - `SECRET_REF_PORTAL_SERVICE_TOKEN`

## Email and Notifications

- Env:
  - `EMAIL_PROVIDER`
  - `EMAIL_FROM`
  - `ONBOARDING_EMAIL_TEMPLATE_ID`
  - `OFFBOARDING_EMAIL_TEMPLATE_ID`
- Secret ref:
  - `SECRET_REF_SENDGRID_API_KEY`

## Security Notes

- Use Secret Manager refs in production; avoid direct raw secrets in env variables.
- Grant least privilege to service accounts executing provider calls.
- Rotate provider tokens and keys on a regular schedule.

## GitHub Deployment Variables

For CI/CD deployments, set one of these in GitHub:

- `FIREBASE_API_KEY` as a GitHub Secret, or
- `SECRET_REF_FIREBASE_API_KEY` as a GitHub Variable/Secret containing the full Secret Manager path.

The API server supports both, and resolves `SECRET_REF_FIREBASE_API_KEY` first.
