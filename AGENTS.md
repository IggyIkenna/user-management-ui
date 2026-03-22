# AGENTS.md — user-management-ui

## Quick Reference for AI Agents

### Key Commands
- **Quality gates**: `cd user-management-ui && bash scripts/quality-gates.sh`
- **UI tests**: `cd user-management-ui && CI=true npm test -- --run`
- **UI smoke build**: `cd user-management-ui && VITE_MOCK_API=true npx vite build`
- **Source dir**: `user-management-ui/src/` (TypeScript/React)

### Mandatory Rules
Before any action, read:
`unified-trading-pm/cursor-configs/SUB_AGENT_MANDATORY_RULES.md`

### Rules Summary
- UI repos use `npm` (not uv/pip) for dependencies
- Vitest must use `pool: "forks"` (not threads)
- `VITE_MOCK_API=true` for mock mode

### Workspace
WORKSPACE_ROOT: `/Users/ikennaigboaka/Code/unified-trading-system-repos`
