import { gamesIn, makeCtx, simulate } from "./lineup";
import { freeAgentsByValue, playoffSpsOf, restOfSeasonSps, swapRoster } from "./playoffs";
import { pointsPerGame, scoringItems } from "./scoring";
import { leagueEdges, notableEdge, STANDARD_ITEMS } from "./value";
import { roster, teamName } from "./weekly";
import type { Player, Snapshot } from "../types";

// Trade finder: searches 1-for-1, 2-for-1 and 1-for-2 trades with every other team and ranks them by how many
// rest-of-season points Dylan gains with his real lineup and his league's scoring. Each idea also shows what
// the other team gains or loses, so Dylan can tell a fair offer from a long shot.

export type Chance = "fair" | "stretch" | "long shot";

export interface TradeIdea {
  teamId: number;
  teamName: string;
  give: number[];
  get: number[];
  myGain: number; // rest-of-season points, started lineup only
  myPlayoffGain: number;
  theirChange: number; // same measure for the other team's lineup
  valueBack: number; // what they get back ÷ what they give, by ESPN standard scoring (how most managers judge)
  chance: Chance;
  reason: string;
}

// Candidates simulated per team in each value range, so fair offers get searched as well as lopsided ones.
const CANDIDATES_PER_RANGE = 15;
export const IDEAS_PER_CHANCE = 5;
const MAX_PER_TEAM_PER_CHANCE = 2;
export const CHANCES: Chance[] = ["fair", "stretch", "long shot"];
// Managers compare the players they give and get. Below this share of value back, an offer is too lopsided to show.
export const MIN_VALUE_BACK = 0.75;

function chanceFor(valueBack: number, helpsTheirLineup: boolean): Chance {
  const level = valueBack >= 0.95 ? 0 : valueBack >= 0.85 ? 1 : 2;
  // A trade that also improves their lineup (depth, positions) is easier to sell.
  const adjusted = helpsTheirLineup ? Math.max(0, level - 1) : level;
  return (["fair", "stretch", "long shot"] as const)[adjusted];
}

interface Candidate {
  give: Player[];
  get: Player[];
  quick: number; // Dylan's rough gain, league scoring
  valueBack: number;
}

export function findTrades(snap: Snapshot): TradeIdea[] {
  const items = scoringItems(snap);
  const ctx = makeCtx(snap, items);
  const restSps = restOfSeasonSps(snap);
  const playoffSps = playoffSpsOf(snap);
  if (restSps.length === 0) return [];
  const fas = freeAgentsByValue(snap, items);
  const edges = leagueEdges(snap);

  // Rough value: points per game × games left. Dylan's in his league's scoring; theirs in standard scoring.
  const games = new Map(Object.values(snap.players).map((p) => [p.id, gamesIn(ctx, p, restSps)]));
  const value = (p: Player) => pointsPerGame(p, items) * (games.get(p.id) ?? 0);
  const stdValue = (p: Player) => pointsPerGame(p, STANDARD_ITEMS) * (games.get(p.id) ?? 0);
  const sum = (ps: Player[], f: (p: Player) => number) => ps.reduce((n, p) => n + f(p), 0);
  const tradeable = (p: Player) => p.lineupSlotId !== 13 && p.projSource !== "none";
  const lowest = (ps: Player[], f: (p: Player) => number) => [...ps].sort((a, b) => f(a) - f(b))[0];

  const mineRoster = roster(snap, snap.myTeamId);
  const myBase = simulate(ctx, mineRoster, restSps).points;
  const myPlayoffBase = simulate(ctx, mineRoster, playoffSps).points;
  const myLowest = lowest(mineRoster, value);
  const bestFa = fas[0];

  const ideas: TradeIdea[] = [];
  for (const team of snap.teams) {
    if (team.id === snap.myTeamId) continue;
    const theirRoster = roster(snap, team.id);
    const theirBase = simulate(ctx, theirRoster, restSps).points;
    const theirLowest = lowest(theirRoster, stdValue);
    const mine = mineRoster.filter(tradeable);
    const theirs = theirRoster.filter(tradeable);

    const candidates: Candidate[] = [];
    // myExtra / theirExtra: the free agent picked up or the player cut when the player counts don't match.
    const consider = (give: Player[], get: Player[], myExtra: number, theirExtra: number) => {
      const quick = sum(get, value) - sum(give, value) + myExtra;
      const valueBack = (sum(give, stdValue) + theirExtra) / Math.max(1, sum(get, stdValue));
      if (quick > 0 && valueBack >= MIN_VALUE_BACK) candidates.push({ give, get, quick, valueBack });
    };
    for (const a of mine) {
      for (const b of theirs) {
        consider([a], [b], 0, 0);
        for (const b2 of theirs) {
          // 1-for-2: Dylan cuts his lowest player; they fill the open spot with a free agent.
          if (b2.id > b.id) consider([a], [b, b2], myLowest ? -value(myLowest) : 0, bestFa ? stdValue(bestFa) : 0);
        }
      }
      for (const a2 of mine) {
        if (a2.id <= a.id) continue;
        // 2-for-1: Dylan fills the open spot with a free agent; they cut their lowest player.
        for (const b of theirs) consider([a, a2], [b], bestFa ? value(bestFa) : 0, theirLowest ? -stdValue(theirLowest) : 0);
      }
    }
    // Best few by Dylan's rough gain within each value range (the same cut-offs as the chance labels).
    candidates.sort((x, y) => y.quick - x.quick);
    const ranges = [(v: number) => v >= 0.95, (v: number) => v >= 0.85 && v < 0.95, (v: number) => v < 0.85];
    const toSimulate = ranges.flatMap((inRange) => candidates.filter((c) => inRange(c.valueBack)).slice(0, CANDIDATES_PER_RANGE));

    for (const c of toSimulate) {
      const giveIds = c.give.map((p) => p.id);
      const getIds = c.get.map((p) => p.id);
      const mineAfter = swapRoster(snap, items, mineRoster, giveIds, c.get, fas).after;
      const myGain = simulate(ctx, mineAfter, restSps).points - myBase;
      if (myGain <= 0) continue;
      const theirsAfter = swapRoster(snap, items, theirRoster, getIds, c.give, fas).after;
      const theirChange = simulate(ctx, theirsAfter, restSps).points - theirBase;
      const idea: Omit<TradeIdea, "reason"> = {
        teamId: team.id,
        teamName: teamName(snap, team.id),
        give: giveIds,
        get: getIds,
        myGain,
        myPlayoffGain: simulate(ctx, mineAfter, playoffSps).points - myPlayoffBase,
        theirChange,
        valueBack: c.valueBack,
        chance: chanceFor(c.valueBack, theirChange > 0),
      };
      ideas.push({ ...idea, reason: reasonFor(snap, edges, idea) });
    }
  }

  // Top ideas by Dylan's gain within each chance label, with some variety: at most two per team in a
  // label, and each target player at most twice overall.
  ideas.sort((a, b) => b.myGain - a.myGain);
  const picked: TradeIdea[] = [];
  const perTarget = new Map<number, number>();
  const seen = new Set<string>();
  for (const chance of CHANCES) {
    const perTeam = new Map<number, number>();
    let count = 0;
    for (const idea of ideas) {
      if (idea.chance !== chance) continue;
      const key = `${idea.teamId}|${idea.give.join(",")}|${idea.get.join(",")}`;
      if (seen.has(key)) continue;
      if ((perTeam.get(idea.teamId) ?? 0) >= MAX_PER_TEAM_PER_CHANCE) continue;
      if (idea.get.some((id) => (perTarget.get(id) ?? 0) >= 2)) continue;
      seen.add(key);
      perTeam.set(idea.teamId, (perTeam.get(idea.teamId) ?? 0) + 1);
      for (const id of idea.get) perTarget.set(id, (perTarget.get(id) ?? 0) + 1);
      picked.push(idea);
      if (++count === IDEAS_PER_CHANCE) break;
    }
  }
  return picked;
}

// Extra context beyond the players and numbers already on the card: where the league's scoring creates an edge.
function reasonFor(snap: Snapshot, edges: ReturnType<typeof leagueEdges>, idea: Omit<TradeIdea, "reason">): string {
  const parts: string[] = [];
  const edgeGet = idea.get.map((id) => ({ id, e: edges.get(id) })).find((x) => notableEdge(x.e) && x.e!.edge > 0);
  if (edgeGet) {
    parts.push(
      `${snap.players[edgeGet.id].name} ranks #${edgeGet.e!.leagueRank} in your scoring but #${edgeGet.e!.standardRank} in standard rankings, so his manager may value him less.`,
    );
  }
  const edgeGive = idea.give.map((id) => ({ id, e: edges.get(id) })).find((x) => notableEdge(x.e) && x.e!.edge < 0);
  if (edgeGive) {
    parts.push(
      `${snap.players[edgeGive.id].name} looks better in standard rankings (#${edgeGive.e!.standardRank}) than in your scoring (#${edgeGive.e!.leagueRank}), so he may sell well.`,
    );
  }
  return parts.join(" ");
}
