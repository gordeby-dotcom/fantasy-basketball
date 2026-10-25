import { STAT } from "../espn/constants";
import { firstAvailableSp, gamesIn, isAvailable, makeCtx, playsOn, simulate, type Ctx, type DayPlan } from "./lineup";
import { isPointsLeague, pointsPerGame, projectionGap, scoringItems, statLong, statShort, type ProjectionGap } from "./scoring";
import { formOf } from "./value";
import type { Player, ScoringItem, Snapshot } from "../types";

export function roster(snap: Snapshot, teamId: number): Player[] {
  const team = snap.teams.find((t) => t.id === teamId);
  return (team?.rosterIds ?? []).map((id) => snap.players[id]).filter(Boolean);
}

export function teamName(snap: Snapshot, teamId: number): string {
  return snap.teams.find((t) => t.id === teamId)?.name ?? "Opponent";
}

export function opponentId(snap: Snapshot, matchupPeriod: number): number | null {
  const m = snap.matchups.find(
    (x) => x.matchupPeriodId === matchupPeriod && (x.homeTeamId === snap.myTeamId || x.awayTeamId === snap.myTeamId),
  );
  if (!m) return null;
  return m.homeTeamId === snap.myTeamId ? m.awayTeamId : m.homeTeamId;
}

// The week Dylan should plan for: the current matchup, or next week's once today is its last day.
export function focusPeriod(snap: Snapshot): { period: number; sps: number[]; inProgress: boolean } {
  const cur = snap.currentMatchupPeriod;
  const days = snap.matchupPeriods[cur] ?? [];
  const left = days.filter((sp) => sp >= snap.currentScoringPeriod);
  if (left.length > 1 || !snap.matchupPeriods[cur + 1]) {
    return { period: cur, sps: left, inProgress: left.length < days.length };
  }
  return { period: cur + 1, sps: snap.matchupPeriods[cur + 1], inProgress: false };
}

export type StatLabel = "winning" | "close" | "concede";

export interface StatRow {
  statId: number;
  short: string;
  long: string;
  mine: number;
  theirs: number;
  label: StatLabel;
  weight: number; // points per stat (points league)
}

export interface MatchupView {
  period: number;
  inProgress: boolean;
  opponentId: number | null;
  opponentName: string;
  mine: { current: number; projectedAdd: number; gamesLeft: number; startedGamesLeft: number };
  theirs: { current: number; projectedAdd: number; gamesLeft: number; startedGamesLeft: number };
  stats: StatRow[];
  pointsLeague: boolean;
  categoriesWon?: { mine: number; theirs: number; tied: number };
  myDays: DayPlan[];
  daysLeft: number;
}

function label(diff: number, scale: number, closeShare: number, minClose: number): StatLabel {
  const close = Math.max(minClose, scale * closeShare);
  if (diff > close) return "winning";
  if (diff < -2 * close) return "concede";
  return "close";
}

const PERCENT_STATS: Record<number, [number, number]> = { 19: [STAT.FGM, STAT.FGA], 20: [STAT.FTM, STAT.FTA], 21: [STAT.TPM, STAT.TPA] };

export function analyzeMatchup(snap: Snapshot): MatchupView {
  const items = scoringItems(snap);
  const ctx = makeCtx(snap, items);
  const { period, sps, inProgress } = focusPeriod(snap);
  const oppId = opponentId(snap, period);
  const me = simulate(ctx, roster(snap, snap.myTeamId), sps);
  const them = oppId ? simulate(ctx, roster(snap, oppId), sps) : simulate(ctx, [], sps);
  const m = snap.matchups.find((x) => x.matchupPeriodId === period && (x.homeTeamId === snap.myTeamId || x.awayTeamId === snap.myTeamId));
  const myCurrent = inProgress && m ? (m.homeTeamId === snap.myTeamId ? m.homePoints : m.awayPoints) : 0;
  const theirCurrent = inProgress && m ? (m.homeTeamId === snap.myTeamId ? m.awayPoints : m.homePoints) : 0;
  const points = isPointsLeague(snap);

  const stats: StatRow[] = [];
  let won = 0;
  let lost = 0;
  let tied = 0;
  for (const it of items) {
    if (points && it.points === 0) continue;
    let mine: number;
    let theirs: number;
    let l: StatLabel;
    if (points) {
      mine = me.byStat[it.statId] ?? 0;
      theirs = them.byStat[it.statId] ?? 0;
      // Label by points per started game so the label reflects roster makeup (e.g. big men lose turnovers);
      // the games-left gap is shown separately and would otherwise make every stat look lost or won.
      const myRate = mine / Math.max(1, me.startedGames);
      const theirRate = theirs / Math.max(1, them.startedGames);
      l = label(myRate - theirRate, Math.max(Math.abs(myRate), Math.abs(theirRate)), 0.12, 0.3);
    } else if (PERCENT_STATS[it.statId]) {
      const [made, att] = PERCENT_STATS[it.statId];
      mine = (me.rawByStat[made + 1000] ?? 0) / Math.max(1, me.rawByStat[att + 1000] ?? 0);
      theirs = (them.rawByStat[made + 1000] ?? 0) / Math.max(1, them.rawByStat[att + 1000] ?? 0);
      l = label((mine - theirs) * (it.isReverse ? -1 : 1), 1, 0.01, 0.005);
    } else {
      mine = me.rawByStat[it.statId] ?? 0;
      theirs = them.rawByStat[it.statId] ?? 0;
      l = label((mine - theirs) * (it.isReverse ? -1 : 1), Math.max(mine, theirs), 0.08, 1);
    }
    if (!points) {
      const d = (mine - theirs) * (it.isReverse ? -1 : 1);
      if (Math.abs(d) < 1e-9) tied++;
      else if (d > 0) won++;
      else lost++;
    }
    stats.push({ statId: it.statId, short: statShort(it.statId), long: statLong(it.statId), mine, theirs, label: l, weight: it.points });
  }
  if (points) stats.sort((a, b) => Math.abs(b.mine) + Math.abs(b.theirs) - (Math.abs(a.mine) + Math.abs(a.theirs)));

  return {
    period,
    inProgress,
    opponentId: oppId,
    opponentName: oppId ? teamName(snap, oppId) : "No opponent found",
    mine: { current: myCurrent, projectedAdd: me.points, gamesLeft: me.totalGames, startedGamesLeft: me.startedGames },
    theirs: { current: theirCurrent, projectedAdd: them.points, gamesLeft: them.totalGames, startedGamesLeft: them.startedGames },
    stats,
    pointsLeague: points,
    categoriesWon: points ? undefined : { mine: won, theirs: lost, tied },
    myDays: me.days,
    daysLeft: sps.length,
  };
}

/* ---------- Games-played grid (F2, F3) ---------- */

export interface GridRow {
  player: Player;
  mine: boolean;
  days: boolean[]; // has a game on each day
  games: number;
  ppg: number;
  weekPoints: number;
  gap: ProjectionGap | null;
}

export interface GridView {
  period: number;
  days: { sp: number; date: string; past: boolean }[];
  rows: GridRow[];
  lineup: DayPlan[]; // Dylan's lineup per day, for open-slot and too-many-players flags
  slotsPerDay: number;
}

export function buildGrid(snap: Snapshot, period: number, freeAgentCount = 25): GridView {
  const items = scoringItems(snap);
  const ctx = makeCtx(snap, items);
  const sps = snap.matchupPeriods[period] ?? [];
  const upcoming = sps.filter((sp) => sp >= snap.currentScoringPeriod);
  const row = (p: Player, mine: boolean): GridRow => {
    const ppg = pointsPerGame(p, items);
    const games = gamesIn(ctx, p, upcoming);
    return { player: p, mine, days: sps.map((sp) => playsOn(ctx, p, sp)), games, ppg, weekPoints: games * ppg, gap: projectionGap(p, items) };
  };
  const mine = roster(snap, snap.myTeamId).map((p) => row(p, true));
  const fas = Object.values(snap.players)
    .filter((p) => p.onTeamId === 0 && p.injuryStatus !== "OUT")
    .map((p) => row(p, false))
    .sort((a, b) => b.weekPoints - a.weekPoints)
    .slice(0, freeAgentCount);
  const slotsPerDay = Object.entries(snap.lineupSlotCounts)
    .filter(([slot]) => Number(slot) < 12)
    .reduce((n, [, c]) => n + c, 0);
  return {
    period,
    days: sps.map((sp) => ({ sp, date: snap.scoringPeriodDates[sp] ?? "", past: sp < snap.currentScoringPeriod })),
    rows: [...mine, ...fas],
    lineup: simulate(ctx, roster(snap, snap.myTeamId), upcoming).days,
    slotsPerDay,
  };
}

/* ---------- Add/drop suggestions (F6) ---------- */

export interface Suggestion {
  add: Player;
  drop: Player;
  gain: number;
  addGames: number;
  dropGames: number;
  addPpg: number;
  dropPpg: number;
  reason: string;
  waiverNote?: string;
  addGap: ProjectionGap | null;
  dropGap: ProjectionGap | null;
}

function fmt(n: number): string {
  return Math.round(n).toString();
}

// "week": streaming for games left this week (playoff mode). "season": better players for the rest of the
// season, counting recent form, regardless of who plays most this week (regular season).
export type MoveMode = "week" | "season";

export function suggestMoves(snap: Snapshot, closeStats: number[] = [], count = 3, mode: MoveMode = "week", seasonSps: number[] = []): Suggestion[] {
  const items = scoringItems(snap);
  const ctx: Ctx = makeCtx(snap, items);
  const sps = mode === "season" && seasonSps.length ? seasonSps : focusPeriod(snap).sps;
  const mine = roster(snap, snap.myTeamId);
  const baseline = simulate(ctx, mine, sps);
  const ppg = (p: Player) => pointsPerGame(p, items);
  const usable = (p: Player) => sps.filter((sp) => playsOn(ctx, p, sp) && sp >= firstAvailableSp(p, snap.scoringPeriodDates)).length;

  // Only the weakest few players are drop options, so a good week of streaming never costs a keeper.
  const drops = mine.filter((p) => p.lineupSlotId !== 13).sort((a, b) => ppg(a) - ppg(b)).slice(0, 4);
  const adds = Object.values(snap.players)
    .filter((p) => p.onTeamId === 0 && isAvailable(p))
    .map((p) => ({ p, quick: usable(p) * ppg(p) }))
    .sort((a, b) => b.quick - a.quick)
    .slice(0, 40)
    .map((x) => x.p);

  // Every add/drop pair; the picks below use each player at most once so all three moves can be made together.
  const options: Suggestion[] = [];
  for (const add of adds) {
    for (const drop of drops) {
      const sim = simulate(ctx, [...mine.filter((p) => p.id !== drop.id), add], sps);
      const gain = sim.points - baseline.points;
      if (gain < (mode === "season" ? 40 : 3)) continue;
      options.push({
        add,
        drop,
        gain,
        addGames: usable(add),
        dropGames: gamesIn(ctx, drop, sps),
        addPpg: ppg(add),
        dropPpg: ppg(drop),
        reason: "",
        addGap: projectionGap(add, items),
        dropGap: projectionGap(drop, items),
        waiverNote:
          add.status === "WAIVERS"
            ? `On waivers: can't play for you until ${new Date(add.waiverUntil ?? 0).toLocaleDateString("en-US", { weekday: "long", timeZone: "America/New_York" })}.`
            : undefined,
      });
    }
  }

  options.sort((a, b) => b.gain - a.gain);
  const picked: Suggestion[] = [];
  const usedDrops = new Set<number>();
  const usedAdds = new Set<number>();
  for (const o of options) {
    if (usedDrops.has(o.drop.id) || usedAdds.has(o.add.id)) continue;
    usedDrops.add(o.drop.id);
    usedAdds.add(o.add.id);
    o.reason = mode === "season" ? seasonReason(o, items) : reasonFor(o, items, closeStats);
    picked.push(o);
    if (picked.length === count) break;
  }
  return picked;
}

function seasonReason(o: Suggestion, items: ScoringItem[]): string {
  const addForm = formOf(o.add, items);
  const dropForm = formOf(o.drop, items);
  const hot = addForm.trend === "hot" && addForm.recentPpg !== null ? ` and is hot (${fmt(addForm.recentPpg)} a game lately)` : "";
  const cold = dropForm.trend === "cold" && dropForm.recentPpg !== null ? `; ${o.drop.name} has cooled off (${fmt(dropForm.recentPpg)} lately)` : "";
  const perGame =
    o.addPpg > o.dropPpg + 1
      ? `Scores ${fmt(o.addPpg)} a game vs ${fmt(o.dropPpg)}`
      : `About the same per game (${fmt(o.addPpg)} vs ${fmt(o.dropPpg)}), but more of his games land on days you have open lineup spots`;
  return `${perGame}${hot}${cold}: about +${fmt(o.gain)} points the rest of the season.`;
}

function reasonFor(o: Suggestion, items: ReturnType<typeof scoringItems>, closeStats: number[]): string {
  const g = (n: number) => `${n} ${n === 1 ? "game" : "games"}`;
  const games = o.addGames > o.dropGames ? `${g(o.addGames)} this week vs ${o.dropGames}` : `${g(o.addGames)} this week`;
  const perGame = o.addPpg > o.dropPpg + 2 ? ` and scores more per game (${fmt(o.addPpg)} vs ${fmt(o.dropPpg)})` : "";
  let helps = "";
  if (closeStats.length) {
    // Only stats that earn points; "more missed shots" is never the selling point.
    const best = closeStats
      .filter((id) => (items.find((x) => x.statId === id)?.points ?? 0) > 0)
      .map((id) => {
        const it = items.find((x) => x.statId === id);
        const delta = ((o.add.proj[id] ?? 0) * o.addGames - (o.drop.proj[id] ?? 0) * o.dropGames) * (it?.points || 1);
        return { id, delta };
      })
      .sort((a, b) => b.delta - a.delta)[0];
    if (best && best.delta > 2) helps = `; helps most in ${statLong(best.id).toLowerCase()}, which is close`;
  }
  return `${games}${perGame}: about +${fmt(o.gain)} projected points${helps}.`;
}
