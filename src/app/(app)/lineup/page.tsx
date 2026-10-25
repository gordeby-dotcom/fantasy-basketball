import Link from "next/link";
import { Card, Pill, PlayerName } from "@/components/ui";
import { Term } from "@/components/Term";
import { optimizeBench, type OptimizerDay, type RosterRow } from "@/lib/analysis/optimizer";
import { focusPeriod } from "@/lib/analysis/weekly";
import { SLOT_LABEL, STARTING_SLOTS } from "@/lib/espn/constants";
import { dayShort, monthDay, pts, signed } from "@/lib/format";
import { getSnapshot } from "@/lib/sync";
import type { Snapshot } from "@/lib/types";

// Ranks within this many spots count as the sources agreeing.
const RANK_SLACK = 2;

export default async function LineupPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const snap = (await getSnapshot()) as Snapshot;
  const thisWeek = focusPeriod(snap).period;
  const nextWeek = snap.matchupPeriods[thisWeek + 1] ? thisWeek + 1 : null;
  const v = optimizeBench(snap, week === "next" && nextWeek ? nextWeek : undefined);
  const name = (id: number) => snap.players[id]?.name ?? "Unknown";
  const slots = STARTING_SLOTS.reduce((n, s) => n + (snap.lineupSlotCounts[s] ?? 0), 0);
  const rosterSize = v.roster.length;
  const benchSpots = Math.max(0, rosterSize - slots);
  // Starter / bench / cut tiers count healthy players only; injured players get their own label.
  const healthy = v.roster.filter((r) => r.player.injuryStatus !== "OUT");
  const tierOf = (r: RosterRow): Tier => {
    if (r.player.injuryStatus === "OUT") return "out";
    const i = healthy.indexOf(r);
    return i < slots ? "start" : i < healthy.length - 1 ? "bench" : "cut";
  };
  const disagree = v.roster.filter((r) => Math.abs(r.bbmRank - r.espnRank) > RANK_SLACK);

  return (
    <div className="flex flex-col gap-4">
      {v.today && (v.today.sitsWithGame.length > 0 || v.today.moves.length > 0) && (
        <Card title="Fix today's lineup" className="border-bad">
          <ul className="flex flex-col gap-2 text-sm">
            {v.today.sitsWithGame.map((id) => (
              <li key={`b${id}`}>
                ⚠️ <b>{name(id)}</b> has a game today but is on your ESPN bench.
              </li>
            ))}
            {v.today.moves.map((m) => (
              <li key={`m${m.start}`}>
                By BBM: start <b>{name(m.start)}</b>
                {m.sit ? (
                  <>
                    {" "}
                    instead of <b>{name(m.sit)}</b>
                  </>
                ) : null}
                .
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Based on your lineup at the last sync. Games that already started are locked.</p>
        </Card>
      )}

      <Card title="Your roster: BBM vs ESPN" aside={<span className="text-xs text-muted">Ranked by points per game</span>}>
        <p className="mb-3 text-sm text-muted">
          Your top {slots} can start on a full day; the other {benchSpots} are your bench. If the two sources rank a player far apart,
          think before you cut or trade him.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="py-1 text-left font-medium">Player</th>
              <th className="w-16 py-1 text-right font-medium">BBM</th>
              <th className="w-16 py-1 text-right font-medium">ESPN</th>
            </tr>
          </thead>
          <tbody>
            {v.roster.map((r) => (
              <RosterLine key={r.player.id} r={r} tier={tierOf(r)} />
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted">
          #rank and points per game in each source. BBM uses this season&apos;s stats, so a player with only a game or two can look
          off; the game count is shown. &quot;No BBM&quot; means BBM doesn&apos;t list him, so both columns use ESPN.
        </p>
        {disagree.length > 0 && (
          <p className="mt-2 text-sm">
            <b>Sources disagree on:</b> {disagree.map((r) => r.player.name).join(", ")}.
          </p>
        )}
      </Card>

      <div className="flex gap-2">
        <WeekTab href="/lineup" active={v.period === thisWeek} label="This week" />
        {nextWeek && <WeekTab href="/lineup?week=next" active={v.period === nextWeek} label="Next week" />}
      </div>

      <Card title={`Daily lineups, week ${v.period}`}>
        <div className="grid grid-cols-2 gap-3 text-center">
          <Total label="Best by BBM" value={v.totals.bbm} sub={`${pts(v.totals.bbmScoredByEspn)} if ESPN is right`} />
          <Total label="Best by ESPN" value={v.totals.espn} sub={`${pts(v.totals.espnScoredByBbm)} if BBM is right`} />
        </div>
        <ul className="mt-4 flex flex-col gap-3">
          {v.days.map((d) => (
            <DayLine key={d.sp} d={d} name={name} slots={slots} />
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Each source&apos;s points use its own numbers. When everyone with a game fits in your {slots} spots, there&apos;s no one to bench:
          the open spots are where a <Term k="streaming">streamer</Term> would add points.
        </p>
      </Card>
    </div>
  );
}

type Tier = "start" | "bench" | "cut" | "out";

function RosterLine({ r, tier }: { r: RosterRow; tier: Tier }) {
  const off = Math.abs(r.bbmRank - r.espnRank) > RANK_SLACK;
  return (
    <tr className={`border-t border-line ${off ? "bg-warn-soft" : ""}`}>
      <td className="py-2 pr-2">
        <div className="flex min-w-0 flex-col">
          <PlayerName player={r.player} />
          <span className="text-xs text-muted">
            {{ start: "Starter", bench: "Bench", cut: "First to cut", out: "Injured" }[tier]}
            {r.bbmFallback ? " · No BBM" : ` · BBM from ${r.bbmGames} ${r.bbmGames === 1 ? "game" : "games"}`}
          </span>
        </div>
      </td>
      <td className="py-2 text-right tabular">
        <span className="text-xs text-muted">#{r.bbmRank}</span> <b>{pts(r.bbmPpg)}</b>
      </td>
      <td className="py-2 text-right tabular">
        <span className="text-xs text-muted">#{r.espnRank}</span> <b>{pts(r.espnPpg)}</b>
      </td>
    </tr>
  );
}

function DayLine({ d, name, slots }: { d: OptimizerDay; name: (id: number) => string; slots: number }) {
  const agree = d.onlyBbm.length === 0 && d.onlyEspn.length === 0;
  const open = slots - d.bbm.starters.length;
  return (
    <li className="rounded-xl bg-bg p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">
          {dayShort(d.date)} {monthDay(d.date)}
          {d.isToday && <span className="text-accent"> · today</span>}
        </span>
        {agree ? <Pill tone="good">Same lineup</Pill> : <Pill tone="warn">Sources differ</Pill>}
      </div>
      <p className="mt-1 text-muted">
        {d.bbm.starters.length} with a game{open > 0 ? `, ${open} open ${open === 1 ? "spot" : "spots"}` : ""}
        {d.bbm.sits.length > 0 ? `, sit ${d.bbm.sits.map(name).join(", ")}` : ""}.
      </p>
      {!agree && (
        <p className="mt-1">
          BBM starts <b>{d.onlyBbm.map(name).join(", ")}</b>; ESPN starts <b>{d.onlyEspn.map(name).join(", ")}</b> instead.
        </p>
      )}
      {d.bbm.starters.length > 0 && (
        <p className="mt-1 text-xs text-muted">
          {d.bbm.starters.map((s) => `${SLOT_LABEL[s.slot]} ${name(s.playerId)}`).join(" · ")}
        </p>
      )}
      <p className="mt-1 text-xs text-muted tabular">
        BBM {pts(d.bbm.points)} · ESPN {pts(d.espn.points)} ({signed(d.bbm.points - d.espn.points)})
      </p>
    </li>
  );
}

function Total({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded-xl bg-bg p-3">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-2xl font-bold tabular">{pts(value)}</p>
      <p className="text-xs text-muted">{sub}</p>
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
