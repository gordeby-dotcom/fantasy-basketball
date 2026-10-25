import Link from "next/link";
import { Nav } from "@/components/Nav";
import { RefreshButton } from "@/components/RefreshButton";
import { ago } from "@/lib/format";
import { getSnapshot } from "@/lib/sync";

export const dynamic = "force-dynamic";

const STALE_MS = 26 * 60 * 60 * 1000;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const snap = await getSnapshot();
  const problems: string[] = [];
  if (snap) {
    if (!snap.sources.espn.ok && snap.sources.espn.message) problems.push(`ESPN: ${snap.sources.espn.message}`);
    if (!snap.sources.bbm.ok && snap.sources.bbm.message) problems.push(`Basketball Monster: ${snap.sources.bbm.message}`);
    if (Date.now() - snap.syncedAt > STALE_MS) problems.unshift(`Data out of date: last updated ${ago(snap.syncedAt)}.`);
  }

  return (
    <div className="min-h-dvh pb-24 sm:pb-8">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 pb-2 pt-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">Dylan&apos;s Game Plan</h1>
          <p className="text-xs text-muted">{snap ? `Updated ${ago(snap.syncedAt)}` : "Not synced yet"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/learn" aria-label="Learn the strategy" className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-card text-lg">
            💡
          </Link>
          <RefreshButton />
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4">
        <Nav />
      </div>
      {problems.length > 0 && (
        <div className="mx-auto mt-2 max-w-3xl px-4">
          <div role="status" className="rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-warn">
            {problems.map((p) => (
              <p key={p}>⚠️ {p}</p>
            ))}
          </div>
        </div>
      )}
      <main className="mx-auto mt-3 max-w-3xl px-4">
        {snap ? (
          children
        ) : (
          <div className="rounded-2xl border border-line bg-card p-6 text-center">
            <p className="text-lg font-semibold">No data yet</p>
            <p className="mt-1 text-muted">Press Refresh to pull Dylan&apos;s league from ESPN.</p>
            <div className="mt-4 flex justify-center">
              <RefreshButton label="Load my league" />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
