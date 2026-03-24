"use client";

import * as React from "react";
import { AdminNav } from "./admin-nav";
import { RuntimeStrip } from "./runtime-strip";
import { cn } from "@/lib/utils";

interface AdminShellProps {
  children: React.ReactNode;
  className?: string;
}

export function AdminShell({ children, className }: AdminShellProps) {
  return (
    <div className={cn("min-h-screen bg-background", className)}>
      <AdminNav />
      <RuntimeStrip />
      <main className="container px-4 md:px-6 py-6 pb-10">{children}</main>
    </div>
  );
}
