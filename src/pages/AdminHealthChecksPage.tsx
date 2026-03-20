import { useMutation, useQuery } from "@tanstack/react-query";
import { listHealthCheckHistory, runHealthChecks } from "@/api/admin";

export default function AdminHealthChecksPage() {
  const healthChecks = useMutation({
    mutationFn: runHealthChecks,
  });
  const { data: historyData, refetch: refetchHistory } = useQuery({
    queryKey: ["admin-health-check-history"],
    queryFn: listHealthCheckHistory,
  });

  const checks = healthChecks.data?.data.checks || [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-zinc-100">
          Provider Health Checks
        </h1>
        <p className="text-sm text-zinc-400">
          Verify provider credentials and API reachability across Firebase, GitHub,
          Slack, Microsoft 365, GCP, AWS, and Workflows.
        </p>
      </div>

      <button
        onClick={async () => {
          await healthChecks.mutateAsync();
          await refetchHistory();
        }}
        disabled={healthChecks.isPending}
        className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-60"
      >
        {healthChecks.isPending ? "Running..." : "Run Health Checks"}
      </button>

      {healthChecks.isError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {String(healthChecks.error)}
        </div>
      )}

      {checks.length > 0 && (
        <div className="space-y-3">
          {checks.map((check) => (
            <div
              key={`${check.provider}-${check.checked_at}`}
              className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-100">{check.provider}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    check.ok
                      ? "bg-green-500/20 text-green-300"
                      : "bg-red-500/20 text-red-300"
                  }`}
                >
                  {check.ok ? "ok" : "failed"}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-300">{check.message}</p>
              {Boolean(check.details) && (
                <pre className="mt-2 overflow-x-auto rounded bg-zinc-900/70 p-2 text-xs text-zinc-400">
                  {JSON.stringify(check.details, null, 2)}
                </pre>
              )}
              <p className="mt-2 text-xs text-zinc-500">{check.checked_at}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-400">
          Recent Health Runs
        </h2>
        {(historyData?.data.runs || []).length === 0 ? (
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4 text-sm text-zinc-500">
            No persisted health-check history yet.
          </div>
        ) : (
          (historyData?.data.runs || []).map((run) => (
            <div
              key={run.id}
              className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-100">{run.checked_at}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    run.ok
                      ? "bg-green-500/20 text-green-300"
                      : "bg-red-500/20 text-red-300"
                  }`}
                >
                  {run.ok ? "ok" : "failed"}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">
                {run.checks.filter((c) => !c.ok).length} failing checks
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
