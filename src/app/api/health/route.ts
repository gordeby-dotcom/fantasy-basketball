import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { checkStore, getValue } from "@/lib/store";
import { fetchLeague } from "@/lib/espn/client";
import { fetchBbmRankings } from "@/lib/bbm";
import type { Snapshot } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Diagnostics for setup problems. Behind the site login (middleware). Shows variable names and yes/no
// checks only; never a secret's value.
const REQUIRED = ["ESPN_LEAGUE_ID", "ESPN_SEASON", "ESPN_S2", "ESPN_SWID", "BBM_USERNAME", "BBM_PASSWORD", "SITE_PASSWORD", "AUTH_SECRET", "CRON_SECRET"];

async function attempt(fn: () => Promise<unknown>): Promise<{ ok: boolean; message?: string }> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message.slice(0, 200) : "failed" };
  }
}

export async function GET() {
  const [store, espn, bbm] = await Promise.all([
    checkStore(),
    attempt(() => fetchLeague()),
    attempt(async () => {
      const { rows, warning } = await fetchBbmRankings();
      if (warning) throw new Error(warning);
      return rows;
    }),
  ]);
  const snap = store.ok ? await getValue<Snapshot>("snapshot").catch(() => null) : null;
  return NextResponse.json({
    deploy: { onVercel: env.onVercel(), commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7) },
    variables: Object.fromEntries(REQUIRED.map((name) => [name, env.isSet(name) ? "set" : "MISSING"])),
    storage: {
      urlVariable: env.redis.urlName() || "none found",
      tokenVariable: env.redis.tokenName() || "none found",
      storageLikeNames: env.storageLikeNames(),
      ...store,
    },
    espn,
    basketballMonster: bbm,
    lastSync: snap ? new Date(snap.syncedAt).toISOString() : "never",
  });
}
