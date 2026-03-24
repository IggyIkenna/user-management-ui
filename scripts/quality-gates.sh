#!/usr/bin/env bash
# Compatible with unified-trading-pm quickmerge.sh (Phase 1/2/3 flag contract).
set -euo pipefail

CI_MODE=false
RUN_SMOKE=true
PHASE_FULL=true
FIX_LINT=false
SKIP_LINT_STEP=false
SKIP_TESTS_STEP=false
SKIP_TYPECHECK_STEP=false

for arg in "$@"; do
  case "$arg" in
    --ci)
      CI_MODE=true
      ;;
    --no-smoke)
      RUN_SMOKE=false
      ;;
    --lint)
      PHASE_FULL=false
      ;;
    --fix)
      FIX_LINT=true
      ;;
    --no-fix)
      FIX_LINT=false
      ;;
    --skip-lint)
      SKIP_LINT_STEP=true
      ;;
    --skip-tests)
      SKIP_TESTS_STEP=true
      ;;
    --skip-typecheck)
      SKIP_TYPECHECK_STEP=true
      ;;
  esac
done

echo "=== Quality Gates (user-management-ui) ==="

run_lint() {
  if [[ "$FIX_LINT" == "true" ]]; then
    npm run lint -- --fix 2>/dev/null || true
  fi
  npm run lint
}

# Phase 1 & 2 (quickmerge): --lint with optional --fix / --no-fix — format + lint only
if [[ "$PHASE_FULL" == "false" ]]; then
  echo "--- Format check ---"
  npm run format:check
  echo "--- Lint ---"
  run_lint
  echo "=== Quality gates passed (lint phase) ==="
  exit 0
fi

echo "--- Format check ---"
npm run format:check

if [[ "$SKIP_TYPECHECK_STEP" == "false" ]]; then
  echo "--- Typecheck ---"
  npm run typecheck
fi

if [[ "$SKIP_LINT_STEP" == "false" ]]; then
  echo "--- Lint ---"
  run_lint
fi

echo "--- Next.js build ---"
npx next build

if [[ "$SKIP_TESTS_STEP" == "true" ]] || [[ "$RUN_SMOKE" == "false" ]]; then
  echo "--- Playwright smoke tests skipped (--skip-tests, --no-smoke, or agent) ---"
elif [[ "${SKIP_SMOKE_TESTS:-false}" == "true" ]]; then
  echo "--- Playwright smoke tests skipped (SKIP_SMOKE_TESTS=true) ---"
else
  echo "--- Playwright smoke tests ---"
  if [[ "$CI_MODE" == "true" ]]; then
    npx playwright install --with-deps chromium
    npm run smoketest
  else
    npm run smoketest-no-compile
  fi
fi

echo "=== Quality gates passed ==="
