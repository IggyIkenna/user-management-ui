import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import type { ModifyUserRequest, UserRole } from "@/api/types";
import { getUser, modifyUser } from "@/api/users";
import { listAccessTemplates } from "@/api/accessTemplates";

const ROLES: UserRole[] = [
  "admin",
  "collaborator",
  "board",
  "client",
  "shareholder",
  "accounting",
  "operations",
  "investor",
];

export default function ModifyUserPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ModifyUserRequest>({
    role: "client",
    github_handle: "",
    product_slugs: [],
  });
  const [productsInput, setProductsInput] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["user", id],
    queryFn: () => getUser(id || ""),
    enabled: !!id,
  });
  const { data: templatesData } = useQuery({
    queryKey: ["access-templates"],
    queryFn: listAccessTemplates,
  });

  useEffect(() => {
    if (!data?.data.user) return;
    const user = data.data.user;
    setForm({
      role: user.role,
      github_handle: user.github_handle || "",
      product_slugs: user.product_slugs,
      access_template_id: user.access_template_id || undefined,
    });
    setProductsInput(user.product_slugs.join(", "));
  }, [data]);

  const mutation = useMutation({
    mutationFn: (payload: ModifyUserRequest) => modifyUser(id || "", payload),
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

  const needsGithub = form.role === "admin" || form.role === "collaborator";

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const product_slugs =
      form.role === "client"
        ? productsInput
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
        : [];
    mutation.mutate({
      ...form,
      product_slugs,
      github_handle: needsGithub ? form.github_handle : undefined,
    });
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <button
        onClick={() => navigate(`/users/${id}`)}
        className="text-sm text-zinc-400 hover:text-zinc-200"
      >
        Back to Detail
      </button>
      <h1 className="text-xl font-semibold text-zinc-100">Modify User</h1>
      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-lg border border-zinc-700 bg-zinc-800/30 p-5"
      >
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Role</label>
          <select
            value={form.role}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, role: e.target.value as UserRole }))
            }
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200"
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>
        {needsGithub && (
          <div>
            <label className="mb-1 block text-sm text-zinc-400">GitHub Handle</label>
            <input
              value={form.github_handle || ""}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, github_handle: e.target.value }))
              }
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200"
            />
          </div>
        )}
        {form.role === "client" && (
          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Product Slugs (comma separated)
            </label>
            <input
              value={productsInput}
              onChange={(e) => setProductsInput(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200"
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm text-zinc-400">
            Access Template (optional)
          </label>
          <select
            value={form.access_template_id || ""}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                access_template_id: e.target.value || undefined,
              }))
            }
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200"
          >
            <option value="">No template</option>
            {(templatesData?.data.templates || []).map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-60"
        >
          {mutation.isPending ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </div>
  );
}
