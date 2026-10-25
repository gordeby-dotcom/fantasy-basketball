import { DEFAULT_POINTS, STAT_LABEL } from "../espn/constants";
import type { Player, ScoringItem, Snapshot, StatLine } from "../types";

export function isPointsLeague(snap: Pick<Snapshot, "scoringType">): boolean {
  return snap.scoringType === "H2H_POINTS";
}

// The league's scoring. In a categories league there are no points, so each category gets the PRD's
// point weight as a stand-in value for ranking players; category matchups still compare raw stats.
export function scoringItems(snap: Pick<Snapshot, "scoring" | "scoringType">): ScoringItem[] {
  if (snap.scoring.length === 0) {
    return Object.entries(DEFAULT_POINTS).map(([statId, points]) => ({ statId: Number(statId), points, isReverse: false }));
  }
  if (isPointsLeague(snap)) return snap.scoring;
  return snap.scoring.map((it) => ({ ...it, points: DEFAULT_POINTS[it.statId] ?? it.points }));
}

// Fantasy points each stat contributes for one stat line.
export function contributions(line: StatLine, items: ScoringItem[]): StatLine {
  const out: StatLine = {};
  for (const it of items) out[it.statId] = (line[it.statId] ?? 0) * it.points;
  return out;
}

export function pointsPerGame(player: Player, items: ScoringItem[]): number {
  let total = 0;
  for (const it of items) total += (player.proj[it.statId] ?? 0) * it.points;
  return total;
}

export interface ProjectionGap {
  bbm: number; // raw BBM season stats, before blending
  espn: number;
  used: number; // the blended number the site actually uses
  games: number; // games behind the BBM number
  diff: number; // BBM minus ESPN, fantasy points per game
}

// Where Basketball Monster and ESPN disagree enough to mention: at least 4 points per game and 12%.
export function projectionGap(player: Player, items: ScoringItem[]): ProjectionGap | null {
  if (player.projSource !== "bbm" || !player.projEspn) return null;
  const bbm = pointsPerGame({ ...player, proj: player.projBbm ?? player.proj }, items);
  const espn = pointsPerGame({ ...player, proj: player.projEspn }, items);
  const diff = bbm - espn;
  if (Math.abs(diff) < 4 || Math.abs(diff) < 0.12 * Math.max(Math.abs(bbm), Math.abs(espn))) return null;
  return { bbm, espn, used: pointsPerGame(player, items), games: player.bbmGames ?? 0, diff };
}

export function statShort(statId: number): string {
  return STAT_LABEL[statId]?.short ?? `#${statId}`;
}

export function statLong(statId: number): string {
  return STAT_LABEL[statId]?.long ?? `Stat ${statId}`;
}
