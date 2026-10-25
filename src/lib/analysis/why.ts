import { STARTING_SLOTS, STAT } from "../espn/constants";
import { analyzeMatchup, teamName } from "./weekly";
import { pointsPerGame, scoringItems, statLong } from "./scoring";
import type { PlayerDay, SideDay, Snapshot } from "../types";

// Why Dylan is winning or losing this week, from ESPN's box scores so far plus the projection for the days left.

export interface Reason {
  title: string;
  detail: string;
  impact: number; // points, from Dylan's side: + helped him, − hurt him
}

export interface SideTotals {
  points: number;
  startedGames: number;
  perGame: number;
  benchGames: number;
  benchPoints: number;
  emptySlots: number; // starting spots nobody filled, summed over days
  lineupMisses: number; // days a benched player had a game while a spot sat empty
}

export interface PlayerWeek {
  playerId: number;
  name: string;
  games: number;
  points: number;
  perGame: number;
  projected?: number; // projected points per game, for Dylan's players
}

export interface WhyView {
  period: number;
  opponentName: string;
  daysPlayed: number;
  daysLeft: number;
  margin: number; // actual so far, Dylan minus opponent
  projectedMargin: number;
  projectedMine: number;
  projectedTheirs: number;
  headline: string;
  summary: string;
  split: { games: number; perGame: number } | null; // the margin, split exactly into these two parts
  mine: SideTotals;
  theirs: SideTotals;
  reasons: Reason[];
  stats: { statId: number; name: string; mine: number; theirs: number; diff: number }[];
  myStars: PlayerWeek[];
  theirStars: PlayerWeek[];
  surprises: PlayerWeek[]; // Dylan's players furthest above or below projection
  days: { date: string; mine: number; theirs: number }[];
  gamesLeft: { mine: number; theirs: number };
  hasActuals: boolean;
}

function totals(days: SideDay[], slotsPerDay: number): SideTotals {
  let points = 0;
  let startedGames = 0;
  let benchGames = 0;
  let benchPoints = 0;
  let emptySlots = 0;
  let lineupMisses = 0;
  for (const d of days) {
    points += d.points;
    const started = d.players.filter((p) => p.started).reduce((n, p) => n + p.games, 0);
    const benched = d.players.filter((p) => !p.started);
    startedGames += started;
    benchGames += benched.reduce((n, p) => n + p.games, 0);
    benchPoints += benched.reduce((n, p) => n + p.points, 0);
    const empty = Math.max(0, slotsPerDay - started);
    emptySlots += empty;
    if (empty > 0 && benched.length > 0) lineupMisses++;
  }
  return { points, startedGames, perGame: startedGames ? points / startedGames : 0, benchGames, benchPoints, emptySlots, lineupMisses };
}

function byPlayer(days: SideDay[], startedOnly: boolean): PlayerWeek[] {
  const map = new Map<number, PlayerWeek>();
  for (const d of days) {
    for (const p of d.players) {
      if (startedOnly && !p.started) continue;
      const w = map.get(p.playerId) ?? { playerId: p.playerId, name: p.name, games: 0, points: 0, perGame: 0 };
      w.games += p.games;
      w.points += p.points;
      map.set(p.playerId, w);
    }
  }
  return [...map.values()].map((w) => ({ ...w, perGame: w.games ? w.points / w.games : 0 })).sort((a, b) => b.points - a.points);
}

function statTotals(days: SideDay[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const d of days) for (const p of d.players as PlayerDay[]) if (p.started) for (const [k, v] of Object.entries(p.statPoints)) out[Number(k)] = (out[Number(k)] ?? 0) + v;
  return out;
}

const r = (n: number) => Math.round(n);
const plural = (n: number, word: string) => `${r(n)} ${word}${r(n) === 1 ? "" : "s"}`;

export function analyzeWhy(snap: Snapshot): WhyView {
  const items = scoringItems(snap);
  const proj = analyzeMatchup(snap);
  const actuals = snap.actuals?.matchupPeriodId === snap.currentMatchupPeriod ? snap.actuals : undefined;
  const days = actuals?.days ?? [];
  const slotsPerDay = STARTING_SLOTS.reduce((n, s) => n + (snap.lineupSlotCounts[s] ?? 0), 0);
  const mine = totals(days.map((d) => d.mine), slotsPerDay);
  const theirs = totals(days.map((d) => d.theirs), slotsPerDay);
  const oppId = actuals?.opponentId || proj.opponentId || 0;
  const opponentName = oppId ? teamName(snap, oppId) : proj.opponentName;
  const margin = mine.points - theirs.points;

  // Exact split of the margin: (games gap × average per game) + (per-game gap × average games).
  const split =
    mine.startedGames + theirs.startedGames > 0
      ? {
          games: (mine.startedGames - theirs.startedGames) * ((mine.perGame + theirs.perGame) / 2),
          perGame: (mine.perGame - theirs.perGame) * ((mine.startedGames + theirs.startedGames) / 2),
        }
      : null;

  // Projection for the rest of the week (only meaningful while this week is in progress).
  const restMine = proj.period === snap.currentMatchupPeriod ? proj.mine.projectedAdd : 0;
  const restTheirs = proj.period === snap.currentMatchupPeriod ? proj.theirs.projectedAdd : 0;
  const gamesLeft =
    proj.period === snap.currentMatchupPeriod
      ? { mine: proj.mine.startedGamesLeft, theirs: proj.theirs.startedGamesLeft }
      : { mine: 0, theirs: 0 };
  const projectedMine = mine.points + restMine;
  const projectedTheirs = theirs.points + restTheirs;

  const reasons: Reason[] = [];
  if (split) {
    const gGap = mine.startedGames - theirs.startedGames;
    reasons.push({
      title: gGap === 0 ? "Same number of games" : gGap > 0 ? `You played ${plural(gGap, "more game")}` : `They played ${plural(-gGap, "more game")}`,
      detail:
        `Your lineup has used ${plural(mine.startedGames, "game")}, theirs ${plural(theirs.startedGames, "game")}. Each game is worth about ${r((mine.perGame + theirs.perGame) / 2)} points.` +
        (mine.emptySlots > 0 ? ` You left ${plural(mine.emptySlots, "lineup spot")} empty (they left ${theirs.emptySlots}).` : ""),
      impact: split.games,
    });
    reasons.push({
      title: mine.perGame >= theirs.perGame ? "Your players scored more per game" : "Their players scored more per game",
      detail: `Your starters averaged ${r(mine.perGame)} points a game, theirs ${r(theirs.perGame)}.`,
      impact: split.perGame,
    });
  }
  if (mine.benchPoints > 0) {
    reasons.push({
      title: `${r(mine.benchPoints)} points stuck on your bench`,
      detail:
        mine.lineupMisses > 0
          ? `On ${plural(mine.lineupMisses, "day")} a benched player had a game while a lineup spot sat empty. Check your lineup every day.`
          : `${plural(mine.benchGames, "game")} were played by your bench players. Those points don't count.`,
      impact: -mine.benchPoints,
    });
  }
  if (theirs.benchPoints > 0 && theirs.lineupMisses > 0) {
    reasons.push({
      title: `They left ${r(theirs.benchPoints)} points on their bench`,
      detail: "Their lineup mistakes kept the score closer.",
      impact: theirs.benchPoints,
    });
  }

  // Stats that swung the score the most (actual fantasy points from starters).
  const ms = statTotals(days.map((d) => d.mine));
  const ts = statTotals(days.map((d) => d.theirs));
  const stats = items
    .filter((it) => it.points !== 0)
    .map((it) => ({ statId: it.statId, name: it.statId === STAT.PTS ? "Scoring (PTS)" : statLong(it.statId), mine: ms[it.statId] ?? 0, theirs: ts[it.statId] ?? 0, diff: (ms[it.statId] ?? 0) - (ts[it.statId] ?? 0) }))
    .filter((s) => Math.abs(s.mine) + Math.abs(s.theirs) > 0)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  // The stat that helped Dylan most and the one that hurt most.
  const best = stats.filter((s) => s.diff >= 10).sort((a, b) => b.diff - a.diff)[0];
  const worst = stats.filter((s) => s.diff <= -10).sort((a, b) => a.diff - b.diff)[0];
  for (const s of [best, worst]) {
    if (!s) continue;
    reasons.push({
      title: `${s.name}: ${s.diff > 0 ? "your edge" : "their edge"}`,
      detail:
        s.mine < 0 && s.theirs <= 0
          ? `${s.name} cost you ${r(-s.mine)} points and them ${r(-s.theirs)}.`
          : `${s.name} earned you ${r(s.mine)} points and them ${r(s.theirs)}.`,
      impact: s.diff,
    });
  }

  const myStars = byPlayer(days.map((d) => d.mine), true).slice(0, 3);
  const theirStars = byPlayer(days.map((d) => d.theirs), true).slice(0, 3);
  if (theirStars[0] && myStars[0] && theirStars[0].points > myStars[0].points * 1.3) {
    reasons.push({
      title: `${theirStars[0].name} went off`,
      detail: `${r(theirStars[0].points)} points in ${plural(theirStars[0].games, "game")}, more than anyone on your team.`,
      impact: -(theirStars[0].points - myStars[0].points),
    });
  }

  // Dylan's players vs what we projected, so he sees who over- or under-delivered.
  const surprises = byPlayer(days.map((d) => d.mine), false)
    .map((w) => {
      const p = snap.players[w.playerId];
      return { ...w, projected: p ? pointsPerGame(p, items) : undefined };
    })
    .filter((w) => w.projected !== undefined && w.games > 0 && Math.abs(w.perGame - (w.projected ?? 0)) >= 8)
    .sort((a, b) => Math.abs(b.perGame - (b.projected ?? 0)) * b.games - Math.abs(a.perGame - (a.projected ?? 0)) * a.games)
    .slice(0, 4);

  if (gamesLeft.mine + gamesLeft.theirs > 0) {
    const gap = gamesLeft.mine - gamesLeft.theirs;
    reasons.push({
      title: gap === 0 ? "Even on games left" : gap > 0 ? `You have ${plural(gap, "more game")} left` : `They have ${plural(-gap, "more game")} left`,
      detail: `Rest of the week: ${plural(gamesLeft.mine, "game")} for you, ${plural(gamesLeft.theirs, "game")} for them. Projected to add ${r(restMine)} vs ${r(restTheirs)}.`,
      impact: restMine - restTheirs,
    });
  }

  reasons.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  const status = Math.abs(margin) < 0.5 ? "tied" : margin > 0 ? "winning" : "losing";
  const headline =
    days.length === 0
      ? `Week ${snap.currentMatchupPeriod} vs ${opponentName} hasn't started`
      : status === "tied"
        ? "You're tied"
        : `You're ${status} by ${r(Math.abs(margin))}`;

  let summary: string;
  if (!split) {
    summary = `No games yet. You're projected to ${projectedMine >= projectedTheirs ? "win" : "lose"} ${r(projectedMine)}–${r(projectedTheirs)}.`;
  } else {
    const main = Math.abs(split.games) >= Math.abs(split.perGame) ? "games" : "perGame";
    const helpsLeader = Math.sign(split[main]) === Math.sign(margin) || margin === 0;
    const why =
      main === "games"
        ? `${split.games >= 0 ? "you" : "they"} got more games into the lineup`
        : `${split.perGame >= 0 ? "your" : "their"} players scored more per game`;
    summary = helpsLeader
      ? `Mostly because ${why}.`
      : `${why[0].toUpperCase()}${why.slice(1)}, but the other part matters more.`;
    if (gamesLeft.mine + gamesLeft.theirs > 0) {
      summary += ` Projected final: ${r(projectedMine)}–${r(projectedTheirs)}.`;
    }
  }

  return {
    period: snap.currentMatchupPeriod,
    opponentName,
    daysPlayed: days.length,
    daysLeft: proj.period === snap.currentMatchupPeriod ? proj.daysLeft : 0,
    margin,
    projectedMargin: projectedMine - projectedTheirs,
    projectedMine,
    projectedTheirs,
    headline,
    summary,
    split,
    mine,
    theirs,
    reasons,
    stats: stats.slice(0, 6),
    myStars,
    theirStars,
    surprises,
    days: days.map((d) => ({ date: d.date, mine: d.mine.points, theirs: d.theirs.points })),
    gamesLeft,
    hasActuals: days.length > 0,
  };
}
