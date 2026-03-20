import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  MinusCircle,
  Pencil,
  RefreshCw,
  Loader2,
} from "lucide-react";
import type { ProvisioningStatus } from "@/api/types";
import {
  getUser,
  getWorkflowExecutionStatus,
  listUserWorkflowRuns,
  reprovisionUser,
} from "@/api/users";

function ServiceRow({
  label,
  status,
}: {
  label: string;
  status: ProvisioningStatus;
}) {
  const icon =
    status === "provisioned" ? (
      <CheckCircle size={16} className="text-green-400" />
    ) : status === "failed" ? (
      <XCircle size={16} className="text-red-400" />
    ) : (
      <MinusCircle size={16} className="text-zinc-600" />
    );

  const statusColors: Record<ProvisioningStatus, string> = {
    provisioned: "text-green-400",
    not_applicable: "text-zinc-600",
    pending: "text-yellow-400",
    failed: "text-red-400",
  };

  return (
    <div className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-4 py-3">
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-sm text-zinc-200">{label}</span>
      </div>
      <span className={`text-xs font-medium ${statusColors[status]}`}>
        {status.replace("_", " ")}
      </span>
    </div>
  );
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["user", id],
    queryFn: () => getUser(id || ""),
    enabled: !!id,
  });

  const { data: workflowData } = useQuery({
    queryKey: ["user-workflows", id],
    queryFn: async () => {
      const runs = await listUserWorkflowRuns(id || "");
      const hydrated = await Promise.all(
        (runs.data.runs || []).slice(0, 5).map(async (run) => {
          try {
            const exec = await getWorkflowExecutionStatus(run.execution_name);
            return {
              ...run,
              live_state: exec.data.execution.state || run.status,
            };
          } catch {
            return { ...run, live_state: run.status };
          }
        }),
      );
      return hydrated;
    },
    enabled: !!id,
    refetchInterval: 10000,
  });

  const reprovision = useMutation({
    mutationFn: async () => reprovisionUser(id || ""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["user", id] });
    },
  });

  const user = data?.data.user;

  if (isLoading) {
    return (
      <div className="text-center text-zinc-500 py-12">Loading user...</div>
    );
  }

  if (!user) {
    return (
      <div className="text-center text-zinc-500 py-12">User not found</div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <button
        onClick={() => navigate("/users")}
        className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Users
      </button>

      <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">{user.name}</h1>
            <p className="text-sm text-zinc-400">{user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                user.status === "active"
                  ? "bg-green-500/20 text-green-400"
                  : user.status === "offboarded"
                    ? "bg-red-500/20 text-red-400"
                    : "bg-yellow-500/20 text-yellow-400"
              }`}
            >
              {user.status}
            </span>
            <span className="rounded bg-zinc-700/50 px-2 py-1 text-xs text-zinc-300">
              {user.role}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          {user.github_handle && (
            <div>
              <span className="text-zinc-500">GitHub:</span>{" "}
              <span className="text-zinc-200">@{user.github_handle}</span>
            </div>
          )}
          {user.microsoft_upn && (
            <div>
              <span className="text-zinc-500">M365:</span>{" "}
              <span className="text-zinc-200">{user.microsoft_upn}</span>
            </div>
          )}
          {user.slack_handle && (
            <div>
              <span className="text-zinc-500">Slack:</span>{" "}
              <span className="text-zinc-200">@{user.slack_handle}</span>
            </div>
          )}
          {user.gcp_email && (
            <div>
              <span className="text-zinc-500">GCP:</span>{" "}
              <span className="text-zinc-200">{user.gcp_email}</span>
            </div>
          )}
          {user.aws_iam_arn && (
            <div>
              <span className="text-zinc-500">AWS:</span>{" "}
              <span className="text-zinc-200 text-xs break-all">
                {user.aws_iam_arn}
              </span>
            </div>
          )}
          {user.product_slugs.length > 0 && (
            <div>
              <span className="text-zinc-500">Products:</span>{" "}
              <span className="text-zinc-200">
                {user.product_slugs.join(", ")}
              </span>
            </div>
          )}
          <div>
            <span className="text-zinc-500">Firebase UID:</span>{" "}
            <span className="text-zinc-200">{user.firebase_uid}</span>
          </div>
          <div>
            <span className="text-zinc-500">Provisioned:</span>{" "}
            <span className="text-zinc-200">
              {new Date(user.provisioned_at).toLocaleDateString()}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">Last Modified:</span>{" "}
            <span className="text-zinc-200">
              {new Date(user.last_modified).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
            Service Provisioning
          </h2>
          <ServiceRow label="GitHub" status={user.services.github} />
          <ServiceRow label="Slack" status={user.services.slack} />
          <ServiceRow
            label="Microsoft 365"
            status={user.services.microsoft365}
          />
          <ServiceRow label="GCP IAM" status={user.services.gcp} />
          <ServiceRow label="AWS IAM" status={user.services.aws} />
          <ServiceRow label="Website Portal" status={user.services.portal} />
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
            Workflow Runs
          </h2>
          {(workflowData || []).length === 0 ? (
            <div className="rounded-lg bg-zinc-800/50 px-4 py-3 text-sm text-zinc-500">
              No recent runs
            </div>
          ) : (
            (workflowData || []).map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-4 py-3 text-sm"
              >
                <div>
                  <p className="text-zinc-200">{run.run_type}</p>
                  <p className="text-xs text-zinc-500">{run.execution_name}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    run.live_state === "SUCCEEDED"
                      ? "bg-green-500/20 text-green-300"
                      : run.live_state === "FAILED"
                        ? "bg-red-500/20 text-red-300"
                        : "bg-yellow-500/20 text-yellow-300"
                  }`}
                >
                  {run.live_state}
                </span>
              </div>
            ))
          )}
        </div>

        {user.status === "active" && (
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => navigate(`/users/${user.id}/modify`)}
              className="flex items-center gap-2 rounded-lg bg-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-600 transition-colors"
            >
              <Pencil size={16} />
              Modify
            </button>
            <button
              onClick={() => reprovision.mutate()}
              disabled={reprovision.isPending}
              className="flex items-center gap-2 rounded-lg bg-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-600 disabled:opacity-50 transition-colors"
            >
              {reprovision.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              Re-provision
            </button>
            <button
              onClick={() => navigate(`/users/${user.id}/offboard`)}
              className="flex items-center gap-2 rounded-lg bg-red-600/20 px-4 py-2 text-sm text-red-400 hover:bg-red-600/30 disabled:opacity-50 transition-colors"
            >
              <MinusCircle size={16} />
              Offboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
