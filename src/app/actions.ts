"use server";

import { revalidatePath } from "next/cache";
import { runSync } from "@/lib/sync";
import { evaluateTrade, type TradeResult } from "@/lib/analysis/playoffs";
import { getSnapshot } from "@/lib/sync";

// Server actions only run for signed-in users: they post to page URLs, which the middleware guards.

export async function refreshData(): Promise<{ ok: boolean; message?: string }> {
  try {
    const snap = await runSync();
    revalidatePath("/", "layout");
    return snap.sources.espn.ok ? { ok: true } : { ok: false, message: snap.sources.espn.message };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Refresh failed." };
  }
}

export async function runTrade(giveIds: number[], getIds: number[]): Promise<TradeResult | null> {
  const snap = await getSnapshot();
  if (!snap || giveIds.length === 0 || getIds.length === 0) return null;
  return evaluateTrade(snap, giveIds, getIds);
}
