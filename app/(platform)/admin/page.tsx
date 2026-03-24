"use client";

import * as React from "react";
import Link from "next/link";
import {
  Users,
  AppWindow,
  UserCog,
  FileText,
  Activity,
  ArrowRight,
  LayoutTemplate,
  Shield,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ServiceTabs, ADMIN_TABS } from "@/components/shell/service-tabs";
import { getAdminStats } from "@/lib/api/settings";
import { formatDateTime } from "@/lib/utils";

const ACTION_COLORS: Record<string, string> = {
  "entitlement.granted": "bg-emerald-600/15 text-emerald-400 border-emerald-600/20",
  "entitlement.updated": "bg-blue-600/15 text-blue-400 border-blue-600/20",
  "entitlement.revoked": "bg-red-600/15 text-red-400 border-red-600/20",
  "entitlement.bulk_granted": "bg-amber-600/15 text-amber-400 border-amber-600/20",
  "group.member_added": "bg-purple-600/15 text-purple-400 border-purple-600/20",
  "group.member_removed": "bg-orange-600/15 text-orange-400 border-orange-600/20",
  "capabilities.updated": "bg-cyan-600/15 text-cyan-400 border-cyan-600/20",
  "settings.password_changed": "bg-pink-600/15 text-pink-400 border-pink-600/20",
};

interface Stats {
  users: { total: number; active: number; disabled: number };
  apps: { total: number; with_capabilities: number };
  groups: { total: number; total_members: number };
  entitlements: { total: number };
  recent_audit: Array<{
    id: string;
    action: string;
    app_id?: string;
    subject_id?: string;
    actor: string;
    timestamp: string;
  }>;
}

export default function AdminPage() {
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await getAdminStats();
        setStats(res.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stats");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const KPI_CARDS = [
    {
      label: "Users",
      value: stats ? `${stats.users.active} active` : null,
      sub: stats ? `${stats.users.disabled} disabled of ${stats.users.total}` : null,
      icon: Users,
      color: "text-primary",
      href: "/users",
    },
    {
      label: "Applications",
      value: stats ? `${stats.apps.total} registered` : null,
      sub: stats ? `${stats.apps.with_capabilities} with capabilities` : null,
      icon: AppWindow,
      color: "text-emerald-400",
      href: "/apps",
    },
    {
      label: "Groups",
      value: stats ? `${stats.groups.total} groups` : null,
      sub: stats ? `${stats.groups.total_members} total members` : null,
      icon: UserCog,
      color: "text-amber-400",
      href: "/groups",
    },
    {
      label: "Entitlements",
      value: stats ? `${stats.entitlements.total} grants` : null,
      sub: "active user/group access",
      icon: ShieldCheck,
      color: "text-purple-400",
      href: "/audit-log",
    },
  ];

  const QUICK_ACTIONS = [
    { label: "Manage Users", href: "/users", icon: Users },
    { label: "Onboard User", href: "/onboard", icon: UserPlus },
    { label: "Applications", href: "/apps", icon: AppWindow },
    { label: "Groups", href: "/groups", icon: UserCog },
    { label: "Templates", href: "/templates", icon: LayoutTemplate },
    { label: "Audit Log", href: "/audit-log", icon: FileText },
    { label: "Health Checks", href: "/health-checks", icon: Activity },
    { label: "Settings", href: "/settings", icon: Shield },
  ];

  return (
    <div className="space-y-6">
      <ServiceTabs tabs={ADMIN_TABS} />

      <div>
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Real-time overview of the user management platform
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPI_CARDS.map((card) => (
          <Link key={card.label} href={card.href}>
            <Card className="group hover:border-primary/50 transition-colors cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                  {card.label}
                  <card.icon className={`size-4 ${card.color}`} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Spinner className="size-5" />
                ) : (
                  <>
                    <p className="text-xl font-bold">{card.value ?? "---"}</p>
                    <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
                  </>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              Recent Activity
            </CardTitle>
            <CardDescription>
              Last 10 access control changes
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Spinner className="size-5" />
            ) : !stats?.recent_audit.length ? (
              <p className="text-sm text-muted-foreground">No recent audit events.</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.recent_audit.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <Badge
                            className={ACTION_COLORS[entry.action] || "bg-muted text-muted-foreground"}
                          >
                            {entry.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {entry.app_id || entry.subject_id || "---"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {formatDateTime(entry.timestamp)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="size-4 text-primary" />
                  System Health
                </CardTitle>
                <CardDescription>
                  Provider connectivity status
                </CardDescription>
              </div>
              <Link href="/health-checks">
                <Button variant="outline" size="sm">
                  Run Checks
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { name: "Firebase Auth", status: "connected" },
                { name: "Firestore", status: "connected" },
                { name: "GCP IAM", status: "connected" },
                { name: "GitHub", status: stats ? "configured" : "unknown" },
                { name: "Slack", status: "needs secrets" },
                { name: "M365 / Graph", status: "needs secrets" },
                { name: "AWS", status: "needs secrets" },
                { name: "Workflows", status: "disabled" },
              ].map((svc) => (
                <div
                  key={svc.name}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <span className="text-sm">{svc.name}</span>
                  <Badge
                    variant="outline"
                    className={
                      svc.status === "connected"
                        ? "border-emerald-600/30 text-emerald-400"
                        : svc.status === "configured"
                          ? "border-blue-600/30 text-blue-400"
                          : svc.status === "disabled"
                            ? "border-zinc-600/30 text-zinc-400"
                            : "border-amber-600/30 text-amber-400"
                    }
                  >
                    {svc.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      <div>
        <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACTIONS.map((action) => (
            <Link key={action.href} href={action.href}>
              <Card className="group hover:border-primary/50 transition-colors cursor-pointer">
                <CardContent className="flex items-center justify-between pt-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
                      <action.icon className="size-4 text-muted-foreground" />
                    </div>
                    <span className="font-medium text-sm">{action.label}</span>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
