#!/usr/bin/env bash
set -euo pipefail

CI_MODE=false
RUN_SMOKE=true

for arg in "$@"; do
  case "$arg" in
    --ci)
      CI_MODE=true
      ;;
    --no-smoke)
      RUN_SMOKE=false
      ;;
  esac
done

echo "=== Quality Gates (user-management-ui) ==="
echo "--- Format check ---"
npm run format:check

echo "--- Typecheck ---"
npm run typecheck

echo "--- Lint ---"
npm run lint

echo "--- Next.js build ---"
npx next build

if [[ "$RUN_SMOKE" == "true" ]]; then
  if [[ "${SKIP_SMOKE_TESTS:-false}" == "true" ]]; then
    echo "--- Playwright smoke tests skipped (SKIP_SMOKE_TESTS=true) ---"
    echo "=== Quality gates passed ==="
    exit 0
  fi
  echo "--- Playwright smoke tests ---"
  if [[ "$CI_MODE" == "true" ]]; then
    npx playwright install --with-deps chromium
    npm run smoketest
  else
    npm run smoketest-no-compile
  fi
fi

echo "=== Quality gates passed ==="
