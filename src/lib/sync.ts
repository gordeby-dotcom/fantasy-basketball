import "server-only";
import { env } from "./env";
import { getValue, setValue, StoreError } from "./store";
import { BbmError, fetchBbmRankings, normalizeName, type BbmProjection } from "./bbm";
import { EspnError, fetchFreeAgents, fetchLeague, fetchMatchupDay, fetchProSchedule } from "./espn/client";
import {
  completeStatLine,
  parseMatchupPeriods,
  parseMatchups,
  parsePlayer,
  parseProSchedule,
  parseScoring,
  parseSideDay,
  parseTeams,
} from "./espn/parse";
import { STAT } from "./espn/constants";
import { findTrades } from "./analysis/trades";
import type { MatchupActuals, Player, Snapshot, SourceStatus } from "./types";

const SNAPSHOT_KEY = "snapshot";
const BBM_KEY = "bbm-rankings";
const BBM_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function getSnapshot(): Promise<Snapshot | null> {
  return getValue<Snapshot>(SNAPSHOT_KEY);
}

interface BbmCache {
  at: number;
  rows: BbmProjection[];
}

// BBM 26-27 per-game stats override ESPN for the stats BBM publishes; ESPN fills the rest
// (three-point attempts scaled to BBM's makes, double-doubles, ejections).
// Season stats from a handful of games are noisy, so BBM's line is blended with ESPN's projection
// by games played: 2 games = 20% BBM, 10 or more = all BBM.
export const FULL_WEIGHT_GAMES = 10;

function applyBbm(player: Player, row: BbmProjection): Player {
  const espn = player.proj;
  const s = { ...espn, ...row.stats };
  if (row.stats[STAT.TPA] === undefined && espn[STAT.TPM] && espn[STAT.TPA] && s[STAT.TPM] !== undefined) {
    s[STAT.TPA] = espn[STAT.TPA] * (s[STAT.TPM] / espn[STAT.TPM]);
  }
  for (const id of [STAT.FGMI, STAT.FTMI, STAT.TPMI]) delete s[id];
  const bbm = completeStatLine(s, espn);

  const hasEspn = player.projSource === "espn";
  const weight = hasEspn ? Math.min(1, row.games / FULL_WEIGHT_GAMES) : 1;
  const blended: Record<number, number> = {};
  for (const id of new Set([...Object.keys(bbm), ...Object.keys(espn)].map(Number))) {
    blended[id] = weight * (bbm[id] ?? 0) + (1 - weight) * (espn[id] ?? 0);
  }
  return {
    ...player,
    proj: blended,
    projSource: "bbm",
    projEspn: hasEspn ? espn : undefined,
    projBbm: bbm,
    bbmGames: row.games,
    bbmWeight: weight,
  };
}

// How well a player is playing lately counts for 30% of his value, once he has 5+ games in the last 15 days.
export const FORM_WEIGHT = 0.3;
export const FORM_MIN_GAMES = 5;

function applyForm(players: Record<number, Player>): void {
  for (const p of Object.values(players)) {
    const games = p.recent?.[STAT.GP] ?? 0;
    if (!p.recent || games < FORM_MIN_GAMES || p.projSource === "none") continue;
    const recent = completeStatLine(p.recent, p.proj);
    const blended: Record<number, number> = {};
    for (const id of new Set([...Object.keys(p.proj), ...Object.keys(recent)].map(Number))) {
      blended[id] = (1 - FORM_WEIGHT) * (p.proj[id] ?? 0) + FORM_WEIGHT * (recent[id] ?? 0);
    }
    players[p.id] = { ...p, projSeason: p.proj, proj: blended, formWeight: FORM_WEIGHT };
  }
}

function mergeBbm(players: Record<number, Player>, rows: BbmProjection[]): number {
  const byName = new Map<string, BbmProjection[]>();
  for (const r of rows) {
    const key = normalizeName(r.name);
    byName.set(key, [...(byName.get(key) ?? []), r]);
  }
  let matched = 0;
  for (const p of Object.values(players)) {
    const candidates = byName.get(normalizeName(p.name));
    if (!candidates?.length) continue;
    const row = candidates.find((c) => c.team === p.proTeam) ?? candidates[0];
    players[p.id] = applyBbm(p, row);
    matched++;
  }
  return matched;
}

function findMyTeam(teams: Snapshot["teams"]): number {
  const override = env.espn.teamId();
  if (override) return override;
  const swid = env.espn.swid().toUpperCase();
  const mine = teams.find((t) => t.owners.some((o) => o.toUpperCase() === swid));
  if (!mine) throw new EspnError("Couldn't find Dylan's team from ESPN_SWID. Set ESPN_TEAM_ID in .env.", "league");
  return mine.id;
}

async function loadBbm(): Promise<{ rows: BbmProjection[]; status: SourceStatus }> {
  const now = Date.now();
  try {
    const { rows, warning } = await fetchBbmRankings();
    await setValue<BbmCache>(BBM_KEY, { at: now, rows });
    return { rows, status: warning ? { ok: false, at: now, message: `${warning} Read the public rankings instead.` } : { ok: true, at: now } };
  } catch (err) {
    const message = err instanceof BbmError ? err.message : "Couldn't reach Basketball Monster.";
    const cached = await getValue<BbmCache>(BBM_KEY);
    if (cached && now - cached.at < BBM_MAX_AGE_MS) {
      return { rows: cached.rows, status: { ok: false, at: cached.at, message: `${message} Using stats from an earlier sync.` } };
    }
    return { rows: [], status: { ok: false, at: now, message: `${message} Using ESPN projections instead.` } };
  }
}

// Box scores for each day of the current matchup played so far (both teams). Optional: if it fails,
// the Why page falls back to projections only.
async function loadActuals(
  matchupPeriodId: number,
  days: number[],
  dates: Record<number, string>,
  myTeamId: number,
): Promise<MatchupActuals | undefined> {
  if (days.length === 0) return undefined;
  try {
    const raw = await Promise.all(days.map((sp) => fetchMatchupDay(sp)));
    let opponentId = 0;
    const out: MatchupActuals["days"] = [];
    raw.forEach((league, i) => {
      const sp = days[i];
      const m = (league.schedule ?? []).find(
        (x: { matchupPeriodId: number; home?: { teamId: number }; away?: { teamId: number } }) =>
          x.matchupPeriodId === matchupPeriodId && (x.home?.teamId === myTeamId || x.away?.teamId === myTeamId),
      );
      if (!m) return;
      const mineSide = m.home.teamId === myTeamId ? m.home : m.away;
      const theirSide = m.home.teamId === myTeamId ? m.away : m.home;
      opponentId = theirSide.teamId;
      out.push({ sp, date: dates[sp] ?? "", mine: parseSideDay(mineSide, sp), theirs: parseSideDay(theirSide, sp) });
    });
    return out.length ? { matchupPeriodId, myTeamId, opponentId, days: out } : undefined;
  } catch (err) {
    console.error("Matchup box scores failed:", err instanceof Error ? err.message : "unknown error");
    return undefined;
  }
}

// Stats come with 15+ decimal places; 3 is plenty and roughly halves the stored snapshot.
function compactNumbers<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_, v) => (typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v)));
}

function safeTradeIdeas(snapshot: Snapshot): Snapshot["tradeIdeas"] {
  try {
    return findTrades(snapshot);
  } catch (err) {
    console.error("Trade finder failed:", err instanceof Error ? err.message : "unknown error");
    return [];
  }
}

export async function runSync(): Promise<Snapshot> {
  const season = env.espn.season();
  const previous = await getSnapshot();
  const bbmPromise = loadBbm();

  try {
    const [league, proTeams] = await Promise.all([fetchLeague(), fetchProSchedule()]);
    const currentScoringPeriod: number = league.scoringPeriodId ?? league.status?.latestScoringPeriod ?? 1;
    const freeAgents = await fetchFreeAgents(currentScoringPeriod);

    const { type, items } = parseScoring(league);
    const { teams, rostered } = parseTeams(league, season);
    const { proGames, scoringPeriodDates } = parseProSchedule(proTeams);
    const matchupPeriods = parseMatchupPeriods(league, scoringPeriodDates, proGames);
    const sched = league.settings?.scheduleSettings ?? {};
    const regularSeasonMatchupPeriods: number = sched.matchupPeriodCount ?? 0;
    const playoffMatchupPeriods = Object.keys(matchupPeriods)
      .map(Number)
      .filter((mp) => mp > regularSeasonMatchupPeriods)
      .sort((a, b) => a - b);

    const players: Record<number, Player> = {};
    for (const p of rostered) players[p.id] = p;
    for (const e of freeAgents) {
      const p = parsePlayer(e, season);
      if (!players[p.id]) players[p.id] = p;
    }

    const bbm = await bbmPromise;
    const matched = mergeBbm(players, bbm.rows);
    applyForm(players);
    if (bbm.status.ok && bbm.rows.length > 0 && matched === 0) {
      bbm.status = { ok: false, at: bbm.status.at, message: "Basketball Monster names didn't match ESPN players. Using ESPN projections." };
    }

    const myTeamId = findMyTeam(teams);
    const currentMatchupPeriod: number = league.status?.currentMatchupPeriod ?? 1;
    const actuals = await loadActuals(
      currentMatchupPeriod,
      // Completed days only; today onward is covered by the projection, so nothing is counted twice.
      (matchupPeriods[currentMatchupPeriod] ?? []).filter((sp) => sp < currentScoringPeriod),
      scoringPeriodDates,
      myTeamId,
    );

    const snapshot: Snapshot = {
      syncedAt: Date.now(),
      season,
      leagueName: league.settings?.name ?? "League",
      scoringType: type,
      scoring: items,
      lineupSlotCounts: Object.fromEntries(
        Object.entries<number>(league.settings?.rosterSettings?.lineupSlotCounts ?? {}).map(([k, v]) => [Number(k), v]),
      ),
      lineupLockType: league.settings?.rosterSettings?.lineupLocktimeType ?? "INDIVIDUAL_GAME",
      acquisition: {
        waiverHours: league.settings?.acquisitionSettings?.waiverHours ?? 0,
        usesBudget: Boolean(league.settings?.acquisitionSettings?.isUsingAcquisitionBudget),
      },
      currentScoringPeriod,
      currentMatchupPeriod,
      scoringPeriodDates,
      matchupPeriods,
      regularSeasonMatchupPeriods,
      playoffMatchupPeriods,
      tradeDeadline: league.settings?.tradeSettings?.deadlineDate ?? null,
      myTeamId,
      teams,
      matchups: parseMatchups(league),
      players,
      proGames,
      actuals,
      sources: { espn: { ok: true, at: Date.now() }, bbm: bbm.status },
    };
    snapshot.tradeIdeas = safeTradeIdeas(snapshot);
    const compact = compactNumbers(snapshot);
    await setValue(SNAPSHOT_KEY, compact);
    return compact;
  } catch (err) {
    await bbmPromise.catch(() => undefined);
    const message =
      err instanceof EspnError || err instanceof StoreError ? err.message : "The ESPN sync failed unexpectedly.";
    console.error("ESPN sync failed:", err instanceof Error ? err.message : "unknown error");
    if (!previous) throw new EspnError(message, err instanceof EspnError ? err.kind : "network");
    // Keep the last good data on screen and flag ESPN in the banner.
    const stale: Snapshot = { ...previous, sources: { ...previous.sources, espn: { ok: false, at: previous.sources.espn.at, message } } };
    await setValue(SNAPSHOT_KEY, stale);
    return stale;
  }
}
