"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  UserMinus,
  Clock,
  Shield,
  Github,
  MessageSquare,
  Monitor,
  Cloud,
  Server,
  Globe,
  Lock,
  Download,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  getUser,
  reprovisionUser,
  listUserWorkflowRuns,
  getEffectiveAccess,
} from "@/lib/api/users";
import {
  listUserDocuments,
  reviewDocument,
  getDocumentDownloadUrl,
  type UserDocument,
} from "@/lib/api/onboarding-requests";
import { changePassword } from "@/lib/api/settings";
import { useAuth } from "@/hooks/use-auth";
import { formatDateTime } from "@/lib/utils";
import type {
  Person,
  ProvisioningStatus,
  UserServices,
  WorkflowRun,
  EffectiveAccessEntry,
} from "@/lib/api/types";

const SERVICE_META: {
  key: keyof UserServices;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "github", label: "GitHub", icon: Github },
  { key: "slack", label: "Slack", icon: MessageSquare },
  { key: "microsoft365", label: "Microsoft 365", icon: Monitor },
  { key: "gcp", label: "Google Cloud", icon: Cloud },
  { key: "aws", label: "AWS", icon: Server },
  { key: "portal", label: "Portal", icon: Globe },
];

function serviceBadgeVariant(status: ProvisioningStatus) {
  switch (status) {
    case "provisioned":
      return "success" as const;
    case "pending":
      return "pending" as const;
    case "failed":
      return "error" as const;
    case "not_applicable":
      return "outline" as const;
    default:
      return "outline" as const;
  }
}

function statusBadgeVariant(status: Person["status"]) {
  switch (status) {
    case "active":
      return "success" as const;
    case "pending":
      return "warning" as const;
    case "offboarded":
      return "error" as const;
    default:
      return "outline" as const;
  }
}

function workflowBadgeVariant(status: string) {
  switch (status) {
    case "SUCCEEDED":
      return "success" as const;
    case "FAILED":
      return "error" as const;
    case "RUNNING":
    case "ACTIVE":
      return "running" as const;
    default:
      return "pending" as const;
  }
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = params.id;
  const { user: sessionUser, isAdmin } = useAuth();

  const [user, setUser] = React.useState<Person | null>(null);
  const [workflows, setWorkflows] = React.useState<WorkflowRun[]>([]);
  const [access, setAccess] = React.useState<EffectiveAccessEntry[]>([]);
  const [documents, setDocuments] = React.useState<UserDocument[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [reprovisioning, setReprovisioning] = React.useState(false);

  const [downloadingDocId, setDownloadingDocId] = React.useState<string | null>(null);

  const [adminNewPassword, setAdminNewPassword] = React.useState("");
  const [adminConfirmPassword, setAdminConfirmPassword] = React.useState("");
  const [adminPasswordSaving, setAdminPasswordSaving] = React.useState(false);
  const [adminPasswordError, setAdminPasswordError] = React.useState("");
  const [adminPasswordSuccess, setAdminPasswordSuccess] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const userRes = await getUser(userId);
      setUser(userRes.data.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load user");
      setLoading(false);
      return;
    }
    try {
      const workflowRes = await listUserWorkflowRuns(userId);
      setWorkflows(workflowRes.data.runs);
    } catch {
      setWorkflows([]);
    }
    try {
      const accessRes = await getEffectiveAccess(userId);
      setAccess(accessRes.data.effective_access);
    } catch {
      setAccess([]);
    }
    try {
      const docsRes = await listUserDocuments(userId);
      setDocuments(docsRes.data.documents);
    } catch {
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleReprovision = async () => {
    setReprovisioning(true);
    setError("");
    try {
      const res = await reprovisionUser(userId);
      if (res.data.workflow_state === "FAILED_TO_START") {
        setError(
          res.data.workflow_error ||
            "Re-provision workflow failed to start. Check workflow config and service-account permissions.",
        );
      }
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Re-provisioning failed");
    } finally {
      setReprovisioning(false);
    }
  };

  async function handleDocDownload(docId: string) {
    setDownloadingDocId(docId);
    const newTab = window.open("about:blank", "_blank");
    try {
      const res = await getDocumentDownloadUrl(userId, docId);
      if (newTab) {
        newTab.location.href = res.data.url;
      } else {
        const a = document.createElement("a");
        a.href = res.data.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.click();
      }
    } catch {
      if (newTab) newTab.close();
      setError("Failed to get download link.");
    } finally {
      setDownloadingDocId(null);
    }
  }

  const showAdminPasswordCard =
    isAdmin() &&
    sessionUser &&
    user &&
    user.firebase_uid !== sessionUser.firebase_uid;

  async function handleAdminSetPassword() {
    if (!user) return;
    setAdminPasswordError("");
    setAdminPasswordSuccess(false);
    if (adminNewPassword.length < 6) {
      setAdminPasswordError("Password must be at least 6 characters.");
      return;
    }
    if (adminNewPassword !== adminConfirmPassword) {
      setAdminPasswordError("Passwords do not match.");
      return;
    }
    setAdminPasswordSaving(true);
    try {
      await changePassword(user.firebase_uid, adminNewPassword);
      setAdminPasswordSuccess(true);
      setAdminNewPassword("");
      setAdminConfirmPassword("");
    } catch (err) {
      setAdminPasswordError(
        err instanceof Error ? err.message : "Failed to set password",
      );
    } finally {
      setAdminPasswordSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-60" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6 space-y-3">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="space-y-4">
        <Link
          href="/users"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Users
        </Link>
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {error || "User not found"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/users"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Users
      </Link>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <CardTitle className="text-xl">{user.name}</CardTitle>
              <Badge variant={statusBadgeVariant(user.status)}>
                {user.status}
              </Badge>
            </div>
            <CardDescription>{user.email}</CardDescription>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary">
              <Shield className="mr-1 size-3" />
              {user.role}
            </Badge>
            {user.access_template && (
              <Badge variant="outline">{user.access_template.name}</Badge>
            )}
          </div>
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <MoreHorizontal className="mr-2 size-4" />
                  Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => router.push(`/users/${user.id}/modify`)}
                >
                  <Pencil className="mr-2 size-4" />
                  Modify
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleReprovision}
                  disabled={reprovisioning}
                >
                  <RefreshCw className="mr-2 size-4" />
                  {reprovisioning ? "Re-provisioning…" : "Re-provision"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => router.push(`/users/${user.id}/offboard`)}
                >
                  <UserMinus className="mr-2 size-4" />
                  Offboard
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            {user.github_handle && (
              <>
                <span className="text-muted-foreground">GitHub</span>
                <span>@{user.github_handle}</span>
              </>
            )}
            {user.slack_handle && (
              <>
                <span className="text-muted-foreground">Slack</span>
                <span>@{user.slack_handle}</span>
              </>
            )}
            {user.microsoft_upn && (
              <>
                <span className="text-muted-foreground">Microsoft UPN</span>
                <span>{user.microsoft_upn}</span>
              </>
            )}
            {user.gcp_email && (
              <>
                <span className="text-muted-foreground">GCP Email</span>
                <span>{user.gcp_email}</span>
              </>
            )}
            {user.aws_iam_arn && (
              <>
                <span className="text-muted-foreground">AWS IAM</span>
                <span className="font-mono text-xs break-all">
                  {user.aws_iam_arn}
                </span>
              </>
            )}
            {user.product_slugs.length > 0 && (
              <>
                <span className="text-muted-foreground">Products</span>
                <span>{user.product_slugs.join(", ")}</span>
              </>
            )}
            <span className="text-muted-foreground">Provisioned</span>
            <span>{formatDateTime(user.provisioned_at)}</span>
            <span className="text-muted-foreground">Last Modified</span>
            <span>{formatDateTime(user.last_modified)}</span>
          </div>
        </CardContent>
      </Card>

      {showAdminPasswordCard && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="size-4" />
              Set password (admin)
            </CardTitle>
            <CardDescription>
              Set a new password for {user.name}. They will use it on the next sign-in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 max-w-sm">
            <div className="space-y-1.5">
              <Label className="text-xs">New password</Label>
              <Input
                type="password"
                value={adminNewPassword}
                onChange={(e) => setAdminNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Confirm password</Label>
              <Input
                type="password"
                value={adminConfirmPassword}
                onChange={(e) => setAdminConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                autoComplete="new-password"
              />
            </div>
            {adminPasswordError && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {adminPasswordError}
              </p>
            )}
            {adminPasswordSuccess && (
              <p className="text-sm text-emerald-400">Password updated.</p>
            )}
            <Button
              size="sm"
              onClick={handleAdminSetPassword}
              disabled={adminPasswordSaving}
            >
              {adminPasswordSaving ? "Saving…" : "Update password"}
            </Button>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-base font-semibold mb-3">Services</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SERVICE_META.map(({ key, label, icon: Icon }) => {
            const status = user.services[key];
            const message = user.service_messages?.[key];
            const syncedAt = user.service_synced_at?.[key];
            return (
              <Card key={key}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Icon className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                    <Badge variant={serviceBadgeVariant(status)}>
                      {status}
                    </Badge>
                  </div>
                  {message && (
                    <p className="text-xs text-muted-foreground mb-1">
                      {message}
                    </p>
                  )}
                  {syncedAt && (
                    <p className="text-xs text-muted-foreground/60 flex items-center gap-1">
                      <Clock className="size-3" />
                      Last sync: {formatDateTime(syncedAt)}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Separator />

      <div>
        <h2 className="text-base font-semibold mb-3">Effective App Access</h2>
        {access.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No app access grants found.
          </p>
        ) : (
          <div className="rounded-lg border border-border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Effective Role</TableHead>
                  <TableHead className="text-center">Direct</TableHead>
                  <TableHead className="text-center">Via Group</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {access.map((entry) => (
                  <TableRow key={entry.app_id}>
                    <TableCell className="font-medium">
                      {entry.app_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{entry.app_category}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{entry.effective_role}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {entry.direct_grants.length}
                    </TableCell>
                    <TableCell className="text-center">
                      {entry.group_grants.length}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Separator />

      <div>
        <h2 className="text-base font-semibold mb-3">Workflow History</h2>
        {workflows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No workflow runs found.
          </p>
        ) : (
          <div className="rounded-lg border border-border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workflows.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <Badge variant="outline">{run.run_type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={workflowBadgeVariant(run.status)}>
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs max-w-[200px] truncate">
                      {run.workflow_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs max-w-[260px] truncate">
                      {run.execution_error || run.execution_result || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDateTime(run.created_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDateTime(run.updated_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Separator />

      <div>
        <h2 className="text-base font-semibold mb-3">Documents</h2>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No documents uploaded.
          </p>
        ) : (
          <div className="rounded-lg border border-border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>File Name</TableHead>
                  <TableHead>Review Status</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <Badge variant="outline">{doc.doc_type}</Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">
                      {doc.file_name}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          doc.review_status === "approved"
                            ? "default"
                            : doc.review_status === "rejected"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {doc.review_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDateTime(doc.uploaded_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          title="Download"
                          disabled={downloadingDocId === doc.id}
                          onClick={() => handleDocDownload(doc.id)}
                        >
                          {downloadingDocId === doc.id ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5 mr-1" />}
                          View
                        </Button>
                        {doc.review_status !== "approved" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={async () => {
                              await reviewDocument(userId, doc.id, "approved");
                              loadData();
                            }}
                          >
                            Approve
                          </Button>
                        )}
                        {doc.review_status !== "rejected" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive"
                            onClick={async () => {
                              await reviewDocument(userId, doc.id, "rejected");
                              loadData();
                            }}
                          >
                            Reject
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
