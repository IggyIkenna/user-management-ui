# Unified Trading System — Codex Instructions

## Environment: Venv Split (SSOT: venv-usage-ssot.mdc)

| Use case                  | Venv                        | Command                                                      |
| ------------------------- | --------------------------- | ------------------------------------------------------------ |
| **Quality gates / tests** | Repo `.venv`                | `cd <repo> && bash scripts/quality-gates.sh` — no activation |
| **IDE / general Python**  | Workspace `.venv-workspace` | `source \${WORKSPACE_ROOT}/.venv-workspace/bin/activate`     |

**Never** run `pytest` directly — uses wrong venv. Always use `quality-gates.sh`.

At session start, for general Python (not tests):

```bash
# WORKSPACE_ROOT = $UNIFIED_TRADING_WORKSPACE_ROOT or first workspace folder
source "\${WORKSPACE_ROOT:-.}/.venv-workspace/bin/activate"
which python  # .venv-workspace/bin/python
```

`.Codex/settings.json` may prepend `.venv-workspace/bin` to PATH — if so, checks pass without manual activation.

## Rules: Read Before Coding

Read these before making ANY code changes:

1. `.cursorrules` — workspace standards (uv not pip, quickmerge not git push, etc.)
2. `.cursor/rules/no-empty-fallbacks.mdc` — no try/except fallback imports
3. `.cursor/rules/no-type-any-use-specific.mdc` — no Any types
4. `unified-trading-codex/06-coding-standards/README.md` — coding standards
5. `unified-trading-pm/plans/PLAN_FORMAT.md` — plan format; **Cursor checkboxes** (`- [x]` / `- [ ]`) required on every
   todo

## Key Rules (Quick Reference)

- **Flat deps only** — every `pyproject.toml` has ONE list: `[project.dependencies]`. No
  `[project.optional-dependencies]` ever — not `dev`, not `test`, not any group. Never use `.[dev]` extras (e.g.
  `uv pip install -e .` not `uv pip install -e ".[dev]"`). Tests run locally, Cloud Build, Code Build, and GHA — all
  need all deps. Optional groups are pointless and create conflicts.
- `uv pip install` not `pip install`
- `ARG PROJECT_ID` +
  `FROM --platform=linux/amd64 asia-northeast1-docker.pkg.dev/${PROJECT_ID}/unified-trading-library/unified-trading-library:latest`
  in Dockerfiles — never `python:3.13-slim` or `pip install uv`
- `bash scripts/quickmerge.sh "message" --agent` not `git push` — always use `--agent` in Codex sessions
- Two-pass model: `bash scripts/quality-gates.sh` first (Pass 1 — full), then `quickmerge --agent` (Pass 2 —
  lint/format/typecheck/codex, no tests, no act)
- **NEVER use `--dep-branch` in agent/Codex sessions** — it is a human-only flag. Quickmerge exits(1) if
  `--dep-branch` is combined with `--agent`. Branch is read automatically from `active_feature_branch` in
  `workspace-manifest.json` (currently: `live-defi-rollout`). Dep conflict? Commit dep repo first, then re-run.
- `from unified_events_interface import setup_events, log_event` — no fallbacks
- `basedpyright` not `pyright` (and always with `run_timeout 120 basedpyright <source_dir>/`)
- No `os.getenv()` — use `UnifiedCloudConfig`
- No `# type: ignore` to hide architectural violations — fix the root cause
- No `try/except ImportError` around library imports — fail loud

## Version Graduation (1.0.0 Process)

All repos start at 0.x.x. The semver-agent pre-1.0.0 override prevents automatic crossing to 1.0.0 (feat! on 0.x.x =
MINOR bump, not MAJOR). 1.0.0 is a deliberate human decision.

**How to graduate a repo to 1.0.0:**

1. GitHub UI: Actions → `request-major-bump` → Run workflow → proposed_version=1.0.0, reason="..."
2. CLI: `gh workflow run request-major-bump.yml --repo IggyIkenna/<repo> -f proposed_version="1.0.0" -f reason="..."`
3. Telegram sends you the approval issue link
4. Comment `/approve` on the GitHub Issue to execute the bump
5. Bump goes to staging → SIT validates → promotes to main

**Post-1.0.0 semver rules change:** feat! = MAJOR bump (opens approval issue), not MINOR.

## PM/Codex Doc-Only Fast-Path

When quickmerging PM or codex repos:

- **Plans, docs, cursor rules** (plans/, docs/, cursor-configs/, cursor-rules/, _.md, _.mdc) → PR targets **main**
  directly. Plan agents fire immediately.
- **Scripts, workflows** (scripts/, .github/workflows/) → PR targets **staging**. Goes through SIT validation.

This ensures plan changes propagate instantly to agents (plan-health, rules-alignment, codex-sync) without waiting for
the full SIT cycle.

## Plan Locking

Plans with `locked_by: <branch>` in frontmatter cannot be archived by agents or deleted without `[unlock-plan]` in the
commit message. This prevents premature removal of plans that are actively being implemented.

- To lock: add `locked_by: live-defi-rollout` and `locked_since: 2026-03-16` to plan frontmatter
- To unlock: remove those fields from frontmatter
- PM quality-gates.sh blocks deletion of locked plans without `[unlock-plan]` tag
- **Agent unlock protocol:** Agents may ASK the human to unlock a plan when all todos are done, but must NEVER unlock
  autonomously. If approved, agent removes `locked_by`/`locked_since` and includes `[unlock-plan]` in commit.

## Workflow Templates (Canonical in PM)

Per-repo GitHub Actions workflows are managed as **canonical templates** in PM, not flat copies:

- **Templates SSOT:** `unified-trading-pm/scripts/workflow-templates/`
- **Rollout (generic):** `bash unified-trading-pm/scripts/propagation/rollout-workflow-templates.sh`
- **Rollout (semver-agent):** `bash unified-trading-pm/scripts/propagation/rollout-semver-agent.sh`

| Workflow                        | Pattern                                                     | Why                                     |
| ------------------------------- | ----------------------------------------------------------- | --------------------------------------- |
| `request-major-bump.yml`        | Reusable (`workflow_call`)                                  | `workflow_dispatch` supports forwarding |
| `major-bump-issue-handler.yml`  | Canonical template (flat copy)                              | `issue_comment` can't forward           |
| `staging-lock-check.yml`        | Canonical template (flat copy)                              | `pull_request` can't forward            |
| `update-dependency-version.yml` | Canonical template (flat copy)                              | `repository_dispatch` can't forward     |
| `semver-agent.yml`              | Template + substitution (`__REPO_NAME__`, `__SOURCE_DIR__`) | Repo-specific env vars                  |

**Never edit per-repo workflow copies directly.** Edit the PM template, then run the rollout script.

## Force-Sync Warning (CRITICAL)

`admin-force-sync-all-to-main.sh` overwrites remote main with local HEAD. **This can revert remote-only changes** —
especially version bumps made by GitHub Actions workflows (semver-agent, major-bump-approval).

**Before any force-sync:**

1. Run `bash unified-trading-pm/scripts/repo-management/run-version-alignment.sh` — step [0.96] checks for remote
   staging/feature branch version drift
2. If drift is found: `git fetch origin staging && git checkout origin/staging -- pyproject.toml` per repo
3. Only force-sync after resolving all drift

**After a force-sync:** re-run version alignment to confirm no remote bumps were reverted.

## Testing Infrastructure (Emulators & Mocks)

All tests run credential-free (`CLOUD_PROVIDER=local CLOUD_MOCK_MODE=true`). Protocol-faithful emulators and mocks
replace live cloud services (see `unified-trading-pm/plans/archive/cicd_mock_hardening_2026_03_11.plan.md`).

**GCP Emulators** (auto-detected by SDK via env vars):

- Pub/Sub: `PUBSUB_EMULATOR_HOST=localhost:8085`
- GCS: `STORAGE_EMULATOR_HOST=http://localhost:4443` (fsouza/fake-gcs-server)
- BigQuery: `BIGQUERY_EMULATOR_HOST=localhost:9050`

**AWS**: `@mock_aws` decorator (moto) — no credentials, no emulator process needed.

**Network blocking**: `pytest --block-network` blocks all sockets; `@pytest.mark.allow_network` opts out.

**WS tests**: Use `MockWebSocketFeed` from `unified-market-interface/tests/fixtures/mock_ws_server.py`.

**DeFi tests**: Use `responses` library (`@responses.activate`, `passthrough=False`) for Hyperliquid REST.

**Local stack**: `bash unified-trading-pm/scripts/demo-mode.sh --seed` — no credentials required.

**Cassette parity**: `cd unified-api-contracts && pytest tests/test_cassette_schema_parity.py` — runs on every commit.

## Local Development

Start the full stack locally with mock mode (no credentials needed):

```bash
bash unified-trading-pm/scripts/dev/dev-start.sh --all --mode mock    # start all UIs + APIs
bash unified-trading-pm/scripts/dev/dev-stop.sh                       # stop all
bash unified-trading-pm/scripts/dev/dev-status.sh                     # check status
```

### 5 Mode Axes

| Axis       | Env Var           | Mock value    | Real value      | Controls                           |
| ---------- | ----------------- | ------------- | --------------- | ---------------------------------- |
| UI data    | `VITE_MOCK_API`   | `true`        | `false`         | Client-side mock data vs API calls |
| UI auth    | `VITE_SKIP_AUTH`  | `true`        | `false`         | OAuth login requirement            |
| API data   | `CLOUD_MOCK_MODE` | `true`        | `false`         | Sample data vs real cloud          |
| API auth   | `DISABLE_AUTH`    | `true`        | unset           | Token validation                   |
| Mock state | `MOCK_STATE_MODE` | `interactive` | `deterministic` | Stateful vs stateless              |

### Presets

| Preset       | Flag              | Use case                                                                   |
| ------------ | ----------------- | -------------------------------------------------------------------------- |
| **ci**       | `--mode ci`       | CI smoke tests, deterministic (no cache persistence)                       |
| **mock**     | `--mode mock`     | Local dev/UAT (default), interactive state persists in `.local-dev-cache/` |
| **api-real** | `--mode api-real` | Test APIs against real cloud data                                          |
| **real**     | `--mode real`     | Staging-like, needs credentials + OAuth                                    |

### Cache Cleanup

```bash
bash unified-trading-pm/scripts/dev/dev-stop.sh --clean     # stop + wipe .local-dev-cache/
bash unified-trading-pm/scripts/dev/dev-start.sh --reset     # wipe cache + start fresh
```

### Quick Test Reference

| What                 | Command                                             |
| -------------------- | --------------------------------------------------- |
| Python quality gates | `cd <repo> && bash scripts/quality-gates.sh`        |
| UI tests (headless)  | `cd <ui-repo> && CI=true npm test -- --run`         |
| UI smoke build       | `cd <ui-repo> && VITE_MOCK_API=true npx vite build` |

UIs on ports 5173-5183, APIs on 8004-8016. Port registry SSOT: `unified-trading-pm/scripts/dev/ui-api-mapping.json`.
Vitest must use `pool: "forks"` (not threads) to prevent zombie node processes.

Full guide: `unified-trading-codex/08-workflows/local-dev.md`

## This is a Multi-Repo Workspace (NOT a monorepo)

Each subdirectory is an independent git repo. When editing, only commit to the target repo. Never run `basedpyright .`
from workspace root — always run per-repo with timeout.

## System-First Architecture (No Ad-Hoc Solutions)

The 67-repo Unified Trading System already covers every domain. Before implementing anything — feature, fix, refactor,
new capability — **look at the existing system first**. Do NOT build ad-hoc solutions, duplicate sources of truth, or
create unnecessary repos/files. If a library is missing a feature, ADD the feature to the library. If the library's
approach is wrong, FIX it. Never work around it.

Key repo mapping: events → `unified-events-interface`, schemas → `unified-internal-contracts` / `unified-api-contracts`,
cloud → `unified-cloud-interface`, config → `unified-config-interface`, market data → `unified-market-interface`,
execution → `unified-trade-execution-interface`, domain utils → `unified-domain-client` / `unified-trading-library`,
features → `unified-features-interface` / `unified-feature-orchestration-library`, sports reference →
`unified-sports-reference-interface`, UI → check existing 13 UIs first.

**Citadel Import Rules (UAC):** All consumer repos import from UAC domain facades only
(`from unified_api_contracts.{domain} import ...`). Never import from `unified_api_contracts.canonical.*` or
`unified_api_contracts.normalize_utils.*` — those are UAC-internal. See `imports/uac-import-surface-enforcement.mdc`.

Full decision tree: `SUB_AGENT_MANDATORY_RULES.md` §0.

## Plan Format (Cursor Checkboxes)

When creating or editing plans in `plans/active/` or `plans/ai/`, every todo's first content line MUST start with a
Markdown checkbox: `- [x]` for done, `- [ ]` for pending. Format: `- [x] [SCRIPT] P0. Description...` or
`- [ ] [AGENT] P0. Fix...`. This ensures Cursor Plan Mode renders filled vs hollow circles correctly. See
`plans/PLAN_FORMAT.md` § Cursor-Friendly Todo Checkboxes.

## Citadel-Grade Planning Standards

Every plan MUST follow these standards. Agents creating plans that don't meet these standards MUST be corrected.

### 1. Pre-Audit Before Execution

Before writing any code, audit the blast radius:

- Search the entire workspace for every import/reference to symbols being moved, deleted, or renamed
- Build a **pre-audit manifest**: repo, file, line number, import statement, action needed
- Embed the manifest in the plan so executing agents don't need to re-scan
- If working with a subset of repos (background agent), document what you CAN'T verify

### 2. Phased Execution DAG

Plans MUST define execution phases with clear dependencies:

- **Phase N** items run in parallel within the phase
- **QG gates** between phases — next phase cannot start until prior phase QG passes
- Mark items as PARALLEL or SEQUENTIAL explicitly
- Draw the dependency graph (ASCII or Mermaid) in the plan context section

### 3. No Technical Debt

- No backwards compatibility shims, re-exports of old paths, or deprecation wrappers
- Clean breaks: old implementation deleted, new implementation in place, consumers updated
- **Exception**: When working on a single repo without all downstream siblings available, backwards compatibility IS
  allowed temporarily. Document it as a follow-up todo.
- When all 60+ repos are available (full workspace): zero technical debt, update everything

### 4. Parallelization

- Maximize parallel execution. If items have no dependency, they MUST be marked PARALLEL
- Group independent items into parallel batches
- Use separate agents for parallel work where possible
- Document the parallelization strategy in the plan

### 5. Success Criteria

Every plan MUST declare explicit success criteria per phase:

- **Code gates**: quality-gates.sh pass, basedpyright clean, ruff clean
- **Test gates**: unit tests pass, integration tests pass (specify which)
- **Deployment gates**: D1-D5 (if applicable)
- **Business gates**: B1-B6 (if applicable)
- The final phase MUST include workspace-wide QG validation of all affected repos

### 6. Downstream Consumer Updates

When modifying shared libraries (UAC, UIC, UTL, UCI, UEI, UDC):

- Pre-audit identifies EVERY downstream consumer
- Plan includes explicit fix items for each affected repo
- No "fix later" — all consumers updated in the same plan
- Quality gates run on each affected downstream repo

### 7. Single Source of Truth

- Types/schemas belong in ONE place. UAC for external data normalization, UIC for internal.
- No service should self-declare types that exist in contracts libraries
- No re-definition of enums, dataclasses, or Pydantic models that already exist upstream
- Pre-audit should catch self-declared duplicates and include them in the fix manifest

## Sub-Agents & Autonomous Agents: Full Rules Required (MANDATORY)

Sub-agents (Task tool, mcp_task) and autonomous agents (GHA workflows, Codex `--print`, Cursor background agents)
start with FRESH context and do NOT inherit your rules. Reduced context makes them miss rules unless you explicitly
provide them.

**CRITICAL: Agents in `--print` mode CANNOT read files from disk.** Telling them "read .cursorrules" is useless — they
never see it. Rules MUST be pasted directly into the prompt text.

**When launching ANY sub-agent or autonomous agent:**

1. **For local scripts:** Use `inject-mandatory-rules.sh`:
   ```bash
   RULES=$(bash unified-trading-pm/scripts/agents/inject-mandatory-rules.sh "$WORKSPACE_ROOT" "$REPO")
   ```
2. **For GHA workflows:** Load rules via `GITHUB_ENV` heredoc in a prior step, then prepend `${MANDATORY_RULES}` to the
   prompt.
3. **For Cursor/Codex sub-agents (Task tool):** Paste contents of
   `unified-trading-pm/cursor-configs/SUB_AGENT_MANDATORY_RULES.md` at the TOP of the prompt.
4. **If paste is impractical:** Include at TOP: "Before any action, read
   unified-trading-pm/cursor-configs/SUB_AGENT_MANDATORY_RULES.md and follow ALL rules strictly."
5. **Always include:** WORKSPACE_ROOT path. For tests: `cd <repo> && bash scripts/quality-gates.sh` (per-repo .venv).
   Never .venv-workspace for pytest.
6. **If rules injection fails, the agent MUST NOT proceed.** Exit with error.

Never rely on sub-agents "inheriting" rules — they cannot. Always inject the full rules. **SSOT:**
`unified-trading-pm/scripts/agents/inject-mandatory-rules.sh`

## Analysis Rules

When analyzing codebase architecture:

- EXCLUDE: .venv*, venv/, node_modules/, build/, dist/, *.egg-info/
- EXCLUDE: Documentation files (\*.md) when counting code usage
- EXCLUDE: Shell scripts when analyzing Python patterns
- FOCUS: Python source files in service directories only
- Use: `--glob '!.venv*' --glob '!**/.venv*/**'` with ripgrep

## Correct search commands for architectural analysis

```bash
rg "pattern" --type py --glob '!.venv*' --glob '!build' --glob '!tests'
grep -r "pattern" --include="*.py" --exclude-dir=".venv*" --exclude-dir="tests"
```

## Workspace Configs (Canonical in PM)

- **Canonical:** `unified-trading-pm/cursor-configs/`
- **Symlink:** `.cursor/workspace-configs` → `unified-trading-pm/cursor-configs`
- **Setup:** `bash unified-trading-pm/scripts/workspace/setup-workspace-config-symlink.sh`

**Workspaces:**

- `unified-trading-system-repos.code-workspace` — full (all 59 manifest repos)
- `workspace-libraries` — T0–T2 libraries
- `workspace-uis` — UI repos
- `workspace-trading` — execution, strategy, risk
- `workspace-data-pipeline` — instruments, market data, features
- `workspace-ml` — ML services
- `workspace-features` — feature services
- `workspace-infrastructure` — deployment, infra
- `workspace-complete` / `workspace-full-pipeline` — all repos

All paths use `${workspaceFolder}` — portable across users. Strict basedpyright (reportAny, reportUnknownMemberType,
reportUnknownVariableType = error).

## UAC Citadel Architecture

This repo uses a facade pattern with per-source co-location.

**Current layout**: `canonical/domain/` (sub-packages), `canonical/crosscutting/`, `external/{source}/` (flat, 80+
dirs), `normalize_utils/` (internal), `registry/`, root facades (market.py, execution.py, etc.)

**Deleted dirs** (do NOT reference): `canonical/normalize/`, `external/sports/`, `external/cloud_sdks/`,
`external/onchain/`, `external/macro/`, `schemas/`, `shared/`

**Import rules**: Services use `from unified_api_contracts import X` or `from unified_api_contracts.{domain} import X`.
Deep paths (`canonical.*`, `normalize_utils.*`) are UAC-internal only. SSOT:
`unified-trading-codex/02-data/contracts-scope-and-layout.md`
