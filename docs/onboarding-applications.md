# Onboarding Applications to the User Management Platform

## Overview

This document describes how to register a new application in the Odum Research User Management Platform so that user and group access can be centrally controlled. All applications share a single Firebase Auth project (`central-element-323112`) for identity; this platform manages per-app authorization.

## Prerequisites

Before onboarding an application you need:

1. A GitHub repository under the `IggyIkenna` organization.
2. The application deployed (or deployable) to at least one environment (`dev`, `staging`, or `prod`).
3. Firebase Auth integrated in the application for login (using `unified-trading-ui-auth` for UIs, or Firebase Admin SDK token verification for APIs).
4. Admin access to the User Management Platform at `http://localhost:5184` (or the deployed URL).

## Application Categories

| Category | Description | Examples |
|---|---|---|
| `ui` | Browser-based frontend application | deployment-ui, strategy-ui, ml-training-ui |
| `api` | HTTP API that validates user tokens | deployment-api, config-api, market-data-api |
| `service` | Backend service with operator access controls | execution-service, instruments-service |
| `control_plane` | Platform infrastructure application | user-management-ui |

## Step 1: Register the Application

### Option A: Add to the Seed File (Recommended for Bulk)

Add an entry to `server/seeds/applications.initial.json`:

```json
{
  "app_id": "my-new-app",
  "name": "My New Application",
  "repo": "IggyIkenna/my-new-app",
  "category": "ui",
  "auth_mode": "firebase_shared",
  "environments": ["dev", "staging", "prod"],
  "owner_team": "platform-engineering",
}
```

Then run the seed endpoint:

```bash
curl -X POST http://localhost:8017/api/v1/apps/seed
```

The seed is idempotent: existing apps are updated, new apps are created, nothing is deleted.

### Option B: Add Directly via Firestore

Create a document in the `applications` Firestore collection with these fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `app_id` | string | yes | Unique kebab-case identifier (e.g. `my-new-app`) |
| `name` | string | yes | Human-readable display name |
| `repo` | string | yes | GitHub repo path (e.g. `IggyIkenna/my-new-app`) |
| `category` | string | yes | One of: `ui`, `api`, `service`, `control_plane` |
| `auth_mode` | string | yes | Always `firebase_shared` for this platform |
| `environments` | array | yes | List of environments: `["dev", "staging", "prod"]` |
| `owner_team` | string | yes | Owning team identifier |
| `default_template_id` | string | no | Optional access template to auto-apply |
| `status` | string | yes | `active`, `pending`, or `archived` |
| `created_at` | string | auto | ISO 8601 timestamp |
| `updated_at` | string | auto | ISO 8601 timestamp |

### Option C: Use the Admin UI

1. Navigate to the **Applications** page (`/apps`).
2. Click **Discover Apps Now** to sync from Firestore.
3. New applications added to the `applications` collection will appear automatically.

## Step 2: Define App Capabilities

Capabilities define what features an application exposes, split into two categories:

- **view** -- read-only features (e.g. `deployments.view`, `logs.view`)
- **control** -- actions the user can perform (e.g. `deployments.trigger`, `config.edit`)

### How to Define Capabilities

1. Go to **Applications** > click the app > **Capabilities** tab.
2. Add capabilities with a key (e.g. `deployments.trigger`), label, and category (view/control).
3. Configure **role presets** -- which capabilities each role includes by default.
4. Click **Save Capabilities**.

### Seed Capabilities for All Apps

Run the capability seed endpoint to load defaults for all 23 registered apps:

```bash
curl -X POST http://localhost:8017/api/v1/apps/capabilities/seed
```

### Role Presets

Each role maps to a default set of capabilities:

| Role | Default Capabilities |
|---|---|
| `viewer` | All `view` capabilities |
| `editor` | All `view` + most `control` capabilities |
| `admin` | `*` (all capabilities) |
| `owner` | `*` (all capabilities) |

When granting access, you can optionally override capabilities per user/group.

## Step 3: Configure Access Roles

Each application supports four access roles:

| Role | Intent | Typical Use |
|---|---|---|
| `viewer` | Read-only access | Dashboards, reports, monitoring |
| `editor` | Read + write access | Day-to-day operators, traders |
| `admin` | Full application admin | Team leads, service owners |
| `owner` | Highest privilege + can manage access | Platform admins only |

## Step 3: Grant Access

### To Individual Users

1. Go to **Applications** > click the app row > app detail page.
2. In the **Grant Access** panel, select **User** from the type dropdown.
3. Choose a Firebase user from the dropdown.
4. Select a role.
5. Click **Grant**.

### To Groups (Recommended for Teams)

1. Go to **Groups** (`/groups`) and create a group if needed.
2. Add team members to the group.
3. Either:
   - Go to the app detail page and grant access to the group, or
   - Use **Bulk Assign** on the Groups page to assign the group to multiple apps at once.

### Bulk Assignment

1. Go to **Groups** > expand the target group.
2. Click **Select Apps to Assign**.
3. Check the apps, select a role, click **Assign**.

All grants are persisted in the `app_entitlements` Firestore collection and logged in the `audit_log` collection.

## Step 4: Verify Access

### Effective Access View

Navigate to any user's detail page (`/users/:id`). The **Effective App Access** section shows:

- Every app the user can access.
- Whether access is direct or via a group.
- The highest effective role across all grant sources.

### Audit Log

Navigate to **Audit Log** (`/audit-log`) to see a chronological record of all grant, revoke, and group membership changes across all applications.

Per-app audit is also visible at the bottom of each app detail page.

## Step 5: Integrate Authorization in Your Application

### For UI Applications (React/Vite)

Your UI already authenticates via `unified-trading-ui-auth`. To enforce per-app authorization:

1. After login, call the effective-access endpoint:

```
GET /api/v1/users/{firebase_uid}/effective-access
```

2. Check if your `app_id` appears in the response.
3. Use the `effective_role` to control what the user can see/do.

### For API Applications (Express/FastAPI)

1. Verify the Firebase ID token from the `Authorization: Bearer <token>` header.
2. Extract `uid` from the verified token.
3. Query entitlements:

```
GET /api/v1/apps/{app_id}/entitlements
```

4. Check if the requesting user (or any of their groups) has an entitlement.
5. Enforce role-based access on your endpoints.

## Application Lifecycle

| Status | Meaning |
|---|---|
| `active` | Application is registered and access can be granted |
| `pending` | Application is registered but not yet ready for access grants |
| `archived` | Application is decommissioned; existing grants are preserved but no new grants allowed |

To archive an application, update its status to `archived` via the API:

```bash
curl -X PUT http://localhost:8017/api/v1/apps/{app_id} \
  -H "Content-Type: application/json" \
  -d '{"status": "archived"}'
```

## Currently Registered Applications

### UI Applications (13)

| App ID | Name |
|---|---|
| batch-audit-ui | Batch Audit UI |
| client-reporting-ui | Client Reporting UI |
| deployment-ui | Deployment UI |
| execution-analytics-ui | Execution Analytics UI |
| live-health-monitor-ui | Live Health Monitor UI |
| logs-dashboard-ui | Logs Dashboard UI |
| ml-training-ui | ML Training UI |
| onboarding-ui | Onboarding UI |
| odum-research-website | Odum Research Website |
| settlement-ui | Settlement UI |
| strategy-ui | Strategy UI |
| trading-analytics-ui | Trading Analytics UI |
| unified-admin-ui | Unified Admin UI |

### API Applications (9)

| App ID | Name |
|---|---|
| batch-audit-api | Batch Audit API |
| client-reporting-api | Client Reporting API |
| config-api | Config API |
| deployment-api | Deployment API |
| execution-results-api | Execution Results API |
| market-data-api | Market Data API |
| ml-inference-api | ML Inference API |
| ml-training-api | ML Training API |
| trading-analytics-api | Trading Analytics API |

### Control Plane (1)

| App ID | Name |
|---|---|
| user-management-ui | User Management UI |

## Adding a New Application Checklist

- [ ] Application repo exists under `IggyIkenna` org
- [ ] Firebase Auth integrated for login
- [ ] Entry added to `applications` Firestore collection (seed file or direct)
- [ ] Seed endpoint run or "Discover Apps Now" clicked
- [ ] Application appears in `/apps` page with `active` status
- [ ] Access roles defined and documented for the team
- [ ] Initial user/group access grants created
- [ ] Effective access verified for at least one user
- [ ] Authorization enforcement integrated in the application code
- [ ] Audit log confirms grants are recorded

## Firestore Collections Reference

| Collection | Purpose |
|---|---|
| `applications` | App registry (source of truth for registered apps) |
| `app_entitlements` | User/group-to-app access grants |
| `user_groups` | Group definitions with member lists |
| `audit_log` | Chronological record of all access control changes |
| `app_sync_history` | History of app discovery sync runs |
| `app_capabilities` | Per-app capability definitions and role presets |

## API Endpoints Reference

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/apps` | List all registered applications |
| GET | `/api/v1/apps/:id` | Get single application |
| PUT | `/api/v1/apps/:id` | Update application metadata |
| POST | `/api/v1/apps/seed` | Import apps from seed file |
| POST | `/api/v1/apps/sync` | Sync and normalize existing apps |
| GET | `/api/v1/apps/:appId/entitlements` | List entitlements for an app |
| POST | `/api/v1/apps/:appId/entitlements` | Grant user/group access |
| DELETE | `/api/v1/apps/:appId/entitlements/:entId` | Revoke access |
| GET | `/api/v1/groups` | List all groups |
| POST | `/api/v1/groups` | Create a group |
| POST | `/api/v1/groups/:id/members` | Add member to group |
| DELETE | `/api/v1/groups/:id/members/:uid` | Remove member from group |
| POST | `/api/v1/groups/:id/bulk-assign` | Assign group to multiple apps |
| GET | `/api/v1/users/:id/effective-access` | Get effective access for a user |
| GET | `/api/v1/audit-log` | Global audit log |
| GET | `/api/v1/audit-log/app/:appId` | Per-app audit log |
| GET | `/api/v1/apps/:appId/capabilities` | Get app capability definition |
| PUT | `/api/v1/apps/:appId/capabilities` | Set/update capabilities and role presets |
| POST | `/api/v1/apps/capabilities/seed` | Seed capabilities from file |
| GET | `/api/v1/authorize?app_id=X&uid=Y&env=Z` | Runtime authorization check for consumer apps |

## Integration: The /authorize Endpoint

This is the single endpoint every consumer app calls to check a user's permissions.

### Request

```
GET /api/v1/authorize?app_id=deployment-ui&uid=<firebase_uid>&env=prod
```

### Response

```json
{
  "authorized": true,
  "role": "editor",
  "capabilities": ["deployments.view", "deployments.trigger", "config.view", "logs.view"],
  "source": "direct",
  "environments": ["dev", "staging", "prod"]
}
```

### For UI Applications

After Firebase login, fetch the user's capabilities:

```typescript
const res = await fetch(
  `/api/v1/authorize?app_id=${APP_ID}&uid=${firebaseUser.uid}&env=${ENV}`
);
const auth = await res.json();

if (!auth.authorized) {
  // redirect to access-denied page
}

// Use capabilities to show/hide features
const canDeploy = auth.capabilities.includes("*") || auth.capabilities.includes("deployments.trigger");
const canViewLogs = auth.capabilities.includes("*") || auth.capabilities.includes("logs.view");
```

### For API Applications

Add middleware that checks authorization on each request:

```python
async def check_permissions(request, app_id, required_capability):
    uid = verify_firebase_token(request.headers["Authorization"])
    res = httpx.get(f"{USER_MGMT_URL}/api/v1/authorize", params={
        "app_id": app_id, "uid": uid, "env": ENV
    })
    auth = res.json()
    if not auth["authorized"]:
        raise HTTPException(403, "Not authorized")
    if "*" not in auth["capabilities"] and required_capability not in auth["capabilities"]:
        raise HTTPException(403, f"Missing capability: {required_capability}")
```

### Backward Compatibility

- If no capabilities are defined for an app, admin/owner roles return `["*"]`
- If an entitlement has no explicit capabilities, the role preset is used
- Consumer apps should treat `["*"]` as full access
