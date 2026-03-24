"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getUser, modifyUser } from "@/lib/api/users";
import { listAccessTemplates } from "@/lib/api/access-templates";
import type { UserRole, Person, AccessTemplate } from "@/lib/api/types";

const ROLE_OPTIONS: UserRole[] = [
  "admin",
  "internal",
  "collaborator",
  "board",
  "client",
  "shareholder",
  "accounting",
  "operations",
  "investor",
];

export default function ModifyUserPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = params.id;

  const [user, setUser] = React.useState<Person | null>(null);
  const [templates, setTemplates] = React.useState<AccessTemplate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const [role, setRole] = React.useState<UserRole>("collaborator");
  const [githubHandle, setGithubHandle] = React.useState("");
  const [productSlugs, setProductSlugs] = React.useState("");
  const [accessTemplateId, setAccessTemplateId] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getUser(userId), listAccessTemplates()])
      .then(([userRes, templatesRes]) => {
        if (cancelled) return;
        const u = userRes.data.user;
        setUser(u);
        setRole(u.role);
        setGithubHandle(u.github_handle || "");
        setProductSlugs(u.product_slugs.join(", "));
        setAccessTemplateId(u.access_template_id || "");
        setTemplates(templatesRes.data.templates);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load user");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await modifyUser(userId, {
        role,
        github_handle: githubHandle || undefined,
        product_slugs: productSlugs
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        access_template_id: accessTemplateId || undefined,
      });
      router.push(`/users/${userId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to modify user");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-32" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-60" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="space-y-4">
        <Link
          href={`/users/${userId}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to User
        </Link>
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/users/${userId}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to User
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Pencil className="size-5" />
            Modify User
          </CardTitle>
          <CardDescription>
            Update {user?.name}&apos;s role, GitHub handle, products, or access
            template.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={user?.name || ""} disabled />
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user?.email || ""} disabled />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={role}
                  onValueChange={(v) => setRole(v as UserRole)}
                >
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="github">GitHub Handle</Label>
                <Input
                  id="github"
                  placeholder="johndoe"
                  value={githubHandle}
                  onChange={(e) => setGithubHandle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="products">Product Slugs</Label>
                <Input
                  id="products"
                  placeholder="trading-ui, backtest-ui"
                  value={productSlugs}
                  onChange={(e) => setProductSlugs(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated list of product slugs
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="template">Access Template</Label>
                <Select
                  value={accessTemplateId}
                  onValueChange={setAccessTemplateId}
                >
                  <SelectTrigger id="template">
                    <SelectValue placeholder="Select template (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No template</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(`/users/${userId}`)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
