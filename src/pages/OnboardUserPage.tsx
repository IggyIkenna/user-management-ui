import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import type { OnboardRequest, UserRole, ProvisioningStep } from "@/api/types";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "collaborator", label: "Collaborator (dev)" },
  { value: "board", label: "Board Member" },
  { value: "client", label: "Client" },
  { value: "shareholder", label: "Shareholder" },
  { value: "accounting", label: "Accounting" },
  { value: "operations", label: "Operations" },
  { value: "investor", label: "Investor" },
];

const PRODUCT_SLUGS = ["elysium", "quant-alpha", "macro-edge", "fixed-income"];

export default function OnboardUserPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<OnboardRequest>({
    name: "",
    email: "",
    role: "client",
    github_handle: "",
    product_slugs: [],
  });

  const [steps, setSteps] = useState<ProvisioningStep[]>([]);

  const onboard = useMutation({
    mutationFn: async (req: OnboardRequest) => {
      const res = await fetch("/api/v1/users/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<{
        user: unknown;
        provisioning_steps: ProvisioningStep[];
      }>;
    },
    onSuccess: (data) => {
      setSteps(data.provisioning_steps);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const needsGithub = form.role === "admin" || form.role === "collaborator";
  const needsProducts = form.role === "client";

  const canSubmit =
    form.name.trim() &&
    form.email.trim() &&
    (!needsGithub || form.github_handle?.trim()) &&
    (!needsProducts || form.product_slugs.length > 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onboard.mutate(form);
  }

  function toggleSlug(slug: string) {
    setForm((prev) => ({
      ...prev,
      product_slugs: prev.product_slugs.includes(slug)
        ? prev.product_slugs.filter((s) => s !== slug)
        : [...prev.product_slugs, slug],
    }));
  }

  if (steps.length > 0) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <h1 className="text-xl font-semibold text-zinc-100">
          Provisioning Complete
        </h1>
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-6 space-y-4">
          <p className="text-sm text-zinc-400">
            Successfully onboarded{" "}
            <strong className="text-zinc-200">{form.name}</strong> as{" "}
            <strong className="text-zinc-200">{form.role}</strong>
          </p>
          <div className="space-y-2">
            {steps.map((step) => (
              <div
                key={step.service}
                className="flex items-center gap-3 rounded-lg bg-zinc-800/50 px-4 py-3"
              >
                {step.status === "success" ? (
                  <CheckCircle size={18} className="text-green-400" />
                ) : (
                  <XCircle size={18} className="text-red-400" />
                )}
                <span className="text-sm text-zinc-200">{step.label}</span>
                <span className="ml-auto text-xs text-zinc-500">
                  {step.status}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={() => navigate("/users")}
            className="w-full rounded-lg bg-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-600 transition-colors"
          >
            Back to Users
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-xl font-semibold text-zinc-100">Onboard New User</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">
            Full Name
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Jane Doe"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-amber-600 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">
            Email
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="jane@odum-research.com"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-amber-600 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">
            Role
          </label>
          <select
            value={form.role}
            onChange={(e) =>
              setForm({ ...form, role: e.target.value as UserRole })
            }
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-sm text-zinc-200 focus:border-amber-600 focus:outline-none"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {needsGithub && (
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">
              GitHub Handle
            </label>
            <input
              type="text"
              value={form.github_handle || ""}
              onChange={(e) =>
                setForm({ ...form, github_handle: e.target.value })
              }
              placeholder="github-username"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-amber-600 focus:outline-none"
            />
          </div>
        )}

        {needsProducts && (
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Product Access
            </label>
            <div className="flex flex-wrap gap-2">
              {PRODUCT_SLUGS.map((slug) => (
                <button
                  key={slug}
                  type="button"
                  onClick={() => toggleSlug(slug)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    form.product_slugs.includes(slug)
                      ? "bg-amber-600 text-white"
                      : "bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {slug}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit || onboard.isPending}
          className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {onboard.isPending ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Provisioning...
            </>
          ) : (
            "Onboard User"
          )}
        </button>
      </form>
    </div>
  );
}
