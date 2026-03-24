"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  UserMinus,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { getUser, offboardUser } from "@/lib/api/users";
import type {
  Person,
  OffboardAction,
  OffboardRequest,
  ProvisioningStep,
  UserServices,
} from "@/lib/api/types";

const SERVICE_KEYS: (keyof UserServices | "firebase")[] = [
  "firebase",
  "github",
  "slack",
  "microsoft365",
  "gcp",
  "aws",
  "portal",
];

const SERVICE_LABELS: Record<string, string> = {
  firebase: "Firebase Auth",
  github: "GitHub",
  slack: "Slack",
  microsoft365: "Microsoft 365",
  gcp: "Google Cloud",
  aws: "AWS",
  portal: "Portal",
};

function stepIcon(status: ProvisioningStep["status"]) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="size-4 text-green-500" />;
    case "failed":
      return <XCircle className="size-4 text-red-500" />;
    case "running":
      return <Loader2 className="size-4 text-cyan-500 animate-spin" />;
    case "pending":
      return <Clock className="size-4 text-muted-foreground" />;
  }
}

export default function OffboardUserPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = params.id;

  const [user, setUser] = React.useState<Person | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [steps, setSteps] = React.useState<ProvisioningStep[]>([]);
  const [showConfirm, setShowConfirm] = React.useState(false);

  const [actions, setActions] = React.useState<
    Record<keyof UserServices | "firebase", OffboardAction>
  >({
    firebase: "deactivate",
    github: "deactivate",
    slack: "deactivate",
    microsoft365: "deactivate",
    gcp: "deactivate",
    aws: "deactivate",
    portal: "deactivate",
  });

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getUser(userId)
      .then((res) => {
        if (!cancelled) setUser(res.data.user);
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

  const handleConfirm = async () => {
    setShowConfirm(false);
    setSubmitting(true);
    setError("");
    try {
      const req: OffboardRequest = { actions };
      const res = await offboardUser(userId, req);
      setSteps(res.data.revocation_steps);
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Offboarding failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-32" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-60" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-40" />
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

  if (submitted) {
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
            <CardTitle className="flex items-center gap-2">
              <UserMinus className="size-5" />
              User Offboarded
            </CardTitle>
            <CardDescription>
              Revocation steps for {user?.name} ({user?.email}).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {steps.map((step, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-md border border-border px-4 py-3"
              >
                {stepIcon(step.status)}
                <div className="flex-1">
                  <p className="text-sm font-medium">{step.label}</p>
                  {step.message && (
                    <p className="text-xs text-muted-foreground">
                      {step.message}
                    </p>
                  )}
                </div>
                <Badge
                  variant={
                    step.status === "success"
                      ? "success"
                      : step.status === "failed"
                        ? "error"
                        : step.status === "running"
                          ? "running"
                          : "pending"
                  }
                >
                  {step.status}
                </Badge>
              </div>
            ))}
            <div className="pt-4">
              <Button onClick={() => router.push("/users")}>
                Back to Users
              </Button>
            </div>
          </CardContent>
        </Card>
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
          <CardTitle className="flex items-center gap-2 text-destructive">
            <UserMinus className="size-5" />
            Offboard User
          </CardTitle>
          <CardDescription>
            Remove {user?.name}&apos;s access across services. Choose to
            deactivate (disable, preserving data) or delete (permanently remove)
            for each service.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 rounded-md border border-border p-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{user?.name}</span>
              <span className="text-muted-foreground">Email</span>
              <span>{user?.email}</span>
              <span className="text-muted-foreground">Role</span>
              <span>
                <Badge variant="secondary">{user?.role}</Badge>
              </span>
              <span className="text-muted-foreground">Status</span>
              <span>
                <Badge
                  variant={
                    user?.status === "active"
                      ? "success"
                      : user?.status === "pending"
                        ? "warning"
                        : "error"
                  }
                >
                  {user?.status}
                </Badge>
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Per-Service Actions</h3>
            {SERVICE_KEYS.map((key) => (
              <div
                key={key}
                className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3"
              >
                <Label className="text-sm font-medium min-w-[120px]">
                  {SERVICE_LABELS[key]}
                </Label>
                <Select
                  value={actions[key]}
                  onValueChange={(v) =>
                    setActions((prev) => ({
                      ...prev,
                      [key]: v as OffboardAction,
                    }))
                  }
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deactivate">Deactivate</SelectItem>
                    <SelectItem value="delete">Delete</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          {error && (
            <p className="mt-4 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 mt-6">
            <Button
              variant="destructive"
              disabled={submitting}
              onClick={() => setShowConfirm(true)}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Offboarding…
                </>
              ) : (
                "Offboard User"
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/users/${userId}`)}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              Confirm Offboarding
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will revoke {user?.name}&apos;s access across all selected
              services. Services marked &quot;delete&quot; will permanently
              remove the user&apos;s data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Confirm Offboard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
