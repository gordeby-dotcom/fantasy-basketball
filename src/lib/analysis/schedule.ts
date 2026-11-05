import type { Player, Snapshot } from "../types";

// How many NBA games are on each night. On quiet nights few of Dylan's players play, so his lineup has open
// spots and a pickup's game counts; on busy nights his lineup is often full, so a pickup's game may sit.

export type Volume = "light" | "normal" | "heavy";

export interface Night {
  sp: number;
  date: string;
  games: number;
  volume: Volume;
}

export interface VolumeScale {
  light: number; // nights with this many games or fewer are light
  heavy: number; // nights with this many games or more are heavy
}

export function gamesPerNight(snap: Pick<Snapshot, "proGames">): Map<number, number> {
  const teams = new Map<number, number>();
  for (const sps of Object.values(snap.proGames)) for (const sp of sps) teams.set(sp, (teams.get(sp) ?? 0) + 1);
  // Each game has two teams.
  return new Map([...teams].map(([sp, n]) => [sp, Math.round(n / 2)]));
}

// Quiet and busy cut-offs from the whole season: the bottom and top quarter of nights that have games.
export function volumeScale(perNight: Map<number, number>): VolumeScale {
  const counts = [...perNight.values()].filter((n) => n > 0).sort((a, b) => a - b);
  if (counts.length === 0) return { light: 0, heavy: Infinity };
  const at = (q: number) => counts[Math.min(counts.length - 1, Math.floor(q * counts.length))];
  return { light: at(0.25), heavy: Math.max(at(0.75), at(0.25) + 1) };
}

export function classify(games: number, scale: VolumeScale): Volume {
  if (games <= scale.light) return "light";
  if (games >= scale.heavy) return "heavy";
  return "normal";
}

export function nights(snap: Snapshot, sps: number[]): Night[] {
  const perNight = gamesPerNight(snap);
  const scale = volumeScale(perNight);
  return sps.map((sp) => {
    const games = perNight.get(sp) ?? 0;
    return { sp, date: snap.scoringPeriodDates[sp] ?? "", games, volume: classify(games, scale) };
  });
}

// The next `days` days starting today.
export function nextDays(snap: Snapshot, days = 7): number[] {
  return Array.from({ length: days }, (_, i) => snap.currentScoringPeriod + i).filter((sp) => snap.scoringPeriodDates[sp]);
}

export interface NightCounts {
  light: number;
  normal: number;
  heavy: number;
}

export function nightCounts(snap: Snapshot, player: Player, schedule: Night[]): NightCounts {
  const plays = new Set(snap.proGames[player.proTeamId] ?? []);
  const out: NightCounts = { light: 0, normal: 0, heavy: 0 };
  for (const n of schedule) if (plays.has(n.sp)) out[n.volume]++;
  return out;
}
