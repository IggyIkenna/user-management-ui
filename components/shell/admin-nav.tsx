"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Users,
  UserPlus,
  UsersRound,
  Shield,
  KeyRound,
  AppWindow,
  ScrollText,
  HeartPulse,
  LayoutDashboard,
  Settings,
  LogOut,
  User,
  ChevronDown,
  GitBranch,
  Inbox,
} from "lucide-react";

interface NavSection {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: { label: string; href: string; icon: React.ComponentType<{ className?: string }> }[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    id: "people",
    label: "People",
    icon: Users,
    items: [
      { label: "Users", href: "/users", icon: Users },
      { label: "Signup Requests", href: "/requests", icon: Inbox },
      { label: "Onboard", href: "/onboard", icon: UserPlus },
      { label: "Groups", href: "/groups", icon: UsersRound },
      { label: "Templates", href: "/templates", icon: Shield },
      { label: "Firebase Users", href: "/firebase-users", icon: KeyRound },
    ],
  },
  {
    id: "platform",
    label: "Platform",
    icon: AppWindow,
    items: [
      { label: "Applications", href: "/apps", icon: AppWindow },
      { label: "GitHub Access", href: "/github", icon: GitBranch },
      { label: "Audit Log", href: "/audit-log", icon: ScrollText },
      { label: "Health Checks", href: "/health-checks", icon: HeartPulse },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    icon: LayoutDashboard,
    items: [
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export function AdminNav() {
  const pathname = usePathname() || "";
  const { user, logout } = useAuth();

  const currentSection = NAV_SECTIONS.find((s) =>
    s.items.some(
      (item) =>
        pathname === item.href || pathname.startsWith(item.href + "/"),
    ),
  );

  return (
    <nav className="flex items-center justify-between px-3 py-1.5 bg-card border-b border-border shadow-sm gap-2 overflow-x-auto">
      <div className="flex items-center gap-4">
        <Link href="/users" className="flex items-center gap-2 group mr-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 transition-transform group-hover:scale-110">
            <Shield className="size-4 text-primary" />
          </div>
          <span className="font-semibold text-sm hidden xl:inline">
            User Management
          </span>
        </Link>

        <div className="flex items-center">
          {NAV_SECTIONS.map((section, idx) => {
            const Icon = section.icon;
            const isActive = currentSection?.id === section.id;

            return (
              <React.Fragment key={section.id}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted",
                      )}
                    >
                      <Icon className="size-3.5" />
                      <span className="hidden lg:inline">{section.label}</span>
                      <ChevronDown className="size-3 opacity-50 hidden sm:block" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                    <DropdownMenuLabel className="flex items-center gap-2">
                      <Icon className="size-4 text-primary" />
                      <span className="font-medium">{section.label}</span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {section.items.map((item) => {
                      const ItemIcon = item.icon;
                      const itemActive =
                        pathname === item.href ||
                        pathname.startsWith(item.href + "/");
                      return (
                        <DropdownMenuItem key={item.href} asChild>
                          <Link
                            href={item.href}
                            className={cn(
                              "flex items-center gap-2",
                              itemActive && "bg-primary/10 text-primary",
                            )}
                          >
                            <ItemIcon className="size-4" />
                            <span>{item.label}</span>
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>

                {idx < NAV_SECTIONS.length - 1 && (
                  <div className="w-2 h-px bg-border mx-0.5 hidden lg:block" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2 shrink-0">
        {user && (
          <Badge variant="outline" className="text-[10px] hidden sm:inline-flex">
            {user.role}
          </Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 rounded-full bg-primary/10 text-primary font-semibold text-xs"
            >
              {user?.displayName
                ?.split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2) ?? "U"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">
                  {user?.displayName ?? "User"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {user?.email ?? ""}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center gap-2">
                <User className="size-4" />
                Profile & Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                logout();
                window.location.href = "/login";
              }}
            >
              <LogOut className="size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
