"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface TabDefinition {
  label: string;
  href: string;
}

export const MANAGE_TABS: TabDefinition[] = [
  { label: "Users", href: "/users" },
  { label: "Groups", href: "/groups" },
  { label: "Templates", href: "/templates" },
  { label: "Applications", href: "/apps" },
  { label: "Onboard", href: "/onboard" },
];

export const ADMIN_TABS: TabDefinition[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Health Checks", href: "/health-checks" },
  { label: "Audit Log", href: "/audit-log" },
  { label: "Firebase Users", href: "/firebase-users" },
  { label: "Settings", href: "/settings" },
];

interface ServiceTabsProps {
  tabs: TabDefinition[];
}

export function ServiceTabs({ tabs }: ServiceTabsProps) {
  const pathname = usePathname() || "";

  return (
    <div data-slot="service-tabs" className="border-b border-border mb-4">
      <nav className="flex gap-1 px-1 -mb-px overflow-x-auto">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href ||
            (tab.href !== "/" && pathname.startsWith(tab.href + "/"));
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
