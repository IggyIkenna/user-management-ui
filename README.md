# user-management-ui — ARCHIVED

This repository has been merged into the Unified Trading System.

## Merge Destination

| Concern            | Destination                                                      |
| ------------------ | ---------------------------------------------------------------- |
| **Frontend pages** | `unified-trading-system-ui` → `app/(ops)/admin/users/`           |
| **API hooks**      | `unified-trading-system-ui` → `hooks/api/use-user-management.ts` |
| **Types**          | `unified-trading-system-ui` → `lib/types/user-management.ts`     |
| **Mock handler**   | `unified-trading-system-ui` → `lib/api/mock-handler.ts`          |
| **Backend API**    | `auth-api` → `/api/auth/provisioning/*` routes                   |

## What Was Merged

- 8 admin user management pages (list, onboard, offboard, detail, access templates, access requests, health checks, workflows)
- Full provisioning API layer (React Query hooks)
- Stateful mock handler with 5 demo personas
- Unit + integration tests (ported to UTSU `__tests__/` directory)

## Do Not Use This Repo

This repo is no longer maintained. All changes must go to `unified-trading-system-ui` (frontend) or `auth-api` (backend provisioning routes).

Archived: 2026-04-01. Reason: merged into unified-trading-system-ui + auth-api.
