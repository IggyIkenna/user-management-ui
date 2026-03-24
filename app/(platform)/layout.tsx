"use client";

import { RequireAuth } from "@/components/shell/require-auth";
import { AdminShell } from "@/components/shell/admin-shell";

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth>
      <AdminShell>{children}</AdminShell>
    </RequireAuth>
  );
}
