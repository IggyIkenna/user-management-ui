"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  MoreHorizontal,
  Eye,
  Pencil,
  UserMinus,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ServiceTabs, MANAGE_TABS } from "@/components/shell/service-tabs";
import { listUsers } from "@/lib/api/users";
import type { Person, ProvisioningStatus, UserRole } from "@/lib/api/types";

const SERVICE_COLUMNS = [
  { key: "github" as const, label: "GitHub" },
  { key: "slack" as const, label: "Slack" },
  { key: "microsoft365" as const, label: "M365" },
  { key: "gcp" as const, label: "GCP" },
  { key: "aws" as const, label: "AWS" },
  { key: "portal" as const, label: "Portal" },
];

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

function serviceLabel(status: ProvisioningStatus) {
  switch (status) {
    case "provisioned":
      return "Active";
    case "pending":
      return "Pending";
    case "failed":
      return "Failed";
    case "not_applicable":
      return "N/A";
    default:
      return status;
  }
}

export default function UsersListPage() {
  const router = useRouter();
  const [users, setUsers] = React.useState<Person[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<string>("all");

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listUsers()
      .then((res) => {
        if (!cancelled) setUsers(res.data.users);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load users");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = React.useMemo(() => {
    let result = users;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      );
    }
    if (roleFilter !== "all") {
      result = result.filter((u) => u.role === roleFilter);
    }
    return result;
  }, [users, search, roleFilter]);

  return (
    <div className="space-y-4">
      <ServiceTabs tabs={MANAGE_TABS} />

      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Users</h1>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {ROLE_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {loading ? (
        <TableSkeleton rows={8} columns={11} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users found"
          description={
            search || roleFilter !== "all"
              ? "Try adjusting your search or filters."
              : "No users have been onboarded yet."
          }
          action={
            !search && roleFilter === "all"
              ? {
                  label: "Onboard User",
                  onClick: () => router.push("/onboard"),
                }
              : undefined
          }
        />
      ) : (
        <div className="rounded-lg border border-border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                {SERVICE_COLUMNS.map((s) => (
                  <TableHead key={s.key} className="text-center">
                    {s.label}
                  </TableHead>
                ))}
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((user) => (
                <TableRow
                  key={user.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/users/${user.id}`)}
                >
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{user.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(user.status)}>
                      {user.status}
                    </Badge>
                  </TableCell>
                  {SERVICE_COLUMNS.map((s) => (
                    <TableCell key={s.key} className="text-center">
                      <Badge
                        variant={serviceBadgeVariant(user.services[s.key])}
                      >
                        {serviceLabel(user.services[s.key])}
                      </Badge>
                    </TableCell>
                  ))}
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/users/${user.id}`}>
                            <Eye className="mr-2 size-4" />
                            View
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/users/${user.id}/modify`}>
                            <Pencil className="mr-2 size-4" />
                            Modify
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          asChild
                        >
                          <Link href={`/users/${user.id}/offboard`}>
                            <UserMinus className="mr-2 size-4" />
                            Offboard
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
