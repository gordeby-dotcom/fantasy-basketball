import { gamesIn, makeCtx, simulate } from "./lineup";
import { pointsPerGame, scoringItems } from "./scoring";
import { roster, teamName } from "./weekly";
import type { Player, ScoringItem, Snapshot } from "../types";

// Playoff planner (F7, F8), trade evaluator (F9) and the playoff-mode switch (F10).

export function playoffMode(snap: Snapshot, now = Date.now()): boolean {
  if (snap.tradeDeadline && now >= snap.tradeDeadline) return true;
  return snap.regularSeasonMatchupPeriods > 0 && snap.currentMatchupPeriod >= 0.75 * snap.regularSeasonMatchupPeriods;
}

export interface PlayoffRow {
  player: Player;
  teamName: string; // fantasy team, or "Free agent"
  mine: boolean;
  games: number[]; // games in each playoff week
  pattern: string; // e.g. "4-4-3"
  ppg: number;
  playoffPoints: number;
  hasTwoGameWeek: boolean;
}

export interface TradeTarget {
  forPlayerId: number;
  target: PlayoffRow;
  reason: string;
}

export interface PlayoffView {
  weeks: { period: number; start: string; end: string }[];
  rows: PlayoffRow[];
  flagged: PlayoffRow[];
  targets: TradeTarget[];
}

export function buildPlayoffView(snap: Snapshot): PlayoffView {
  const items = scoringItems(snap);
  const ctx = makeCtx(snap, items);
  const periods = snap.playoffMatchupPeriods.slice(0, 3);
  const weeks = periods.map((period) => {
    const sps = snap.matchupPeriods[period] ?? [];
    return { period, start: snap.scoringPeriodDates[sps[0]] ?? "", end: snap.scoringPeriodDates[sps[sps.length - 1]] ?? "" };
  });

  const rows: PlayoffRow[] = Object.values(snap.players).map((p) => {
    const games = periods.map((period) => gamesIn(ctx, p, snap.matchupPeriods[period] ?? []));
    const ppg = pointsPerGame(p, items);
    return {
      player: p,
      teamName: p.onTeamId ? teamName(snap, p.onTeamId) : "Free agent",
      mine: p.onTeamId === snap.myTeamId,
      games,
      pattern: games.join("-"),
      ppg,
      playoffPoints: games.reduce((a, b) => a + b, 0) * ppg,
      hasTwoGameWeek: games.some((g) => g <= 2),
    };
  });
  rows.sort((a, b) => b.playoffPoints - a.playoffPoints);

  // A "key" player is one of Dylan's top eight by points per game.
  const mine = rows.filter((r) => r.mine).sort((a, b) => b.ppg - a.ppg);
  const flagged = mine.slice(0, 8).filter((r) => r.hasTwoGameWeek);
  const targets: TradeTarget[] = [];
  for (const f of flagged) {
    const options = rows
      .filter((r) => r.player.onTeamId !== 0 && !r.mine && !r.hasTwoGameWeek && r.ppg >= f.ppg * 0.85 && r.playoffPoints > f.playoffPoints)
      .slice(0, 3);
    for (const t of options) {
      targets.push({
        forPlayerId: f.player.id,
        target: t,
        reason: `${t.player.name} plays ${t.pattern} in the playoffs vs ${f.pattern} for ${f.player.name}: about +${Math.round(t.playoffPoints - f.playoffPoints)} playoff points.`,
      });
    }
  }
  return { weeks, rows, flagged, targets };
}

// Rest of season ends with the last fantasy playoff week; later NBA games don't count.
export function restOfSeasonSps(snap: Snapshot): number[] {
  const finalPeriod = snap.playoffMatchupPeriods.slice(0, 3).at(-1);
  const lastSp = finalPeriod
    ? Math.max(...(snap.matchupPeriods[finalPeriod] ?? [0]))
    : Math.max(...Object.keys(snap.scoringPeriodDates).map(Number));
  return Array.from({ length: Math.max(0, lastSp - snap.currentScoringPeriod + 1) }, (_, i) => snap.currentScoringPeriod + i);
}

export function playoffSpsOf(snap: Snapshot): number[] {
  return snap.playoffMatchupPeriods.slice(0, 3).flatMap((p) => snap.matchupPeriods[p] ?? []);
}

export function freeAgentsByValue(snap: Snapshot, items: ScoringItem[]): Player[] {
  return Object.values(snap.players)
    .filter((p) => p.onTeamId === 0 && p.injuryStatus !== "OUT")
    .sort((a, b) => pointsPerGame(b, items) - pointsPerGame(a, items));
}

// A team's roster after a trade. Taking on more players means cutting the lowest-value ones;
// sending out more frees spots, which the team fills with the best free agents.
export function swapRoster(
  snap: Snapshot,
  items: ScoringItem[],
  current: Player[],
  outIds: number[],
  incoming: Player[],
  freeAgents: Player[],
): { after: Player[]; dropped: Player[]; pickedUp: Player[] } {
  let after = [...current.filter((p) => !outIds.includes(p.id)), ...incoming];
  const dropped: Player[] = [];
  const pickedUp: Player[] = [];
  const extra = after.length - current.length;
  if (extra > 0) {
    const cut = after
      .filter((p) => !incoming.includes(p) && p.lineupSlotId !== 13)
      .sort((a, b) => pointsPerGame(a, items) - pointsPerGame(b, items))
      .slice(0, extra);
    dropped.push(...cut);
    after = after.filter((p) => !cut.includes(p));
  } else if (extra < 0) {
    const fas = freeAgents.filter((p) => !after.includes(p)).slice(0, -extra);
    pickedUp.push(...fas);
    after.push(...fas);
  }
  return { after, dropped, pickedUp };
}

export interface TradeResult {
  give: Player[];
  get: Player[];
  dropped: Player[]; // Dylan's lowest-value players cut to make roster room
  restOfSeason: { before: number; after: number; net: number };
  playoffs: { before: number; after: number; net: number };
  verdict: "accept" | "decline" | "close";
  reason: string;
}

export function evaluateTrade(snap: Snapshot, giveIds: number[], getIds: number[]): TradeResult {
  const items = scoringItems(snap);
  const ctx = makeCtx(snap, items);
  const give = giveIds.map((id) => snap.players[id]).filter(Boolean);
  const get = getIds.map((id) => snap.players[id]).filter(Boolean);
  const current = roster(snap, snap.myTeamId);

  const { after, dropped, pickedUp } = swapRoster(snap, items, current, giveIds, get, freeAgentsByValue(snap, items));
  const restSps = restOfSeasonSps(snap);
  const playoffSps = playoffSpsOf(snap);

  const ros = { before: simulate(ctx, current, restSps).points, after: simulate(ctx, after, restSps).points, net: 0 };
  ros.net = ros.after - ros.before;
  const po = { before: simulate(ctx, current, playoffSps).points, after: simulate(ctx, after, playoffSps).points, net: 0 };
  po.net = po.after - po.before;

  const inPlayoffMode = playoffMode(snap);
  const key = inPlayoffMode ? po.net : ros.net + po.net; // playoff weeks count double before the deadline
  const scale = Math.max(1, (inPlayoffMode ? po.before : ros.before) * 0.01);
  const verdict = key > scale ? "accept" : key < -scale ? "decline" : "close";

  const names = (ps: Player[]) => ps.map((p) => p.name).join(" + ") || "nothing";
  const sign = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n))}`;
  const lead =
    verdict === "accept" ? "Good trade for you" : verdict === "decline" ? "Not worth it" : "Pretty even";
  const why = `${sign(ros.net)} points the rest of the season and ${sign(po.net)} in the playoff weeks`;
  const dropNote = dropped.length
    ? ` You'd have to drop ${names(dropped)} to make room.`
    : pickedUp.length
      ? ` This counts picking up ${names(pickedUp)} with the open roster spot.`
      : "";
  const reason = `${lead}: ${why} for ${names(get)} in exchange for ${names(give)}.${dropNote}`;
  return { give, get, dropped, restOfSeason: ros, playoffs: po, verdict, reason };
}
