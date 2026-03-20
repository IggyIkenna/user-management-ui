import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Search,
  UserPlus,
  Layers,
  CheckCircle,
  XCircle,
  MinusCircle,
} from "lucide-react";
import { useUserStore } from "@/stores/userStore";
import type { Person, ProvisioningStatus, UserServices } from "@/api/types";
import { listUsers } from "@/api/users";

function ServiceBadge({
  status,
  reason,
}: {
  status: ProvisioningStatus;
  reason?: string;
}) {
  const icon =
    status === "provisioned" ? (
      <CheckCircle size={14} className="text-green-400" />
    ) : status === "not_applicable" ? (
      <MinusCircle size={14} className="text-zinc-600" />
    ) : status === "failed" ? (
      <XCircle size={14} className="text-red-400" />
    ) : (
      <MinusCircle size={14} className="text-yellow-400" />
    );
  return <span title={reason}>{icon}</span>;
}

function ServiceCell({
  user,
  keyName,
}: {
  user: Person;
  keyName: keyof UserServices;
}) {
  const reason =
    user.service_messages?.[keyName] ||
    (user.services[keyName] === "failed" ? user.workflow_failure_reason : undefined);
  return (
    <div className="flex flex-col items-center gap-1">
      <ServiceBadge status={user.services[keyName]} reason={reason} />
      {user.services[keyName] === "failed" && reason && (
        <span className="max-w-20 truncate text-[10px] text-red-300" title={reason}>
          {reason}
        </span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Person["status"] }) {
  const colors = {
    active: "bg-green-500/20 text-green-400",
    offboarded: "bg-red-500/20 text-red-400",
    pending: "bg-yellow-500/20 text-yellow-400",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status]}`}
    >
      {status}
    </span>
  );
}

export default function UsersPage() {
  const navigate = useNavigate();
  const { filters, setSearch, setRoleFilter, setStatusFilter, filterUsers } =
    useUserStore();

  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: listUsers,
  });

  const users = data?.data.users ? filterUsers(data.data.users) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-100">Users</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/templates")}
            className="flex items-center gap-2 rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-600 transition-colors"
          >
            <Layers size={16} />
            Templates
          </button>
          <button
            onClick={() => navigate("/onboard")}
            className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 transition-colors"
          >
            <UserPlus size={16} />
            Onboard User
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
          />
          <input
            type="text"
            placeholder="Search users..."
            value={filters.search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 py-2 pl-10 pr-4 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-amber-600 focus:outline-none"
          />
        </div>
        <select
          value={filters.role}
          onChange={(e) =>
            setRoleFilter(e.target.value as typeof filters.role)
          }
          className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 focus:border-amber-600 focus:outline-none"
        >
          <option value="all">All Roles</option>
          <option value="admin">Admin</option>
          <option value="collaborator">Collaborator</option>
          <option value="board">Board</option>
          <option value="client">Client</option>
          <option value="shareholder">Shareholder</option>
          <option value="accounting">Accounting</option>
          <option value="operations">Operations</option>
          <option value="investor">Investor</option>
        </select>
        <select
          value={filters.status}
          onChange={(e) =>
            setStatusFilter(e.target.value as typeof filters.status)
          }
          className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 focus:border-amber-600 focus:outline-none"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="offboarded">Offboarded</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-center text-zinc-500 py-12">Loading users...</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-700">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-700 bg-zinc-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-zinc-400 uppercase">
                  GitHub
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-zinc-400 uppercase">
                  Slack
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-zinc-400 uppercase">
                  M365
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-zinc-400 uppercase">
                  GCP
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-zinc-400 uppercase">
                  AWS
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-zinc-400 uppercase">
                  Portal
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {users.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => navigate(`/users/${user.id}`)}
                  className="cursor-pointer hover:bg-zinc-800/40 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-zinc-200">
                    {user.name}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-zinc-700/50 px-2 py-0.5 text-xs text-zinc-300">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={user.status} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ServiceCell user={user} keyName="github" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ServiceCell user={user} keyName="slack" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ServiceCell user={user} keyName="microsoft365" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ServiceCell user={user} keyName="gcp" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ServiceCell user={user} keyName="aws" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ServiceCell user={user} keyName="portal" />
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-8 text-center text-zinc-500"
                  >
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
