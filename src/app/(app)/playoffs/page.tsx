import Link from "next/link";
import { Card, Pill, PlayerName } from "@/components/ui";
import { Term } from "@/components/Term";
import { buildPlayoffView, type PlayoffRow } from "@/lib/analysis/playoffs";
import { monthDay, pts } from "@/lib/format";
import { getSnapshot } from "@/lib/sync";
import type { Snapshot } from "@/lib/types";

const FILTERS = [
  { key: "mine", label: "My team" },
  { key: "fa", label: "Free agents" },
  { key: "all", label: "Everyone" },
] as const;

export default async function PlayoffsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show = "mine" } = await searchParams;
  const snap = (await getSnapshot()) as Snapshot;
  if (snap.playoffMatchupPeriods.length === 0) {
    return <Card title="Playoffs">ESPN hasn&apos;t published this league&apos;s playoff weeks yet.</Card>;
  }
  const view = buildPlayoffView(snap);
  const rows = view.rows
    .filter((r) => (show === "mine" ? r.mine : show === "fa" ? r.player.onTeamId === 0 : true))
    .slice(0, show === "mine" ? 20 : 40);

  return (
    <div className="flex flex-col gap-4">
      <Card title="Fantasy playoff weeks">
        <ol className="grid grid-cols-3 gap-2 text-center text-sm">
          {view.weeks.map((w, i) => (
            <li key={w.period} className="rounded-xl bg-bg p-2">
              <p className="font-bold">Week {i + 1}</p>
              <p className="text-xs text-muted">
                {monthDay(w.start)}–{monthDay(w.end)}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-muted">
          A schedule like <Term k="fourFourFour">4-4-4</Term> means four games in each playoff week. More games = more points
          when it matters most.
        </p>
      </Card>

      <Card title="Trade targets">
        {view.flagged.length === 0 ? (
          <p className="text-sm">
            None of your top 8 players has a <Term k="twoGameWeek">2-game week</Term>. Your playoff schedule looks solid.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {view.flagged.map((f) => {
              const targets = view.targets.filter((t) => t.forPlayerId === f.player.id);
              return (
                <li key={f.player.id} className="rounded-xl bg-bg p-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <PlayerName player={f.player} />
                    <Pill tone="bad">{f.pattern}</Pill>
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Has a <Term k="twoGameWeek">2-game week</Term>. Players with better playoff schedules:
                  </p>
                  {targets.length === 0 ? (
                    <p className="mt-1 text-sm">No clear upgrade on other teams right now.</p>
                  ) : (
                    <ul className="mt-2 flex flex-col gap-2">
                      {targets.map((t) => (
                        <li key={t.target.player.id} className="text-sm">
                          <span className="flex flex-wrap items-center gap-2">
                            <PlayerName player={t.target.player} /> <Pill tone="good">{t.target.pattern}</Pill>
                          </span>
                          <span className="text-muted">
                            On {t.target.teamName}. {t.reason}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link href={`/trade?give=${f.player.id}`} className="mt-2 inline-block text-sm font-semibold text-accent">
                    Try a trade →
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Playoff schedules">
        <div className="mb-3 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`/playoffs?show=${f.key}`}
              className={`flex h-10 items-center rounded-full px-4 text-sm font-semibold ${show === f.key ? "bg-text text-bg" : "border border-line"}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <PlayoffLine key={r.player.id} r={r} showTeam={show !== "mine"} />
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Ranked by <Term k="projected">projected points</Term> across the three playoff weeks.
        </p>
      </Card>
    </div>
  );
}

function PlayoffLine({ r, showTeam }: { r: PlayoffRow; showTeam: boolean }) {
  const tone = r.hasTwoGameWeek ? "bad" : r.games.every((g) => g >= 4) ? "good" : r.games.every((g) => g >= 3) ? "accent" : "warn";
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <PlayerName player={r.player} />
        {showTeam && <p className="truncate text-xs text-muted">{r.teamName}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Pill tone={tone}>{r.pattern}</Pill>
        <span className="w-12 text-right text-sm tabular">{pts(r.playoffPoints)}</span>
      </div>
    </li>
  );
}
