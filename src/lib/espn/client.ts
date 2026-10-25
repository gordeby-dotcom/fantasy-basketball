import "server-only";
import { env } from "../env";

// The only module that talks to ESPN's unofficial fantasy API. If ESPN changes a URL or a field, fix it here.

const BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons";

export class EspnError extends Error {
  constructor(
    message: string,
    public readonly kind: "auth" | "league" | "network",
  ) {
    super(message);
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type RawLeague = any;
export type RawPlayerEntry = any;
export type RawProTeam = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

async function espnFetch(url: string, filter?: object): Promise<unknown> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const s2 = env.espn.s2();
  const swid = env.espn.swid();
  if (s2 && swid) headers.Cookie = `espn_s2=${s2}; SWID=${swid}`;
  if (filter) headers["X-Fantasy-Filter"] = JSON.stringify(filter);

  let res: Response;
  try {
    res = await fetch(url, { headers, cache: "no-store" });
  } catch {
    throw new EspnError("Couldn't reach ESPN. Try refreshing in a few minutes.", "network");
  }
  if (res.status === 401 || res.status === 403) {
    throw new EspnError("ESPN sign-in expired. Update ESPN_S2 and ESPN_SWID.", "auth");
  }
  if (res.status === 404) {
    throw new EspnError("ESPN couldn't find the league. Check ESPN_LEAGUE_ID and ESPN_SEASON.", "league");
  }
  if (!res.ok) throw new EspnError(`ESPN returned an error (${res.status}).`, "network");

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // ESPN sends an HTML login page instead of JSON when the cookies are missing or stale.
    throw new EspnError("ESPN sign-in expired. Update ESPN_S2 and ESPN_SWID.", "auth");
  }
}

function leagueUrl(views: string[], params: Record<string, string | number> = {}): string {
  const leagueId = env.espn.leagueId();
  if (!leagueId) throw new EspnError("ESPN_LEAGUE_ID isn't set.", "league");
  const qs = new URLSearchParams();
  for (const v of views) qs.append("view", v);
  for (const [k, v] of Object.entries(params)) qs.append(k, String(v));
  return `${BASE}/${env.espn.season()}/segments/0/leagues/${leagueId}?${qs}`;
}

// Settings, teams, every roster (with player stats), the season's matchups and league status.
export async function fetchLeague(): Promise<RawLeague> {
  return espnFetch(leagueUrl(["mSettings", "mTeam", "mRoster", "mMatchup", "mStatus"]));
}

// One day of every matchup: each team's lineup that day with each player's stats and fantasy points.
export async function fetchMatchupDay(scoringPeriodId: number): Promise<RawLeague> {
  return espnFetch(leagueUrl(["mMatchupScore", "mScoreboard"], { scoringPeriodId }));
}

// Free agents and waiver players, most-owned first. Includes ESPN projections and recent averages.
export async function fetchFreeAgents(scoringPeriodId: number, limit = 150): Promise<RawPlayerEntry[]> {
  const season = env.espn.season();
  const filter = {
    players: {
      filterStatus: { value: ["FREEAGENT", "WAIVERS"] },
      filterSlotIds: { value: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
      limit,
      sortPercOwned: { sortPriority: 1, sortAsc: false },
      filterRanksForScoringPeriodIds: { value: [scoringPeriodId] },
      filterStatsForTopScoringPeriodIds: {
        value: 5,
        additionalValue: [`00${season}`, `10${season}`, `02${season}`, `00${season - 1}`],
      },
    },
  };
  const data = (await espnFetch(leagueUrl(["kona_player_info"], { scoringPeriodId }), filter)) as {
    players?: RawPlayerEntry[];
  };
  return data.players ?? [];
}

// Every NBA team's games, keyed by fantasy scoring period (one scoring period per day). Public, no cookies needed.
export async function fetchProSchedule(): Promise<RawProTeam[]> {
  const data = (await espnFetch(`${BASE}/${env.espn.season()}?view=proTeamSchedules_wl`)) as {
    settings?: { proTeams?: RawProTeam[] };
  };
  return data.settings?.proTeams ?? [];
}
