"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Circle, AlertTriangle } from "lucide-react";

type ApiStatus = "reachable" | "degraded" | "offline";

const statusColors: Record<ApiStatus, string> = {
  reachable: "text-emerald-400",
  degraded: "text-amber-400",
  offline: "text-red-400",
};

export function RuntimeStrip() {
  const [apiStatus, setApiStatus] = React.useState<ApiStatus>("offline");

  React.useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/health", {
          signal: AbortSignal.timeout(3000),
        });
        const data = await res.json();
        if (data?.status === "healthy" || res.ok) {
          setApiStatus("reachable");
        } else {
          setApiStatus("degraded");
        }
      } catch {
        setApiStatus("offline");
      }
    };

    poll();
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-0.5 text-[10px] border-b border-border/30 bg-background/50">
        <Badge
          variant="outline"
          className="text-[9px] px-1.5 py-0 h-4 border-violet-500/30 text-violet-400 bg-violet-500/10"
        >
          DEV
        </Badge>

        <div className="w-px h-3 bg-border/50" />

        <span
          className={cn("flex items-center gap-1", statusColors[apiStatus])}
        >
          <Circle
            className={cn(
              "size-1.5 fill-current",
              apiStatus === "reachable" && "animate-pulse",
            )}
          />
          {apiStatus === "reachable" && "API Reachable"}
          {apiStatus === "degraded" && "Degraded"}
          {apiStatus === "offline" && "API Offline"}
        </span>
      </div>

      {apiStatus === "offline" && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-red-950/50 border-b border-red-500/20 text-red-300 text-xs">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>
            Express API not reachable. Start it with{" "}
            <code className="bg-red-900/50 px-1 rounded text-[10px]">
              npm run server:dev
            </code>
          </span>
        </div>
      )}
    </>
  );
}
