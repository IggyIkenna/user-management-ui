# Application Onboarding Guide

How to onboard a new UI application so that user-management-ui controls access to it
via roles, capabilities, and entitlements.

## Prerequisites

- The application uses Firebase Auth (project: `central-element-323112`) for identity.
- The user-management API is reachable from the application at runtime.

## Per-App Onboarding Checklist

### 1. Define capabilities in seed file

Add an entry to `server/seeds/app-capabilities.initial.json`:

```json
{
  "app_id": "<your-app-id>",
  "capabilities": [
    { "key": "dashboard.view", "label": "View dashboard", "category": "view" },
    { "key": "data.edit", "label": "Edit data", "category": "control" }
  ],
  "role_presets": {
    "viewer": ["dashboard.view"],
    "editor": ["dashboard.view", "data.edit"],
    "admin": ["*"],
    "owner": ["*"]
  }
}
```

Then run the seed endpoint: `POST /api/v1/apps/capabilities/seed`.

### 2. Install Firebase in the target app

```bash
npm install firebase
```

### 3. Add environment variables

```env
NEXT_PUBLIC_AUTH_PROVIDER=firebase
NEXT_PUBLIC_FIREBASE_API_KEY=<key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=central-element-323112.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=central-element-323112
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=central-element-323112.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<sender-id>
NEXT_PUBLIC_FIREBASE_APP_ID=<app-id>
NEXT_PUBLIC_USER_MGMT_API_URL=https://user-management-api-cldtjniqvq-uc.a.run.app
```

### 4. Copy the auth SDK files

Copy these files from `unified-trading-system-ui` into the target app, adjusting
the `APP_ID` constant in `authorize-client.ts`:

| Source file                               | Purpose                                     |
| ----------------------------------------- | ------------------------------------------- |
| `lib/auth/types.ts`                       | AuthProvider interface + AuthUser type      |
| `lib/auth/firebase-config.ts`             | Firebase app singleton                      |
| `lib/auth/firebase-provider.ts`           | Firebase Auth provider                      |
| `lib/auth/authorize-client.ts`            | Calls `/api/v1/authorize` (change `APP_ID`) |
| `lib/auth/get-provider.ts`                | Provider factory                            |
| `hooks/use-auth.tsx`                      | Auth identity hook                          |
| `hooks/use-app-access.tsx`                | Authorization/capability hook               |
| `components/shell/capability-gate.tsx`    | Inline capability guard                     |
| `components/shell/require-capability.tsx` | Route-level capability guard                |
| `components/shell/access-denied.tsx`      | Access denied page                          |

### 5. Wire providers

In your root providers file:

```tsx
import { AuthProvider } from "@/hooks/use-auth";
import { AppAccessProvider } from "@/hooks/use-app-access";

export function Providers({ children }) {
  return (
    <AuthProvider>
      <AppAccessProvider>{children}</AppAccessProvider>
    </AuthProvider>
  );
}
```

### 6. Use guards in pages

```tsx
import { RequireCapability } from "@/components/shell/require-capability";
import { CapabilityGate } from "@/components/shell/capability-gate";

export default function TradingPage() {
  return (
    <RequireCapability capability="trading.view">
      <h1>Trading Dashboard</h1>
      <CapabilityGate capability="trading.execute">
        <PlaceOrderButton />
      </CapabilityGate>
    </RequireCapability>
  );
}
```

### 7. Grant access in user-management-ui

1. Navigate to Apps > your-app-id.
2. Go to Entitlements tab.
3. Grant a role (viewer/editor/admin/owner) to a user or group.
4. The user can now sign in and the app will authorize via `/api/v1/authorize`.

## Rollout Order (Recommended)

| Phase  | Apps                                                               | Status      |
| ------ | ------------------------------------------------------------------ | ----------- |
| Pilot  | unified-trading-system-ui, deployment-ui, strategy-ui              | In progress |
| Wave 2 | execution-analytics-ui, trading-analytics-ui, ml-training-ui       | Planned     |
| Wave 3 | settlement-ui, client-reporting-ui, live-health-monitor-ui         | Planned     |
| Wave 4 | batch-audit-ui, logs-dashboard-ui, onboarding-ui, unified-admin-ui | Planned     |
| Wave 5 | All remaining apps + APIs                                          | Planned     |

## Architecture

```
User clicks "Sign In"
      |
      v
Firebase Auth (signInWithEmailAndPassword)
      |
      v
Firebase ID token + UID obtained
      |
      v
App calls GET /api/v1/authorize?app_id=<id>&uid=<uid>
      |
      v
user-management-ui resolves:
  - direct entitlements (user -> app)
  - group entitlements (user -> group -> app)
  - highest role wins
  - role preset -> resolved capabilities
      |
      v
App receives: { authorized, role, capabilities[] }
      |
      v
UI guards render/hide based on capabilities
```
