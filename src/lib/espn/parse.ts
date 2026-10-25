import { PRO_TEAM, POSITION_LABEL, SLOT, STAT } from "./constants";
import type { RawLeague, RawPlayerEntry, RawProTeam } from "./client";
import type { Matchup, Player, PlayerDay, ScoringItem, SideDay, StatLine, Team } from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const DAY_MS = 24 * 60 * 60 * 1000;

export function easternDate(ms: number): string {
  // en-CA formats as YYYY-MM-DD
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function statBlock(player: any, id: string): StatLine | undefined {
  const s = (player.stats ?? []).find((x: any) => x.id === id);
  const avg = s?.averageStats;
  return avg && Object.keys(avg).length > 0 ? numericKeys(avg) : undefined;
}

function numericKeys(obj: Record<string, number>): StatLine {
  const out: StatLine = {};
  for (const [k, v] of Object.entries(obj)) out[Number(k)] = Number(v) || 0;
  return out;
}

// ESPN's season projection omits misses for some players and always omits double-doubles, triple-doubles and ejections.
// Fill those from actual per-game rates so every scoring stat has a value.
export function completeStatLine(base: StatLine, rates?: StatLine): StatLine {
  const s = { ...base };
  if (s[STAT.FGMI] === undefined && s[STAT.FGA] !== undefined) s[STAT.FGMI] = s[STAT.FGA] - (s[STAT.FGM] ?? 0);
  if (s[STAT.FTMI] === undefined && s[STAT.FTA] !== undefined) s[STAT.FTMI] = s[STAT.FTA] - (s[STAT.FTM] ?? 0);
  if (s[STAT.TPMI] === undefined && s[STAT.TPA] !== undefined) s[STAT.TPMI] = s[STAT.TPA] - (s[STAT.TPM] ?? 0);
  if (s[STAT.REB] === undefined && s[STAT.OREB] !== undefined) s[STAT.REB] = s[STAT.OREB] + (s[STAT.DREB] ?? 0);
  for (const id of [STAT.DD, STAT.TD, STAT.QD, STAT.EJ]) {
    if (s[id] === undefined) s[id] = rates?.[id] ?? 0;
  }
  return s;
}

export function parsePlayer(entry: RawPlayerEntry, season: number, onTeamId = 0, lineupSlotId?: number): Player {
  const p = entry.player ?? entry.playerPoolEntry?.player ?? entry;
  const projection = statBlock(p, `10${season}`);
  const thisSeason = statBlock(p, `00${season}`);
  const lastSeason = statBlock(p, `00${season - 1}`);
  const recent = statBlock(p, `02${season}`);

  // Prefer ESPN's projection; fall back to last season, then this season's actuals.
  const base = projection ?? lastSeason ?? thisSeason;
  const rates = lastSeason ?? thisSeason;
  const proj = base ? completeStatLine(base, rates) : {};

  const eligibleSlots: number[] = p.eligibleSlots ?? [];
  const positions = [0, 1, 2, 3, 4]
    .filter((slot) => eligibleSlots.includes(slot))
    .map((slot) => POSITION_LABEL[slot + 1])
    .join("/");

  const team = onTeamId || entry.onTeamId || 0;
  return {
    id: p.id,
    name: p.fullName,
    proTeamId: p.proTeamId ?? 0,
    proTeam: PRO_TEAM[p.proTeamId] ?? "FA",
    positions: positions || POSITION_LABEL[p.defaultPositionId] || "",
    eligibleSlots,
    injuryStatus: p.injuryStatus ?? (p.injured ? "OUT" : "ACTIVE"),
    onTeamId: team,
    status: team ? "ONTEAM" : (entry.status ?? "FREEAGENT"),
    waiverUntil: entry.waiverProcessDate || undefined,
    percentOwned: p.ownership?.percentOwned ?? 0,
    lineupSlotId,
    proj,
    projSource: base ? "espn" : "none",
    recent,
  };
}

export function parseScoring(league: RawLeague): { type: string; items: ScoringItem[] } {
  const ss = league.settings?.scoringSettings ?? {};
  const items: ScoringItem[] = (ss.scoringItems ?? []).map((it: any) => ({
    statId: it.statId,
    points: Number(it.pointsOverrides?.["16"] ?? it.points ?? 0),
    isReverse: Boolean(it.isReverseItem),
  }));
  return { type: ss.scoringType ?? "H2H_POINTS", items };
}

export function parseTeams(league: RawLeague, season: number): { teams: Team[]; rostered: Player[] } {
  const teams: Team[] = [];
  const rostered: Player[] = [];
  for (const t of league.teams ?? []) {
    const entries = t.roster?.entries ?? [];
    for (const e of entries) rostered.push(parsePlayer(e.playerPoolEntry, season, t.id, e.lineupSlotId));
    teams.push({
      id: t.id,
      name: t.name || [t.location, t.nickname].filter(Boolean).join(" ") || `Team ${t.id}`,
      abbrev: t.abbrev ?? "",
      owners: t.owners ?? [],
      rosterIds: entries.map((e: any) => e.playerId),
      record: t.record?.overall
        ? { wins: t.record.overall.wins, losses: t.record.overall.losses, ties: t.record.overall.ties }
        : undefined,
    });
  }
  return { teams, rostered };
}

export function parseMatchups(league: RawLeague): Matchup[] {
  return (league.schedule ?? [])
    .filter((m: any) => m.home && m.away)
    .map((m: any) => ({
      matchupPeriodId: m.matchupPeriodId,
      homeTeamId: m.home.teamId,
      awayTeamId: m.away.teamId,
      homePoints: m.home.totalPoints ?? 0,
      awayPoints: m.away.totalPoints ?? 0,
    }));
}

// One team's box score for one day of a matchup, from fetchMatchupDay.
export function parseSideDay(side: any, sp: number): SideDay {
  const players: PlayerDay[] = [];
  for (const e of side?.rosterForCurrentScoringPeriod?.entries ?? []) {
    const p = e.playerPoolEntry?.player;
    const line = (p?.stats ?? []).find((s: any) => s.scoringPeriodId === sp && s.statSourceId === 0);
    const games = Number(line?.stats?.[STAT.GP] ?? 0);
    if (!games) continue;
    players.push({
      playerId: e.playerId,
      name: p?.fullName ?? "Unknown",
      started: e.lineupSlotId !== SLOT.BE && e.lineupSlotId !== SLOT.IR,
      games,
      points: Number(line.appliedTotal ?? 0),
      statPoints: numericKeys(line.appliedStats ?? {}),
    });
  }
  return { points: Number(side?.pointsByScoringPeriod?.[sp] ?? 0), players };
}

export function parseProSchedule(proTeams: RawProTeam[]): {
  proGames: Record<number, number[]>;
  scoringPeriodDates: Record<number, string>;
} {
  const proGames: Record<number, number[]> = {};
  let anchor: { sp: number; date: number } | null = null;
  let lastSp = 0;
  for (const t of proTeams) {
    const periods: number[] = [];
    for (const [sp, games] of Object.entries<any[]>(t.proGamesByScoringPeriod ?? {})) {
      const n = Number(sp);
      periods.push(n);
      lastSp = Math.max(lastSp, n);
      if (!anchor && games[0]?.date) anchor = { sp: n, date: games[0].date };
    }
    proGames[t.id] = periods.sort((a, b) => a - b);
  }
  // Scoring periods are consecutive calendar days, so one known game date fixes them all.
  const scoringPeriodDates: Record<number, string> = {};
  if (anchor) {
    for (let sp = 1; sp <= lastSp; sp++) scoringPeriodDates[sp] = easternDate(anchor.date + (sp - anchor.sp) * DAY_MS);
  }
  return { proGames, scoringPeriodDates };
}

// Map each fantasy matchup period to its days. ESPN doesn't publish this directly, so we rebuild it:
// matchups run Monday to Sunday, the first one starts on opening day, and ESPN merges the All-Star week
// with the week after it. status.finalScoringPeriod (the last fantasy day) tells us whether that merge happened.
export function parseMatchupPeriods(
  league: RawLeague,
  scoringPeriodDates: Record<number, string>,
  proGames: Record<number, number[]> = {},
): Record<number, number[]> {
  const sps = Object.keys(scoringPeriodDates).map(Number).sort((a, b) => a - b);
  if (sps.length === 0) return {};
  const first = new Date(`${scoringPeriodDates[sps[0]]}T12:00:00Z`);
  const firstMonday = new Date(first.getTime() - ((first.getUTCDay() + 6) % 7) * DAY_MS);
  const weekOf = (sp: number) =>
    Math.floor((new Date(`${scoringPeriodDates[sp]}T12:00:00Z`).getTime() - firstMonday.getTime()) / (7 * DAY_MS));

  let weeks: number[][] = [];
  for (const sp of sps) (weeks[weekOf(sp)] ??= []).push(sp);
  weeks = weeks.filter(Boolean);

  const configured: Record<string, number[]> = league.settings?.scheduleSettings?.matchupPeriods ?? {};
  const keys = Object.keys(configured).map(Number).sort((a, b) => a - b);
  const count = keys.length || weeks.length;
  const finalSp: number | undefined = league.status?.finalScoringPeriod;

  const endOf = (ws: number[][]) => ws[count - 1]?.at(-1) ?? 0;
  if (finalSp && endOf(weeks) < finalSp) {
    const allStar = allStarWeek(weeks, scoringPeriodDates, proGames);
    if (allStar !== null && allStar + 1 < weeks.length) {
      weeks = [...weeks.slice(0, allStar), [...weeks[allStar], ...weeks[allStar + 1]], ...weeks.slice(allStar + 2)];
    }
  }

  const out: Record<number, number[]> = {};
  if (keys.length === 0) {
    weeks.forEach((w, i) => (out[i + 1] = w));
    return out;
  }
  keys.forEach((k, i) => (out[k] = configured[k].flatMap((w) => weeks[w - 1] ?? weeks[i] ?? [])));
  return out;
}

// The calendar week where the All-Star break starts: the longest run of February days with no NBA games.
// (Other empty stretches, like unscheduled NBA Cup dates in December, aren't in February.)
function allStarWeek(weeks: number[][], dates: Record<number, string>, proGames: Record<number, number[]>): number | null {
  const hasGame = new Set(Object.values(proGames).flat());
  let best: { start: number; len: number } | null = null;
  let run: { start: number; len: number } | null = null;
  for (const sp of Object.keys(dates).map(Number).sort((a, b) => a - b)) {
    if (dates[sp].slice(5, 7) === "02" && !hasGame.has(sp)) {
      run = run ? { start: run.start, len: run.len + 1 } : { start: sp, len: 1 };
      if (!best || run.len > best.len) best = run;
    } else run = null;
  }
  if (!best || best.len < 3) return null;
  const idx = weeks.findIndex((w) => w.includes(best!.start));
  return idx >= 0 ? idx : null;
}
