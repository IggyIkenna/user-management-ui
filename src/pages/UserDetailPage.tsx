import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  MinusCircle,
  UserX,
  RefreshCw,
  Loader2,
} from "lucide-react";
import type { Person, ProvisioningStatus } from "@/api/types";

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
    queryFn: async () => {
      const res = await fetch(`/api/v1/users/${id}`);
      return res.json() as Promise<{ user: Person }>;
    },
    enabled: !!id,
  });

  const offboard = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/users/${id}/offboard`, {
        method: "POST",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["user", id] });
    },
  });

  const reprovision = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/users/onboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: user?.name,
          email: user?.email,
          role: user?.role,
          github_handle: user?.github_handle,
          product_slugs: user?.product_slugs,
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["user", id] });
    },
  });

  const user = data?.user;

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
            <h1 className="text-xl font-semibold text-zinc-100">
              {user.name}
            </h1>
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
          {user.gcp_email && (
            <div>
              <span className="text-zinc-500">GCP:</span>{" "}
              <span className="text-zinc-200">{user.gcp_email}</span>
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
          <ServiceRow label="Website Portal" status={user.services.portal} />
        </div>

        {user.status === "active" && (
          <div className="flex gap-3 pt-2">
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
              onClick={() => {
                if (
                  window.confirm(
                    `Offboard ${user.name}? This will revoke all service access.`,
                  )
                ) {
                  offboard.mutate();
                }
              }}
              disabled={offboard.isPending}
              className="flex items-center gap-2 rounded-lg bg-red-600/20 px-4 py-2 text-sm text-red-400 hover:bg-red-600/30 disabled:opacity-50 transition-colors"
            >
              {offboard.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <UserX size={16} />
              )}
              Offboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
