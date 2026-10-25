"use client";

import { useState, useTransition } from "react";
import { refreshData } from "@/app/actions";

export function RefreshButton({ label = "Refresh" }: { label?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await refreshData();
            setError(res.ok ? null : (res.message ?? "Refresh failed."));
          })
        }
        className="h-10 rounded-full border border-line bg-card px-4 text-sm font-semibold disabled:opacity-60"
      >
        {pending ? "Refreshing…" : label}
      </button>
      {error && <p className="mt-1 max-w-56 text-right text-xs text-bad">{error}</p>}
    </div>
  );
}
