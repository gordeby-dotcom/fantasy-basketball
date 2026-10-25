import Link from "next/link";
import { Card } from "@/components/ui";
import { Term } from "@/components/Term";
import { GamesGrid } from "@/components/GamesGrid";
import { buildGrid, focusPeriod } from "@/lib/analysis/weekly";
import { monthDay } from "@/lib/format";
import { getSnapshot } from "@/lib/sync";
import type { Snapshot } from "@/lib/types";

export default async function GamesPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const snap = (await getSnapshot()) as Snapshot;
  const thisWeek = focusPeriod(snap).period;
  const nextWeek = snap.matchupPeriods[thisWeek + 1] ? thisWeek + 1 : null;
  const period = week === "next" && nextWeek ? nextWeek : thisWeek;
  const grid = buildGrid(snap, period);
  const first = grid.days[0]?.date;
  const last = grid.days.at(-1)?.date;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <WeekTab href="/games" active={period === thisWeek} label="This week" />
        {nextWeek && <WeekTab href="/games?week=next" active={period === nextWeek} label="Next week" />}
      </div>
      <Card
        title={`Week ${period}`}
        aside={first && last ? <span className="text-sm text-muted">{monthDay(first)} – {monthDay(last)}</span> : null}
      >
        <p className="mb-3 text-sm text-muted">
          A dot means that player has a game. Players with 3–4 games are the best to <Term k="streaming">stream</Term>.
        </p>
        <GamesGrid grid={grid} />
      </Card>
    </div>
  );
}

function WeekTab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`flex h-11 items-center rounded-full px-5 text-sm font-semibold ${active ? "bg-accent text-white" : "border border-line bg-card"}`}
    >
      {label}
    </Link>
  );
}
