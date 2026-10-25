// The normalized data the sync job stores and every page reads. Built from ESPN plus Basketball Monster.

export type StatLine = Record<number, number>; // ESPN stat ID -> per-game value

export type ScoringType = "H2H_POINTS" | "H2H_CATEGORY" | "H2H_MOST_CATEGORIES" | string;

export interface ScoringItem {
  statId: number;
  points: number; // points per stat in a points league; 0 in a categories league
  isReverse: boolean; // categories league: lower is better (e.g. turnovers)
}

export interface Player {
  id: number;
  name: string;
  proTeamId: number;
  proTeam: string;
  positions: string; // e.g. "PG/SG"
  eligibleSlots: number[];
  injuryStatus: string; // ACTIVE, DAY_TO_DAY, OUT, ...
  onTeamId: number; // 0 = free agent
  status: "FREEAGENT" | "WAIVERS" | "ONTEAM" | string;
  waiverUntil?: number; // ms timestamp when on waivers
  percentOwned: number;
  lineupSlotId?: number; // set for rostered players
  proj: StatLine; // per-game line used for scoring: BBM 26-27 stats blended with ESPN by games played, else ESPN
  projSource: "bbm" | "espn" | "none";
  projEspn?: StatLine; // ESPN projection, kept as a cross-check when BBM stats are the source
  projBbm?: StatLine; // BBM season stats before blending
  bbmGames?: number; // games behind the BBM stats
  bbmWeight?: number; // share of the blend from BBM, 0 to 1
  recent?: StatLine; // last-15-day per-game actuals, for context
}

export interface Team {
  id: number;
  name: string;
  abbrev: string;
  owners: string[];
  rosterIds: number[];
  record?: { wins: number; losses: number; ties: number };
}

export interface Matchup {
  matchupPeriodId: number;
  homeTeamId: number;
  awayTeamId: number;
  homePoints: number;
  awayPoints: number;
}

// What actually happened so far in the current matchup, day by day, from ESPN's box scores.
export interface PlayerDay {
  playerId: number;
  name: string;
  started: boolean; // in a starting slot (not bench or IR)
  games: number;
  points: number;
  statPoints: StatLine; // fantasy points by stat
}

export interface SideDay {
  points: number; // counted points (starters only)
  players: PlayerDay[]; // only players who played that day
}

export interface MatchupActuals {
  matchupPeriodId: number;
  myTeamId: number;
  opponentId: number;
  days: { sp: number; date: string; mine: SideDay; theirs: SideDay }[];
}

export interface SourceStatus {
  ok: boolean;
  at: number;
  message?: string; // plain-language problem, safe to show in the banner
}

export interface Snapshot {
  syncedAt: number;
  season: number;
  leagueName: string;
  scoringType: ScoringType;
  scoring: ScoringItem[];
  lineupSlotCounts: Record<number, number>; // slot ID -> count
  lineupLockType: string; // e.g. INDIVIDUAL_GAME (daily) or WEEKLY
  acquisition: { waiverHours: number; usesBudget: boolean };
  currentScoringPeriod: number;
  currentMatchupPeriod: number;
  scoringPeriodDates: Record<number, string>; // scoring period -> YYYY-MM-DD (US Eastern)
  matchupPeriods: Record<number, number[]>; // matchup period -> scoring periods (days) in it
  regularSeasonMatchupPeriods: number;
  playoffMatchupPeriods: number[]; // fantasy playoff weeks, in order
  tradeDeadline: number | null; // ms timestamp
  myTeamId: number;
  teams: Team[];
  matchups: Matchup[];
  players: Record<number, Player>;
  proGames: Record<number, number[]>; // pro team ID -> scoring periods with a game
  actuals?: MatchupActuals; // the current matchup so far
  sources: { espn: SourceStatus; bbm: SourceStatus };
}
