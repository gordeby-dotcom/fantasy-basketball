import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily sync, called by Vercel Cron with "Authorization: Bearer <CRON_SECRET>".
// The in-app Refresh button uses a server action instead, behind the site login.
export async function GET(req: NextRequest) {
  const secret = env.cronSecret();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const snap = await runSync();
    return NextResponse.json({ ok: snap.sources.espn.ok, bbm: snap.sources.bbm.ok, syncedAt: snap.syncedAt });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "sync failed" }, { status: 500 });
  }
}
