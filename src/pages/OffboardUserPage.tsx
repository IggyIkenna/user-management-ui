import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import type { OffboardAction, OffboardRequest, UserServices } from "@/api/types";
import { getUser, offboardUser } from "@/api/users";

const SERVICE_KEYS: (keyof UserServices | "firebase")[] = [
  "firebase",
  "github",
  "slack",
  "microsoft365",
  "gcp",
  "aws",
  "portal",
];

const DEFAULT_ACTIONS: Record<keyof UserServices | "firebase", OffboardAction> = {
  firebase: "deactivate",
  github: "deactivate",
  slack: "deactivate",
  microsoft365: "deactivate",
  gcp: "deactivate",
  aws: "deactivate",
  portal: "deactivate",
};

export default function OffboardUserPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [actions, setActions] = useState(DEFAULT_ACTIONS);

  const { data, isLoading } = useQuery({
    queryKey: ["user", id],
    queryFn: () => getUser(id || ""),
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: (payload: OffboardRequest) => offboardUser(id || "", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["user", id] });
      navigate(`/users/${id}`);
    },
  });

  if (isLoading) {
    return <div className="text-center py-10 text-zinc-500">Loading user...</div>;
  }

  const user = data?.data.user;
  if (!user) {
    return <div className="text-center py-10 text-zinc-500">User not found</div>;
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate({ actions });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <button
        onClick={() => navigate(`/users/${id}`)}
        className="text-sm text-zinc-400 hover:text-zinc-200"
      >
        Back to Detail
      </button>
      <h1 className="text-xl font-semibold text-zinc-100">Offboard {user.name}</h1>
      <p className="text-sm text-zinc-400">
        Choose whether each provider should deactivate or delete access.
      </p>
      <form
        onSubmit={submit}
        className="space-y-4 rounded-lg border border-zinc-700 bg-zinc-800/30 p-5"
      >
        {SERVICE_KEYS.map((service) => (
          <div key={service} className="flex items-center justify-between">
            <span className="text-sm capitalize text-zinc-200">{service}</span>
            <select
              value={actions[service]}
              onChange={(e) =>
                setActions((prev) => ({
                  ...prev,
                  [service]: e.target.value as OffboardAction,
                }))
              }
              className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200"
            >
              <option value="deactivate">deactivate</option>
              <option value="delete">delete</option>
            </select>
          </div>
        ))}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-lg bg-red-600/20 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-600/30 disabled:opacity-60"
        >
          {mutation.isPending ? "Offboarding..." : "Confirm Offboard"}
        </button>
      </form>
    </div>
  );
}
