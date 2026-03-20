import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAccessTemplate,
  deleteAccessTemplate,
  listAccessTemplates,
  updateAccessTemplate,
} from "@/api/accessTemplates";
import type { AccessTemplate } from "@/api/types";

interface TemplateFormState {
  name: string;
  description: string;
  aws_permission_sets: string;
  slack_channels: string;
  github_teams: string;
}

const DEFAULT_FORM: TemplateFormState = {
  name: "",
  description: "",
  aws_permission_sets: "",
  slack_channels: "",
  github_teams: "",
};

function splitList(value: string) {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function validateTemplateInput(state: TemplateFormState): string[] {
  const errors: string[] = [];
  const slackIds = splitList(state.slack_channels);
  const githubTeams = splitList(state.github_teams);
  const awsSets = splitList(state.aws_permission_sets);

  if (!state.name.trim()) {
    errors.push("Template name is required.");
  }
  for (const channel of slackIds) {
    if (!/^[CGD][A-Z0-9]{8,}$/.test(channel)) {
      errors.push(`Invalid Slack channel ID: ${channel}`);
    }
  }
  for (const slug of githubTeams) {
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) {
      errors.push(`Invalid GitHub team slug: ${slug}`);
    }
  }
  for (const setName of awsSets) {
    if (!/^[A-Za-z0-9:_./-]+$/.test(setName)) {
      errors.push(`Invalid AWS permission set value: ${setName}`);
    }
  }
  return errors;
}

export default function AccessTemplatesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<TemplateFormState>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [formValidationErrors, setFormValidationErrors] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["access-templates"],
    queryFn: listAccessTemplates,
  });

  const createTemplate = useMutation({
    mutationFn: () =>
      createAccessTemplate({
        name: form.name.trim(),
        description: form.description.trim(),
        aws_permission_sets: splitList(form.aws_permission_sets),
        slack_channels: splitList(form.slack_channels),
        github_teams: splitList(form.github_teams),
      }),
    onSuccess: () => {
      setForm(DEFAULT_FORM);
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["access-templates"] });
    },
    onError: (error: unknown) => {
      setFormError(String(error));
    },
  });

  const editTemplate = useMutation({
    mutationFn: () =>
      updateAccessTemplate(editingTemplateId || "", {
        name: editingForm.name.trim(),
        description: editingForm.description.trim(),
        aws_permission_sets: splitList(editingForm.aws_permission_sets),
        slack_channels: splitList(editingForm.slack_channels),
        github_teams: splitList(editingForm.github_teams),
      }),
    onSuccess: () => {
      setEditingTemplateId(null);
      setEditingForm(DEFAULT_FORM);
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["access-templates"] });
    },
    onError: (error: unknown) => {
      setFormError(String(error));
    },
  });

  const removeTemplate = useMutation({
    mutationFn: (id: string) => deleteAccessTemplate(id),
    onSuccess: () => {
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["access-templates"] });
    },
    onError: (error: unknown) => {
      setFormError(String(error));
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs = validateTemplateInput(form);
    setFormValidationErrors(errs);
    if (errs.length > 0) return;
    setFormError(null);
    createTemplate.mutate();
  }

  function startEdit(template: AccessTemplate) {
    setEditingTemplateId(template.id);
    setEditingForm({
      name: template.name,
      description: template.description,
      aws_permission_sets: template.aws_permission_sets.join(", "),
      slack_channels: template.slack_channels.join(", "),
      github_teams: template.github_teams.join(", "),
    });
    setFormError(null);
    setFormValidationErrors([]);
  }

  function cancelEdit() {
    setEditingTemplateId(null);
    setEditingForm(DEFAULT_FORM);
    setFormError(null);
    setFormValidationErrors([]);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold text-zinc-100">Access Templates</h1>
      <p className="text-sm text-zinc-400">
        Reusable bundles for AWS, Slack, and GitHub entitlements.
      </p>

      <form
        onSubmit={submit}
        className="grid gap-3 rounded-lg border border-zinc-700 bg-zinc-800/30 p-5"
      >
        {formError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {formError}
          </div>
        )}
        {formValidationErrors.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            {formValidationErrors.map((err) => (
              <p key={err}>{err}</p>
            ))}
          </div>
        )}
        <input
          placeholder="Template name"
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200"
        />
        <input
          placeholder="Description"
          value={form.description}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, description: e.target.value }))
          }
          className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200"
        />
        <input
          placeholder="AWS permission sets (comma separated)"
          value={form.aws_permission_sets}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              aws_permission_sets: e.target.value,
            }))
          }
          className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200"
        />
        <input
          placeholder="Slack channels (comma separated)"
          value={form.slack_channels}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, slack_channels: e.target.value }))
          }
          className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200"
        />
        <input
          placeholder="GitHub teams (comma separated)"
          value={form.github_teams}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, github_teams: e.target.value }))
          }
          className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200"
        />
        <button
          type="submit"
          disabled={createTemplate.isPending}
          className="justify-self-start rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-60"
        >
          {createTemplate.isPending ? "Creating..." : "Create Template"}
        </button>
      </form>

      {isLoading ? (
        <div className="text-sm text-zinc-500">Loading templates...</div>
      ) : (
        <div className="space-y-3">
          {(data?.data.templates || []).map((template) => (
            <div
              key={template.id}
              className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-4"
            >
              <h2 className="text-sm font-semibold text-zinc-100">{template.name}</h2>
              <p className="mt-1 text-xs text-zinc-400">{template.description}</p>
              <p className="mt-2 text-xs text-zinc-300">
                AWS: {template.aws_permission_sets.join(", ") || "none"}
              </p>
              <p className="text-xs text-zinc-300">
                Slack: {template.slack_channels.join(", ") || "none"}
              </p>
              <p className="text-xs text-zinc-300">
                GitHub: {template.github_teams.join(", ") || "none"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Assigned users: {template.assigned_user_count || 0}
              </p>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => startEdit(template)}
                  className="rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-600"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete template "${template.name}"? This is blocked if assigned to users.`,
                      )
                    ) {
                      setFormError(null);
                      removeTemplate.mutate(template.id);
                    }
                  }}
                  disabled={removeTemplate.isPending}
                  className="ml-2 rounded bg-red-700/40 px-2 py-1 text-xs text-red-200 hover:bg-red-700/60 disabled:opacity-60"
                >
                  Delete
                </button>
              </div>

              {editingTemplateId === template.id && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const errs = validateTemplateInput(editingForm);
                    setFormValidationErrors(errs);
                    if (errs.length > 0) return;
                    setFormError(null);
                    editTemplate.mutate();
                  }}
                  className="mt-3 grid gap-2 rounded-lg border border-zinc-700 bg-zinc-900/40 p-3"
                >
                  <input
                    value={editingForm.name}
                    onChange={(e) =>
                      setEditingForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="Template name"
                    className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-xs text-zinc-200"
                  />
                  <input
                    value={editingForm.description}
                    onChange={(e) =>
                      setEditingForm((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    placeholder="Description"
                    className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-xs text-zinc-200"
                  />
                  <input
                    value={editingForm.aws_permission_sets}
                    onChange={(e) =>
                      setEditingForm((prev) => ({
                        ...prev,
                        aws_permission_sets: e.target.value,
                      }))
                    }
                    placeholder="AWS permission sets (comma separated)"
                    className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-xs text-zinc-200"
                  />
                  <input
                    value={editingForm.slack_channels}
                    onChange={(e) =>
                      setEditingForm((prev) => ({
                        ...prev,
                        slack_channels: e.target.value,
                      }))
                    }
                    placeholder="Slack channels (comma separated)"
                    className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-xs text-zinc-200"
                  />
                  <input
                    value={editingForm.github_teams}
                    onChange={(e) =>
                      setEditingForm((prev) => ({
                        ...prev,
                        github_teams: e.target.value,
                      }))
                    }
                    placeholder="GitHub teams (comma separated)"
                    className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-xs text-zinc-200"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={editTemplate.isPending}
                      className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-60"
                    >
                      {editTemplate.isPending ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded bg-zinc-700 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-600"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
