import { SLOT, STARTING_SLOTS } from "../espn/constants";
import { pointsPerGame } from "./scoring";
import type { Player, ScoringItem, Snapshot, StatLine } from "../types";

// Who plays when, and who actually starts given the league's lineup slots.

export type Ctx = Pick<
  Snapshot,
  | "proGames"
  | "lineupSlotCounts"
  | "lineupLockType"
  | "scoring"
  | "scoringType"
  | "matchupPeriods"
  | "scoringPeriodDates"
  | "currentScoringPeriod"
> & { items: ScoringItem[] };

// Injury status is a short-term signal: treat an OUT player as out for the next week only.
const INJURY_HORIZON_DAYS = 7;

export function playsOn(ctx: Pick<Ctx, "proGames">, player: Player, sp: number): boolean {
  return ctx.proGames[player.proTeamId]?.includes(sp) ?? false;
}

export function gamesIn(ctx: Pick<Ctx, "proGames">, player: Player, sps: number[]): number {
  return sps.filter((sp) => playsOn(ctx, player, sp)).length;
}

// First day a player can be in Dylan's lineup: waiver players only after their claim clears.
export function firstAvailableSp(player: Player, dates: Record<number, string>): number {
  if (player.status !== "WAIVERS" || !player.waiverUntil) return 0;
  const day = new Date(player.waiverUntil).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const sp = Object.entries(dates).find(([, d]) => d >= day);
  return sp ? Number(sp[0]) : Infinity;
}

// A player can't help if hurt out or stashed on IR.
export function isAvailable(player: Player): boolean {
  return player.injuryStatus !== "OUT" && player.lineupSlotId !== SLOT.IR;
}

// Starting slots, most specific first, so flexible slots (G, F, UTIL) stay open for whoever needs them.
function slotList(counts: Record<number, number>): number[] {
  const order = [0, 1, 2, 3, 4, 7, 9, 8, 10, 5, 6, 11];
  const out: number[] = [];
  for (const slot of order) {
    if (!STARTING_SLOTS.includes(slot)) continue;
    for (let i = 0; i < (counts[slot] ?? 0); i++) out.push(slot);
  }
  return out;
}

// Fill slots best-player-first; when a slot is taken, try moving its current player to another eligible slot
// (augmenting path). This always starts the highest-scoring set of players the slots allow.
function assign(players: Player[], slots: number[]): Map<number, number> {
  const holder: (Player | null)[] = slots.map(() => null);
  const tryPlace = (p: Player, seen: Set<number>): boolean => {
    for (let i = 0; i < slots.length; i++) {
      if (!p.eligibleSlots.includes(slots[i]) || seen.has(i)) continue;
      seen.add(i);
      const current = holder[i];
      if (!current || tryPlace(current, seen)) {
        holder[i] = p;
        return true;
      }
    }
    return false;
  };
  for (const p of players) tryPlace(p, new Set());
  const out = new Map<number, number>();
  holder.forEach((p, i) => p && out.set(p.id, slots[i]));
  return out;
}

export interface DayPlan {
  sp: number;
  date: string;
  starters: { playerId: number; slot: number }[];
  benchedWithGame: number[]; // more players had games than slots
  openSlots: number; // starting slots with nobody to fill them
}

export interface SimResult {
  days: DayPlan[];
  startedGames: number;
  totalGames: number;
  points: number;
  byStat: StatLine; // fantasy points per stat in a points league; raw stat totals in a categories league
  rawByStat: StatLine; // raw stat totals
}

export function simulate(ctx: Ctx, roster: Player[], sps: number[]): SimResult {
  const slots = slotList(ctx.lineupSlotCounts);
  const ppg = new Map(roster.map((p) => [p.id, pointsPerGame(p, ctx.items)]));
  const ranked = roster.filter((p) => p.lineupSlotId !== SLOT.IR).sort((a, b) => (ppg.get(b.id) ?? 0) - (ppg.get(a.id) ?? 0));
  const injuryUntil = ctx.currentScoringPeriod + INJURY_HORIZON_DAYS;
  const canPlay = (p: Player, sp: number) =>
    playsOn(ctx, p, sp) &&
    sp >= firstAvailableSp(p, ctx.scoringPeriodDates) &&
    !(p.injuryStatus === "OUT" && sp < injuryUntil);

  // Weekly-lock leagues set one lineup for the whole matchup: rank by points over the period instead.
  let weeklyStarters: Set<number> | null = null;
  if (ctx.lineupLockType === "WEEKLY") {
    const weekly = [...ranked].sort(
      (a, b) =>
        sps.filter((sp) => canPlay(b, sp)).length * (ppg.get(b.id) ?? 0) -
        sps.filter((sp) => canPlay(a, sp)).length * (ppg.get(a.id) ?? 0),
    );
    weeklyStarters = new Set(assign(weekly, slots).keys());
  }

  const result: SimResult = { days: [], startedGames: 0, totalGames: 0, points: 0, byStat: {}, rawByStat: {} };
  for (const sp of sps) {
    const playing = ranked.filter((p) => canPlay(p, sp));
    const eligible = weeklyStarters ? playing.filter((p) => weeklyStarters!.has(p.id)) : playing;
    const placed = assign(eligible, slots);
    const day: DayPlan = {
      sp,
      date: ctx.scoringPeriodDates[sp] ?? "",
      starters: [...placed].map(([playerId, slot]) => ({ playerId, slot })),
      benchedWithGame: playing.filter((p) => !placed.has(p.id)).map((p) => p.id),
      openSlots: slots.length - placed.size,
    };
    result.days.push(day);
    result.totalGames += playing.length;
    result.startedGames += placed.size;
    for (const p of eligible) {
      if (!placed.has(p.id)) continue;
      for (const it of ctx.items) {
        const v = p.proj[it.statId] ?? 0;
        result.rawByStat[it.statId] = (result.rawByStat[it.statId] ?? 0) + v;
        result.byStat[it.statId] = (result.byStat[it.statId] ?? 0) + v * it.points;
      }
      // Percent categories need makes and attempts.
      for (const id of [13, 14, 15, 16, 17, 18]) result.rawByStat[id + 1000] = (result.rawByStat[id + 1000] ?? 0) + (p.proj[id] ?? 0);
      result.points += ppg.get(p.id) ?? 0;
    }
  }
  return result;
}

export function makeCtx(snap: Snapshot, items: ScoringItem[]): Ctx {
  return { ...snap, items };
}
