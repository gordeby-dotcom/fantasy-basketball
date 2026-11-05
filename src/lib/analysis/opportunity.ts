import { PRO_TEAM } from "../espn/constants";
import { pointsPerGame, scoringItems } from "./scoring";
import type { Player, ScoringItem, Snapshot } from "../types";

// Playing-time changes: injured rotation players open minutes for teammates, and some free agents' minutes
// are already rising. A pickup's value is his points per minute times the minutes he's likely to get now.

const OUT_STATUSES = new Set(["OUT", "INJURY_RESERVE", "SUSPENSION"]);
const MIN_ROLE_MINUTES = 18; // an injured player must normally play this much to open a real role
const SHARE_SAME_POSITION = 0.35; // share of the vacated minutes a same-position teammate might pick up
const SHARE_OTHER_POSITION = 0.15;
const MAX_MINUTES = 36;
// Several teammates split vacated minutes, so a predicted (not yet seen) bump is capped. Minutes he's actually
// playing lately count in full.
const MAX_PREDICTED_BUMP = 8;
// Bench players' points per minute are noisy (garbage time), so pull them toward a typical rate.
const TYPICAL_PER_MINUTE = 1.0;
const SHRINK_MINUTES = 10;
const RISER_MINUTES = 4; // last-7 minutes this far above his season average counts as a rise

export function isOut(p: Player): boolean {
  return OUT_STATUSES.has(p.injuryStatus);
}

// A player's usual minutes: this season once he has a few games, otherwise ESPN's projection.
export function baseMinutes(p: Player): number | undefined {
  const m = p.minutes;
  if (!m) return undefined;
  if (m.season !== undefined && (m.seasonGames ?? 0) >= 3) return m.season;
  return m.projected ?? m.season;
}

// Minutes lately, if he's played enough over the last week to trust it.
export function recentMinutes(p: Player): number | undefined {
  const m = p.minutes;
  return m?.last7 !== undefined && (m.last7Games ?? 0) >= 2 ? m.last7 : undefined;
}

const positionsOf = (p: Player) => new Set(p.eligibleSlots.filter((s) => s <= 4));
const overlaps = (a: Player, b: Player) => [...positionsOf(a)].some((s) => positionsOf(b).has(s));

export interface Injured {
  player: Player;
  minutes: number;
}

export interface Beneficiary {
  player: Player;
  minutesBefore: number;
  minutesNow?: number;
  expectedMinutes: number;
  ppgNow: number; // current value used elsewhere on the site
  roleValue: number; // points per game if the bigger role holds
  boost: number; // roleValue - ppgNow
  reason: string;
}

export interface TeamOpening {
  proTeamId: number;
  proTeam: string;
  injured: Injured[];
  beneficiaries: Beneficiary[]; // free agents, best first
  yours: Player[]; // Dylan's players on this team who may also gain minutes
}

export interface Riser {
  player: Player;
  minutesBefore: number;
  minutesNow: number;
  ppgNow: number;
  roleValue: number;
}

function perMinute(p: Player, items: ScoringItem[]): number {
  const base = baseMinutes(p);
  if (!base || base < 8) return 0;
  const raw = pointsPerGame(p, items) / base;
  return (raw * base + TYPICAL_PER_MINUTE * SHRINK_MINUTES) / (base + SHRINK_MINUTES);
}

export function injuryOpenings(snap: Snapshot): TeamOpening[] {
  const items = scoringItems(snap);
  const byTeam = new Map<number, Player[]>();
  for (const p of Object.values(snap.players)) {
    if (!p.proTeamId) continue;
    byTeam.set(p.proTeamId, [...(byTeam.get(p.proTeamId) ?? []), p]);
  }

  const openings: TeamOpening[] = [];
  for (const [proTeamId, players] of byTeam) {
    const injured = players
      .filter(isOut)
      .map((p) => ({ player: p, minutes: baseMinutes(p) ?? 0 }))
      .filter((x) => x.minutes >= MIN_ROLE_MINUTES)
      .sort((a, b) => b.minutes - a.minutes);
    if (injured.length === 0) continue;

    const beneficiaries: Beneficiary[] = [];
    for (const p of players) {
      if (p.onTeamId !== 0 || isOut(p)) continue;
      const before = baseMinutes(p);
      const fpm = perMinute(p, items);
      if (before === undefined || fpm <= 0) continue;
      const vacated = injured.reduce((n, x) => n + x.minutes * (overlaps(p, x.player) ? SHARE_SAME_POSITION : SHARE_OTHER_POSITION), 0);
      const now = recentMinutes(p);
      const expectedMinutes = Math.min(MAX_MINUTES, Math.max(now ?? 0, before + Math.min(vacated, MAX_PREDICTED_BUMP)));
      const ppgNow = pointsPerGame(p, items);
      const roleValue = fpm * expectedMinutes;
      const boost = roleValue - ppgNow;
      if (boost < 3) continue;
      const names = injured.map((x) => x.player.name);
      const out = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
      const trend =
        now !== undefined && now >= before + 2
          ? `His minutes are already up (${Math.round(before)} → ${Math.round(now)} a game).`
          : `He could see about ${Math.round(expectedMinutes)} minutes a game (usually ${Math.round(before)}).`;
      beneficiaries.push({
        player: p,
        minutesBefore: before,
        minutesNow: now,
        expectedMinutes,
        ppgNow,
        roleValue,
        boost,
        reason: `${out} ${injured.length === 1 ? "is" : "are"} out. ${trend} At ${fpm.toFixed(2)} points a minute, that's about ${Math.round(roleValue)} a game if it holds.`,
      });
    }
    beneficiaries.sort((a, b) => b.roleValue - a.roleValue);
    const yours = players.filter((p) => p.onTeamId === snap.myTeamId && !isOut(p) && injured.some((x) => overlaps(p, x.player)));
    if (beneficiaries.length === 0 && yours.length === 0) continue;
    openings.push({ proTeamId, proTeam: PRO_TEAM[proTeamId] ?? "", injured, beneficiaries: beneficiaries.slice(0, 3), yours });
  }
  return openings.sort((a, b) => (b.beneficiaries[0]?.roleValue ?? 0) - (a.beneficiaries[0]?.roleValue ?? 0));
}

// Free agents whose minutes jumped lately, injury or not.
export function minutesRisers(snap: Snapshot, limit = 8): Riser[] {
  const items = scoringItems(snap);
  return Object.values(snap.players)
    .filter((p) => p.onTeamId === 0 && !isOut(p))
    .map((p) => {
      const before = p.minutes?.season;
      const now = recentMinutes(p);
      if (before === undefined || now === undefined || (p.minutes?.seasonGames ?? 0) < 4) return null;
      const ppgNow = pointsPerGame(p, items);
      return { player: p, minutesBefore: before, minutesNow: now, ppgNow, roleValue: perMinute(p, items) * now };
    })
    .filter((r): r is Riser => !!r && r.minutesNow - r.minutesBefore >= RISER_MINUTES && r.roleValue > r.ppgNow)
    .sort((a, b) => b.roleValue - a.roleValue)
    .slice(0, limit);
}

// How much bigger each free agent's line is in his current role (1.2 = 20% more fantasy points), using the
// same estimate shown on the injury and minutes cards. A short-term boost: injured players come back.
export function roleAdjustments(snap: Snapshot): Map<number, number> {
  const factors = new Map<number, number>();
  const set = (id: number, ppgNow: number, roleValue: number) => {
    if (ppgNow <= 0) return;
    const f = roleValue / ppgNow;
    if (f > (factors.get(id) ?? 1)) factors.set(id, f);
  };
  for (const o of injuryOpenings(snap)) for (const b of o.beneficiaries) set(b.player.id, b.ppgNow, b.roleValue);
  for (const r of minutesRisers(snap, 50)) set(r.player.id, r.ppgNow, r.roleValue);
  return factors;
}

export function scaled(p: Player, factor: number): Player {
  if (factor === 1) return p;
  const proj: Record<number, number> = {};
  for (const [k, v] of Object.entries(p.proj)) proj[Number(k)] = v * factor;
  return { ...p, proj };
}
