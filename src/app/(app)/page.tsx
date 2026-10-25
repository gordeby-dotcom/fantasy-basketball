import Link from "next/link";
import { Card, GapNote, Pill, PlayerName } from "@/components/ui";
import { Term } from "@/components/Term";
import { analyzeMatchup, suggestMoves, type MatchupView, type StatRow } from "@/lib/analysis/weekly";
import { buildPlayoffView, playoffMode } from "@/lib/analysis/playoffs";
import { dayShort, monthDay, pts, signed } from "@/lib/format";
import { getSnapshot } from "@/lib/sync";
import type { Snapshot } from "@/lib/types";

export default async function Home() {
  const snap = (await getSnapshot()) as Snapshot;
  const matchup = analyzeMatchup(snap);
  const moves = suggestMoves(snap, matchup.stats.filter((s) => s.label === "close").map((s) => s.statId));
  const playoffs = playoffMode(snap);

  return (
    <div className="flex flex-col gap-4">
      {playoffs && <PlayoffHeadline snap={snap} />}
      <MatchupCard m={matchup} bbm={Object.values(snap.players).some((p) => p.projSource === "bbm")} />
      <Card title="Best moves" aside={<span className="text-xs text-muted">Make these in the ESPN app</span>}>
        {moves.length === 0 ? (
          <p className="text-muted">No pickup beats your current roster for the rest of this week. Nice.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {moves.map((m, i) => (
              <li key={m.add.id} className="rounded-xl bg-bg p-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2">
                      <span className="text-good font-bold">Add</span> <PlayerName player={m.add} /> <GapNote gap={m.addGap} />
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2">
                      <span className="text-bad font-bold">Drop</span> <PlayerName player={m.drop} /> <GapNote gap={m.dropGap} />
                    </p>
                    <p className="mt-1.5 text-sm">{m.reason}</p>
                    {m.waiverNote && <p className="mt-1 text-sm text-warn">{m.waiverNote}</p>}
                  </div>
                  <Pill tone="good">{signed(m.gain)}</Pill>
                </div>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-sm text-muted">
          Why? <Term k="streaming">Streaming</Term> players with more games adds points.
        </p>
      </Card>
      <StatsCard m={matchup} />
      <LineupGaps m={matchup} />
      {!playoffs && <PlayoffHeadline snap={snap} quiet />}
    </div>
  );
}

function MatchupCard({ m, bbm }: { m: MatchupView; bbm: boolean }) {
  const myFinal = m.mine.current + m.mine.projectedAdd;
  const theirFinal = m.theirs.current + m.theirs.projectedAdd;
  const ahead = myFinal >= theirFinal;
  const gameEdge = m.mine.startedGamesLeft - m.theirs.startedGamesLeft;
  return (
    <Card>
      <p className="text-sm text-muted">
        Week {m.period} {m.inProgress ? `· ${m.daysLeft} days left` : "· starts soon"}
      </p>
      <h2 className="text-lg font-bold">You vs {m.opponentName}</h2>
      {m.pointsLeague ? (
        <div className="mt-3 grid grid-cols-2 gap-3 text-center">
          <Score label="You" value={myFinal} highlight={ahead} sub={m.inProgress ? `${pts(m.mine.current)} so far` : undefined} />
          <Score label="Them" value={theirFinal} highlight={!ahead} sub={m.inProgress ? `${pts(m.theirs.current)} so far` : undefined} />
        </div>
      ) : (
        m.categoriesWon && (
          <p className="mt-3 text-3xl font-bold tabular">
            {m.categoriesWon.mine}–{m.categoriesWon.theirs}
            {m.categoriesWon.tied ? `–${m.categoriesWon.tied}` : ""} <span className="text-base font-normal text-muted">projected categories</span>
          </p>
        )
      )}
      <div className="mt-3 rounded-xl bg-bg p-3 text-sm">
        <p>
          <Term k="gamesPlayed">Games left</Term>: <b className="tabular">{m.mine.startedGamesLeft}</b> for you,{" "}
          <b className="tabular">{m.theirs.startedGamesLeft}</b> for them.
        </p>
        <p className="mt-1 text-muted">
          {gameEdge > 0
            ? `You have ${gameEdge} more ${gameEdge === 1 ? "game" : "games"} in your lineup. Keep that edge.`
            : gameEdge < 0
              ? `They have ${-gameEdge} more ${gameEdge === -1 ? "game" : "games"}. Pick up players with games to catch up.`
              : "Even on games. One good pickup can tip it."}
        </p>
      </div>
      <p className="mt-2 text-xs text-muted">
        <Term k="projected">Projected</Term> with your league&apos;s scoring. Source:{" "}
        <Term k="sources">{bbm ? "Basketball Monster 26-27 stats blended with ESPN" : "ESPN (Basketball Monster unavailable)"}</Term>
      </p>
    </Card>
  );
}

function Score({ label, value, highlight, sub }: { label: string; value: number; highlight: boolean; sub?: string }) {
  return (
    <div className={`rounded-xl p-3 ${highlight ? "bg-good-soft" : "bg-bg"}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className={`text-3xl font-bold tabular ${highlight ? "text-good" : ""}`}>{pts(value)}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

const LABEL_TONE = { winning: "good", close: "warn", concede: "bad" } as const;
const LABEL_TEXT = { winning: "Winning", close: "Close", concede: "Give up" } as const;

function StatsCard({ m }: { m: MatchupView }) {
  const groups: StatRow["label"][] = ["close", "winning", "concede"];
  const fmtVal = (s: StatRow, v: number) => (m.pointsLeague ? pts(v) : s.short.endsWith("%") ? v.toFixed(3).replace(/^0/, "") : pts(v));
  // In a points league, stats worth only a few points either way can't swing the week, so leave them out.
  const minor = (s: StatRow) => m.pointsLeague && Math.max(Math.abs(s.mine), Math.abs(s.theirs)) < 15;
  const hidden = m.stats.filter(minor);
  return (
    <Card title="Stat by stat" aside={<span className="text-xs text-muted">{m.pointsLeague ? "Points from each stat, rest of week" : "Projected totals"}</span>}>
      {m.pointsLeague && (
        <p className="mb-3 text-sm text-muted">Labels compare each team per game played, so they show what your roster is good at.</p>
      )}
      <div className="flex flex-col gap-4">
        {groups.map((g) => {
          const rows = m.stats.filter((s) => s.label === g && !minor(s) && (Math.abs(s.mine) > 0.5 || Math.abs(s.theirs) > 0.5));
          if (!rows.length) return null;
          return (
            <div key={g}>
              <p className="mb-1.5 text-sm font-semibold">
                <Term k={g}>{LABEL_TEXT[g]}</Term>
              </p>
              <ul className="flex flex-col divide-y divide-line">
                {rows.map((s) => (
                  <li key={s.statId} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <Pill tone={LABEL_TONE[g]}>{s.short}</Pill> <span className="text-sm">{s.long}</span>
                    </span>
                    <span className="shrink-0 text-sm tabular">
                      <b>{fmtVal(s, s.mine)}</b> <span className="text-muted">vs {fmtVal(s, s.theirs)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {m.pointsLeague && (
        <p className="mt-3 text-sm text-muted">
          In a points league every stat adds to one total, so <Term k="concede">give up</Term> means don&apos;t chase it.
          {hidden.length > 0 && ` Small stats (${hidden.map((s) => s.short).join(", ")}) are hidden.`}
        </p>
      )}
    </Card>
  );
}

function LineupGaps({ m }: { m: MatchupView }) {
  const open = m.myDays.filter((d) => d.openSlots > 0);
  const crowded = m.myDays.filter((d) => d.benchedWithGame.length > 0);
  return (
    <Card title="Lineup check" aside={<Link href="/games" className="text-sm font-semibold text-accent">See grid →</Link>}>
      {open.length === 0 && crowded.length === 0 ? (
        <p className="text-muted">Every lineup spot is filled the rest of this week. 👍</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {m.myDays.map((d) =>
            d.openSlots > 0 || d.benchedWithGame.length > 0 ? (
              <li key={d.sp} className="flex items-center justify-between gap-2 rounded-xl bg-bg px-3 py-2">
                <span className="font-semibold">
                  {dayShort(d.date)} {monthDay(d.date)}
                </span>
                <span className="text-right">
                  {d.openSlots > 0 && (
                    <span className="text-warn">
                      {d.openSlots} <Term k="openSlot">open {d.openSlots === 1 ? "spot" : "spots"}</Term>
                    </span>
                  )}
                  {d.openSlots > 0 && d.benchedWithGame.length > 0 && " · "}
                  {d.benchedWithGame.length > 0 && (
                    <span className="text-bad">
                      {d.benchedWithGame.length} <Term k="benched">stuck on bench</Term>
                    </span>
                  )}
                </span>
              </li>
            ) : null,
          )}
        </ul>
      )}
    </Card>
  );
}

function PlayoffHeadline({ snap, quiet = false }: { snap: Snapshot; quiet?: boolean }) {
  if (snap.playoffMatchupPeriods.length === 0) return null;
  const view = buildPlayoffView(snap);
  const deadline = snap.tradeDeadline ? monthDay(new Date(snap.tradeDeadline).toLocaleDateString("en-CA", { timeZone: "America/New_York" })) : null;
  return (
    <Card
      title={quiet ? "Looking ahead: playoffs" : "🏆 Playoff mode"}
      aside={<Link href="/playoffs" className="text-sm font-semibold text-accent">Plan →</Link>}
      className={quiet ? "" : "border-accent"}
    >
      {view.flagged.length === 0 ? (
        <p className="text-sm">None of your top players has a <Term k="twoGameWeek">2-game week</Term> in the playoffs.</p>
      ) : (
        <p className="text-sm">
          {view.flagged.length} of your top players {view.flagged.length === 1 ? "has" : "have"} a <Term k="twoGameWeek">2-game week</Term> in the playoffs:{" "}
          {view.flagged.map((r) => `${r.player.name} (${r.pattern})`).join(", ")}.
        </p>
      )}
      {deadline && (
        <p className="mt-1 text-sm text-muted">
          <Term k="tradeDeadline">Trade deadline</Term>: {deadline}.
        </p>
      )}
    </Card>
  );
}
