import { SLOT } from "../espn/constants";
import { firstAvailableSp, makeCtx, playsOn, simulate } from "./lineup";
import { isOut, roleAdjustments, scaled } from "./opportunity";
import { playoffMode, restOfSeasonSps } from "./playoffs";
import { nextDays, nights, type Night } from "./schedule";
import { pointsPerGame, scoringItems } from "./scoring";
import { formOf } from "./value";
import { roster } from "./weekly";
import type { Player, Snapshot } from "../types";

// Waiver priority: which free agents to claim first. Each is valued by what he'd add to Dylan's real lineup over
// the next 7 days, in his current role (bigger if a teammate is hurt or his minutes are rising); quiet nights
// (open lineup spots) make his games count and busy nights (full lineup) can bench him. In the regular season,
// his rest-of-season gain at his normal value (injured teammates come back), spread per week, is added in.

const CANDIDATES = 30;
const DROP_OPTIONS = 4;
// Rough pre-sort only: weight a game by how quiet the night is. The full simulation decides.
const NIGHT_WEIGHT = { light: 1.25, normal: 1, heavy: 0.75 } as const;

export interface WaiverPick {
  add: Player; // as valued in his current role
  drop: Player;
  priority: number;
  next7Gain: number;
  restOfSeasonGain: number; // 0 in playoff mode
  games: number; // games in the next 7 days
  usableGames: number; // games on nights Dylan has an open lineup spot
  quietGames: number;
  busyGames: number;
  roleBoost: number; // points per game added by a bigger role
  ppg: number;
  reason: string;
}

export interface WaiverView {
  nights: Night[];
  openSpotsByNight: Record<number, number>; // before any pickup
  picks: WaiverPick[];
}

export function waiverPriority(snap: Snapshot, limit = 12): WaiverView {
  const items = scoringItems(snap);
  const ctx = makeCtx(snap, items);
  const next7 = nextDays(snap, 7);
  const schedule = nights(snap, next7);
  const volumeBySp = new Map(schedule.map((n) => [n.sp, n.volume]));
  const factors = roleAdjustments(snap);
  const adj = (p: Player) => scaled(p, factors.get(p.id) ?? 1);
  const inPlayoffs = playoffMode(snap);
  const restSps = inPlayoffs ? [] : restOfSeasonSps(snap);
  const weeksLeft = Math.max(1, restSps.length / 7);

  const mineNormal = roster(snap, snap.myTeamId);
  const mine = mineNormal.map(adj);
  const base7 = simulate(ctx, mine, next7);
  const baseRest = restSps.length ? simulate(ctx, mineNormal, restSps).points : 0;
  const openSpotsByNight = Object.fromEntries(base7.days.map((d) => [d.sp, d.openSlots]));

  const ppg = (p: Player) => pointsPerGame(p, items);
  const drops = mine.filter((p) => p.lineupSlotId !== SLOT.IR).sort((a, b) => ppg(a) - ppg(b)).slice(0, DROP_OPTIONS);
  const canPlay = (p: Player, sp: number) => playsOn(ctx, p, sp) && sp >= firstAvailableSp(p, snap.scoringPeriodDates);
  const candidates = Object.values(snap.players)
    .filter((p) => p.onTeamId === 0 && !isOut(p) && p.projSource !== "none")
    .map(adj)
    .map((p) => ({ p, quick: ppg(p) * next7.filter((sp) => canPlay(p, sp)).reduce((n, sp) => n + NIGHT_WEIGHT[volumeBySp.get(sp) ?? "normal"], 0) }))
    .sort((a, b) => b.quick - a.quick)
    .slice(0, CANDIDATES)
    .map((x) => x.p);

  const picks: WaiverPick[] = [];
  for (const add of candidates) {
    let best: { drop: Player; next7Gain: number; restOfSeasonGain: number; priority: number } | null = null;
    for (const drop of drops) {
      const after = [...mine.filter((p) => p.id !== drop.id), add];
      const next7Gain = simulate(ctx, after, next7).points - base7.points;
      const afterNormal = [...mineNormal.filter((p) => p.id !== drop.id), snap.players[add.id]];
      const restOfSeasonGain = restSps.length ? simulate(ctx, afterNormal, restSps).points - baseRest : 0;
      const priority = next7Gain + restOfSeasonGain / weeksLeft;
      if (!best || priority > best.priority) best = { drop, next7Gain, restOfSeasonGain, priority };
    }
    if (!best || best.priority <= 1) continue;
    const gameDays = next7.filter((sp) => canPlay(add, sp));
    const original = snap.players[add.id];
    const pick: WaiverPick = {
      add,
      ...best,
      games: gameDays.length,
      usableGames: gameDays.filter((sp) => (openSpotsByNight[sp] ?? 0) > 0).length,
      quietGames: gameDays.filter((sp) => volumeBySp.get(sp) === "light").length,
      busyGames: gameDays.filter((sp) => volumeBySp.get(sp) === "heavy").length,
      roleBoost: ppg(add) - ppg(original),
      ppg: ppg(add),
      reason: "",
    };
    pick.reason = reasonFor(pick, original, items, inPlayoffs);
    picks.push(pick);
  }
  picks.sort((a, b) => b.priority - a.priority);
  return { nights: schedule, openSpotsByNight, picks: picks.slice(0, limit) };
}

function reasonFor(p: WaiverPick, original: Player, items: ReturnType<typeof scoringItems>, inPlayoffs: boolean): string {
  const r = Math.round;
  const parts: string[] = [];
  const g = (n: number) => `${n} ${n === 1 ? "game" : "games"}`;
  let games = `${g(p.games)} in the next 7 days`;
  if (p.usableGames < p.games) games += `, ${p.usableGames} on nights you have an open spot`;
  else if (p.games > 0) games += `, all on nights you have an open spot`;
  if (p.quietGames > 0) games += ` (${p.quietGames} on quiet nights)`;
  parts.push(`${games}: +${r(p.next7Gain)} points this week.`);
  if (p.roleBoost >= 2) parts.push(`Bigger role right now: about ${r(p.ppg)} a game, up from ${r(p.ppg - p.roleBoost)}.`);
  const f = formOf(original, items);
  if (f.trend === "hot" && f.recentPpg !== null) parts.push(`Hot: ${r(f.recentPpg)} a game lately.`);
  if (!inPlayoffs && Math.abs(p.restOfSeasonGain) >= 20) {
    parts.push(`${p.restOfSeasonGain > 0 ? "+" : "−"}${r(Math.abs(p.restOfSeasonGain))} over the rest of the season.`);
  }
  return parts.join(" ");
}
