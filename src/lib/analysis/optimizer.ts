import { SLOT } from "../espn/constants";
import { gamesIn, makeCtx, playsOn, simulate } from "./lineup";
import { pointsPerGame, scoringItems } from "./scoring";
import { focusPeriod, roster } from "./weekly";
import type { Player, Snapshot, StatLine } from "../types";

// Bench manager: the best daily lineup for the rest of this week by Basketball Monster's numbers and by ESPN's,
// side by side, plus what to change in today's ESPN lineup.

export type Source = "bbm" | "espn";

// The stat line each source would use for a player. Players a source doesn't cover fall back to the other.
export function lineFor(p: Player, source: Source): { line: StatLine; fallback: boolean } {
  if (source === "bbm") return p.projBbm ? { line: p.projBbm, fallback: false } : { line: p.projEspn ?? p.proj, fallback: true };
  return p.projEspn ? { line: p.projEspn, fallback: false } : p.projSource === "espn" ? { line: p.proj, fallback: false } : { line: p.proj, fallback: true };
}

function withSource(players: Player[], source: Source): Player[] {
  return players.map((p) => ({ ...p, proj: lineFor(p, source).line }));
}

export interface LineupPlan {
  starters: { playerId: number; slot: number }[];
  sits: number[]; // has a game but sits on the bench
  points: number;
}

export interface OptimizerDay {
  sp: number;
  date: string;
  isToday: boolean;
  bbm: LineupPlan;
  espn: LineupPlan;
  onlyBbm: number[]; // BBM starts him, ESPN sits him
  onlyEspn: number[];
}

export interface RosterRow {
  player: Player;
  bbmPpg: number;
  espnPpg: number;
  bbmRank: number;
  espnRank: number;
  bbmFallback: boolean; // BBM doesn't list him; using ESPN
  bbmGames: number; // games behind the BBM number
  gamesThisWeek: number;
}

export interface TodayCheck {
  date: string;
  moves: { start: number; sit: number | null }[]; // by BBM: put "start" in, take "sit" out
  sitsWithGame: number[]; // current bench players with a game today
}

export interface OptimizerView {
  period: number;
  days: OptimizerDay[];
  totals: { bbm: number; espn: number; bbmScoredByEspn: number; espnScoredByBbm: number };
  roster: RosterRow[];
  today: TodayCheck | null;
}

function plan(ctx: ReturnType<typeof makeCtx>, players: Player[], sp: number): LineupPlan {
  const day = simulate(ctx, players, [sp]);
  return { starters: day.days[0].starters, sits: day.days[0].benchedWithGame, points: day.points };
}

// Points a given set of starters would score if the other source is right.
function scoreStarters(ctx: ReturnType<typeof makeCtx>, players: Player[], starterIds: number[]): number {
  const byId = new Map(players.map((p) => [p.id, p]));
  return starterIds.reduce((n, id) => n + pointsPerGame(byId.get(id)!, ctx.items), 0);
}

// period: a future matchup period to plan; defaults to this week's remaining days.
export function optimizeBench(snap: Snapshot, futurePeriod?: number): OptimizerView {
  const items = scoringItems(snap);
  const ctx = makeCtx(snap, items);
  const focus = focusPeriod(snap);
  const period = futurePeriod && snap.matchupPeriods[futurePeriod] ? futurePeriod : focus.period;
  const sps = period === focus.period ? focus.sps : (snap.matchupPeriods[period] ?? []).filter((sp) => sp >= snap.currentScoringPeriod);
  const mine = roster(snap, snap.myTeamId);
  const bbmPlayers = withSource(mine, "bbm");
  const espnPlayers = withSource(mine, "espn");

  const days: OptimizerDay[] = sps.map((sp) => {
    const bbm = plan(ctx, bbmPlayers, sp);
    const espn = plan(ctx, espnPlayers, sp);
    const bStart = new Set(bbm.starters.map((s) => s.playerId));
    const eStart = new Set(espn.starters.map((s) => s.playerId));
    return {
      sp,
      date: snap.scoringPeriodDates[sp] ?? "",
      isToday: sp === snap.currentScoringPeriod,
      bbm,
      espn,
      onlyBbm: [...bStart].filter((id) => !eStart.has(id)),
      onlyEspn: [...eStart].filter((id) => !bStart.has(id)),
    };
  });

  const totals = days.reduce(
    (t, d) => ({
      bbm: t.bbm + d.bbm.points,
      espn: t.espn + d.espn.points,
      bbmScoredByEspn: t.bbmScoredByEspn + scoreStarters(ctx, espnPlayers, d.bbm.starters.map((s) => s.playerId)),
      espnScoredByBbm: t.espnScoredByBbm + scoreStarters(ctx, bbmPlayers, d.espn.starters.map((s) => s.playerId)),
    }),
    { bbm: 0, espn: 0, bbmScoredByEspn: 0, espnScoredByBbm: 0 },
  );

  const ppgBy = (ps: Player[]) => new Map(ps.map((p) => [p.id, pointsPerGame(p, items)]));
  const bbmPpg = ppgBy(bbmPlayers);
  const espnPpg = ppgBy(espnPlayers);
  const rankBy = (m: Map<number, number>) => new Map([...m].sort((a, b) => b[1] - a[1]).map(([id], i) => [id, i + 1]));
  const bbmRank = rankBy(bbmPpg);
  const espnRank = rankBy(espnPpg);
  const rosterRows: RosterRow[] = mine
    .map((p) => ({
      player: p,
      bbmPpg: bbmPpg.get(p.id) ?? 0,
      espnPpg: espnPpg.get(p.id) ?? 0,
      bbmRank: bbmRank.get(p.id) ?? 0,
      espnRank: espnRank.get(p.id) ?? 0,
      bbmFallback: lineFor(p, "bbm").fallback,
      bbmGames: p.bbmGames ?? 0,
      gamesThisWeek: gamesIn(ctx, p, sps),
    }))
    .sort((a, b) => a.bbmRank - b.bbmRank);

  // Today's ESPN lineup (as of the last sync) vs the best lineup by BBM.
  let today: TodayCheck | null = null;
  const todayDay = days.find((d) => d.isToday);
  if (todayDay) {
    const playing = mine.filter((p) => playsOn(ctx, p, todayDay.sp) && p.lineupSlotId !== SLOT.IR);
    const current = new Set(playing.filter((p) => p.lineupSlotId !== SLOT.BE).map((p) => p.id));
    const best = new Set(todayDay.bbm.starters.map((s) => s.playerId));
    const toStart = [...best].filter((id) => !current.has(id)).sort((a, b) => (bbmPpg.get(b) ?? 0) - (bbmPpg.get(a) ?? 0));
    const toSit = [...current].filter((id) => !best.has(id)).sort((a, b) => (bbmPpg.get(a) ?? 0) - (bbmPpg.get(b) ?? 0));
    today = {
      date: todayDay.date,
      moves: toStart.map((start, i) => ({ start, sit: toSit[i] ?? null })),
      sitsWithGame: playing.filter((p) => p.lineupSlotId === SLOT.BE).map((p) => p.id),
    };
  }

  return { period, days, totals, roster: rosterRows, today };
}
