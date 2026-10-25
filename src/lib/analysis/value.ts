import { STAT } from "../espn/constants";
import { completeStatLine } from "../espn/parse";
import { pointsPerGame, scoringItems, statLong } from "./scoring";
import type { Player, ScoringItem, Snapshot } from "../types";

// How well a player is playing lately, and how much more (or less) he's worth under this league's scoring.

export interface Form {
  recentPpg: number | null; // fantasy points per game over the last 15 days
  seasonPpg: number; // season value before form was mixed in
  recentGames: number;
  trend: "hot" | "cold" | null;
}

export function formOf(p: Player, items: ScoringItem[]): Form {
  const seasonPpg = pointsPerGame({ ...p, proj: p.projSeason ?? p.proj }, items);
  const recentGames = p.recent?.[STAT.GP] ?? 0;
  if (!p.recent || recentGames < 1) return { recentPpg: null, seasonPpg, recentGames: 0, trend: null };
  const recentPpg = pointsPerGame({ ...p, proj: completeStatLine(p.recent, p.projSeason ?? p.proj) }, items);
  const diff = recentPpg - seasonPpg;
  // Need a few games before calling it a streak.
  const trend =
    recentGames >= 3 && Math.abs(diff) >= 4 && Math.abs(diff) >= 0.15 * Math.abs(seasonPpg) ? (diff > 0 ? "hot" : "cold") : null;
  return { recentPpg, seasonPpg, recentGames, trend };
}

// ESPN's standard points-league scoring, which most rankings and most managers go by.
export const STANDARD_POINTS: Record<number, number> = {
  [STAT.PTS]: 1,
  [STAT.TPM]: 1,
  [STAT.FGA]: -1,
  [STAT.FGM]: 2,
  [STAT.FTA]: -1,
  [STAT.FTM]: 1,
  [STAT.REB]: 1,
  [STAT.AST]: 2,
  [STAT.STL]: 4,
  [STAT.BLK]: 4,
  [STAT.TO]: -2,
};

export const STANDARD_ITEMS: ScoringItem[] = Object.entries(STANDARD_POINTS).map(([statId, points]) => ({ statId: Number(statId), points, isReverse: false }));

export interface LeagueEdge {
  leagueRank: number;
  standardRank: number;
  edge: number; // standardRank - leagueRank: positive = worth more in this league than standard rankings say
}

// Rank every player we know about under both scorings. A player ranked much higher here than in standard
// scoring is one other managers may undervalue: a good trade target.
export function leagueEdges(snap: Snapshot): Map<number, LeagueEdge> {
  const items = scoringItems(snap);
  const players = Object.values(snap.players).filter((p) => p.projSource !== "none");
  const rank = (score: (p: Player) => number) =>
    new Map([...players].sort((a, b) => score(b) - score(a)).map((p, i) => [p.id, i + 1]));
  const league = rank((p) => pointsPerGame({ ...p, proj: p.projSeason ?? p.proj }, items));
  const standard = rank((p) => pointsPerGame({ ...p, proj: p.projSeason ?? p.proj }, STANDARD_ITEMS));
  const out = new Map<number, LeagueEdge>();
  for (const p of players) {
    const l = league.get(p.id)!;
    const s = standard.get(p.id)!;
    out.set(p.id, { leagueRank: l, standardRank: s, edge: s - l });
  }
  return out;
}

// Worth calling out: a top-150 player who ranks at least 12 spots higher here.
export function notableEdge(e: LeagueEdge | undefined): boolean {
  return !!e && e.leagueRank <= 150 && Math.abs(e.edge) >= 12;
}

// Standard scoring rewritten in makes and misses, the way this league scores shots:
// FGM 2 / FGA −1 is +1 per make and −1 per miss; FTM 1 / FTA −1 is 0 per make and −1 per miss.
const STANDARD_AS_MADE_MISSED: Record<number, number> = {
  [STAT.PTS]: 1,
  [STAT.TPM]: 1,
  [STAT.TPMI]: 0,
  [STAT.FGM]: 1,
  [STAT.FGMI]: -1,
  [STAT.FTM]: 0,
  [STAT.FTMI]: -1,
  [STAT.REB]: 1,
  [STAT.AST]: 2,
  [STAT.STL]: 4,
  [STAT.BLK]: 4,
  [STAT.TO]: -2,
};

// Plain-language list of how this league's scoring differs from standard scoring.
export function scoringDifferences(snap: Snapshot): { stat: string; league: number; standard: number | null; note: string }[] {
  const out: { stat: string; league: number; standard: number | null; note: string }[] = [];
  for (const it of scoringItems(snap)) {
    if (it.points === 0) continue;
    const std = STANDARD_AS_MADE_MISSED[it.statId];
    if (std === it.points) continue;
    const stat = statLong(it.statId);
    let note: string;
    if (std === undefined) {
      note = it.points > 0 ? "Bonus that standard scoring doesn't have" : "Penalty that standard scoring doesn't have";
    } else {
      note = it.points > std ? "Worth more here" : "Worth less here";
    }
    out.push({ stat, league: it.points, standard: std ?? null, note });
  }
  return out;
}

// Players on other teams (or free) who are worth clearly more under this league's scoring than in standard
// rankings: buy-low trade targets, since their managers likely judge them by the standard numbers.
export function undervaluedTargets(snap: Snapshot, limit = 8): { player: Player; edge: LeagueEdge }[] {
  const edges = leagueEdges(snap);
  return Object.values(snap.players)
    .filter((p) => p.onTeamId !== snap.myTeamId)
    .map((p) => ({ player: p, edge: edges.get(p.id)! }))
    .filter((x) => x.edge && x.edge.leagueRank <= 120 && x.edge.edge >= 8)
    .sort((a, b) => b.edge.edge - a.edge.edge)
    .slice(0, limit);
}
