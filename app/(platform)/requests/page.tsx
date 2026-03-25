"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listOnboardingRequests,
  approveRequest,
  rejectRequest,
  type OnboardingRequest,
  type AppGrant,
} from "@/lib/api/onboarding-requests";
import { listApplications } from "@/lib/api/applications";
import type { Application } from "@/lib/api/types";
import { CheckCircle2, XCircle, Clock, Eye, Loader2 } from "lucide-react";
import Link from "next/link";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof Clock }> = {
  pending: { label: "Pending", variant: "outline", icon: Clock },
  approved: { label: "Approved", variant: "default", icon: CheckCircle2 },
  rejected: { label: "Rejected", variant: "destructive", icon: XCircle },
};

export default function OnboardingRequestsPage() {
  const [requests, setRequests] = React.useState<OnboardingRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [actionDialog, setActionDialog] = React.useState<{
    type: "approve" | "reject";
    request: OnboardingRequest;
  } | null>(null);
  const [actionNote, setActionNote] = React.useState("");
  const [actionRole, setActionRole] = React.useState("client");
  const [actionInProgress, setActionInProgress] = React.useState(false);
  const [apps, setApps] = React.useState<Application[]>([]);
  const [selectedApps, setSelectedApps] = React.useState<
    Record<string, { selected: boolean; role: string }>
  >({});

  const fetchRequests = React.useCallback(async () => {
    setLoading(true);
    try {
      const filter = statusFilter === "all" ? undefined : statusFilter;
      const res = await listOnboardingRequests(filter);
      setRequests(res.data.requests);
    } catch {
      /* network error */
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  React.useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  React.useEffect(() => {
    listApplications()
      .then((res) => setApps(res.data.applications || []))
      .catch(() => setApps([]));
  }, []);

  const toggleApp = (appId: string) => {
    setSelectedApps((prev) => ({
      ...prev,
      [appId]: {
        selected: !prev[appId]?.selected,
        role: prev[appId]?.role || "viewer",
      },
    }));
  };

  const setAppRole = (appId: string, role: string) => {
    setSelectedApps((prev) => ({
      ...prev,
      [appId]: { ...prev[appId], selected: true, role },
    }));
  };

  async function handleAction() {
    if (!actionDialog) return;
    setActionInProgress(true);
    try {
      if (actionDialog.type === "approve") {
        const appGrants: AppGrant[] = Object.entries(selectedApps)
          .filter(([, v]) => v.selected)
          .map(([appId, v]) => ({
            app_id: appId,
            role: v.role,
            environments: ["dev", "staging", "prod"],
          }));
        await approveRequest(actionDialog.request.id, actionNote, actionRole, appGrants);
      } else {
        await rejectRequest(actionDialog.request.id, actionNote, false);
      }
      setActionDialog(null);
      setActionNote("");
      setSelectedApps({});
      fetchRequests();
    } catch {
      /* error handling */
    } finally {
      setActionInProgress(false);
    }
  }

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Signup Requests</h1>
          <p className="text-sm text-muted-foreground">
            Review and approve pending user signups.
            {pendingCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {pendingCount} pending
              </Badge>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No requests found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const config = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
            const StatusIcon = config.icon;
            return (
              <Card key={req.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {req.applicant_name}
                        <Badge variant={config.variant} className="text-xs">
                          <StatusIcon className="size-3 mr-1" />
                          {config.label}
                        </Badge>
                      </CardTitle>
                      <CardDescription className="text-xs mt-1">
                        {req.applicant_email}
                        {req.company && ` · ${req.company}`}
                        {` · ${req.service_type}`}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {req.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => {
                              setActionDialog({ type: "approve", request: req });
                              setActionNote("");
                              setActionRole("client");
                            }}
                          >
                            <CheckCircle2 className="size-3.5 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setActionDialog({ type: "reject", request: req });
                              setActionNote("");
                            }}
                          >
                            <XCircle className="size-3.5 mr-1" />
                            Reject
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" asChild>
                        <Link href={`/users/${req.firebase_uid}`}>
                          <Eye className="size-3.5 mr-1" />
                          View User
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span>Submitted: {new Date(req.created_at).toLocaleDateString()}</span>
                    {req.selected_options.length > 0 && (
                      <span>
                        Options:{" "}
                        {req.selected_options.map((o) => (
                          <Badge key={o} variant="outline" className="text-[10px] mx-0.5">
                            {o}
                          </Badge>
                        ))}
                      </span>
                    )}
                    {req.review_note && (
                      <span>Note: {req.review_note}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.type === "approve" ? "Approve" : "Reject"} Request
            </DialogTitle>
            <DialogDescription>
              {actionDialog?.type === "approve"
                ? `Approve ${actionDialog?.request.applicant_name}'s signup. This will enable their Firebase account and grant access.`
                : `Reject ${actionDialog?.request.applicant_name}'s signup.`}
            </DialogDescription>
          </DialogHeader>
          {actionDialog?.type === "approve" && (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Role</Label>
                <Select value={actionRole} onValueChange={setActionRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">Client</SelectItem>
                    <SelectItem value="collaborator">Collaborator</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Grant Application Access</Label>
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded p-2">
                  {apps.map((app) => (
                    <div key={app.app_id} className="flex items-center gap-3 py-1">
                      <Checkbox
                        id={`umu-app-${app.app_id}`}
                        checked={selectedApps[app.app_id]?.selected || false}
                        onCheckedChange={() => toggleApp(app.app_id)}
                      />
                      <label htmlFor={`umu-app-${app.app_id}`} className="flex-1 text-sm cursor-pointer">
                        {app.name}
                      </label>
                      {selectedApps[app.app_id]?.selected && (
                        <Select
                          value={selectedApps[app.app_id]?.role || "viewer"}
                          onValueChange={(v) => setAppRole(app.app_id, v)}
                        >
                          <SelectTrigger className="w-24 h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">Viewer</SelectItem>
                            <SelectItem value="editor">Editor</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium">Note (optional)</label>
            <Textarea
              value={actionNote}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setActionNote(e.target.value)}
              placeholder="Add a note..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={actionDialog?.type === "approve" ? "default" : "destructive"}
              onClick={handleAction}
              disabled={actionInProgress}
            >
              {actionInProgress ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : null}
              {actionDialog?.type === "approve" ? "Approve & Enable" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
