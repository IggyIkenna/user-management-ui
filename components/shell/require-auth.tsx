"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@/components/ui/spinner";

const SKIP_AUTH = process.env.NEXT_PUBLIC_SKIP_AUTH === "true";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (SKIP_AUTH || loading || user) return;
    const currentPath =
      typeof window !== "undefined" ? window.location.pathname : "/";
    router.replace(`/login?redirect=${encodeURIComponent(currentPath)}`);
  }, [SKIP_AUTH, loading, user, router]);

  if (SKIP_AUTH) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="size-6" />
      </div>
    );
  }

  return <>{children}</>;
}
