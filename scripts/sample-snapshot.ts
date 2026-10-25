// Builds a sample snapshot from ESPN's public player pool and NBA schedule, split into made-up teams.
// For developing the pages before the real league is connected:  npx tsx scripts/sample-snapshot.ts
import { promises as fs } from "fs";
import { parseMatchupPeriods, parsePlayer, parseProSchedule } from "../src/lib/espn/parse";
import { DEFAULT_POINTS } from "../src/lib/espn/constants";
import type { Player, Snapshot } from "../src/lib/types";

const SEASON = 2027;
const BASE = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${SEASON}`;

async function main() {
  const filter = { players: { limit: 260, sortPercOwned: { sortPriority: 1, sortAsc: false } } };
  const [pool, sched] = await Promise.all([
    fetch(`${BASE}/segments/0/leaguedefaults/1?view=kona_player_info`, { headers: { "X-Fantasy-Filter": JSON.stringify(filter) } }).then((r) => r.json()),
    fetch(`${BASE}?view=proTeamSchedules_wl`).then((r) => r.json()),
  ]);
  const { proGames, scoringPeriodDates } = parseProSchedule(sched.settings.proTeams);
  const matchupPeriods = parseMatchupPeriods({}, scoringPeriodDates, proGames);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const currentScoringPeriod = Number(Object.entries(scoringPeriodDates).find(([, d]) => d >= today)?.[0] ?? 1);
  const currentMatchupPeriod = Number(Object.entries(matchupPeriods).find(([, sps]) => sps.includes(currentScoringPeriod))?.[0] ?? 1);

  const teamNames = ["Dylan's Dunkers", "Bench Mob", "Triple Threat", "Pick & Roll", "Fast Break", "Full Court Press", "Alley Oops", "Splash Bros", "Glass Cleaners", "Buzzer Beaters"];
  const players: Record<number, Player> = {};
  const rosters: number[][] = teamNames.map(() => []);
  const all = pool.players.map((e: unknown) => parsePlayer(e, SEASON)).filter((p: Player) => p.projSource !== "none");
  all.forEach((p: Player, i: number) => {
    const round = Math.floor(i / teamNames.length);
    if (round < 13) {
      const t = round % 2 === 0 ? i % teamNames.length : teamNames.length - 1 - (i % teamNames.length);
      rosters[t].push(p.id);
      players[p.id] = { ...p, onTeamId: t + 1, status: "ONTEAM", lineupSlotId: rosters[t].length <= 10 ? 11 : 12 };
    } else {
      players[p.id] = { ...p, onTeamId: 0, status: "FREEAGENT", lineupSlotId: undefined };
    }
  });

  const regular = 19;
  const matchups: Snapshot["matchups"] = [];
  for (let mp = 1; mp <= regular; mp++) {
    const ids = teamNames.map((_, i) => i + 1);
    const rot = [ids[0], ...ids.slice(1).slice(mp % 9), ...ids.slice(1).slice(0, mp % 9)];
    for (let i = 0; i < 5; i++) matchups.push({ matchupPeriodId: mp, homeTeamId: rot[i], awayTeamId: rot[9 - i], homePoints: mp === currentMatchupPeriod ? 410 + i * 37 : 0, awayPoints: mp === currentMatchupPeriod ? 395 + i * 41 : 0 });
  }

  const snap: Snapshot = {
    syncedAt: Date.now(),
    season: SEASON,
    leagueName: "Sample League",
    scoringType: "H2H_POINTS",
    scoring: Object.entries(DEFAULT_POINTS).map(([statId, points]) => ({ statId: Number(statId), points, isReverse: false })),
    lineupSlotCounts: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 11: 3, 12: 3, 13: 1 },
    lineupLockType: "INDIVIDUAL_GAME",
    acquisition: { waiverHours: 0, usesBudget: false },
    currentScoringPeriod,
    currentMatchupPeriod,
    scoringPeriodDates,
    matchupPeriods,
    regularSeasonMatchupPeriods: regular,
    playoffMatchupPeriods: [regular + 1, regular + 2, regular + 3],
    tradeDeadline: Date.UTC(2027, 1, 5),
    myTeamId: 1,
    teams: teamNames.map((name, i) => ({ id: i + 1, name, abbrev: name.slice(0, 4).toUpperCase(), owners: [], rosterIds: rosters[i] })),
    matchups,
    players,
    proGames,
    sources: {
      espn: { ok: false, at: Date.now(), message: "Sample data, not Dylan's league yet. Fill in .env and press Refresh." },
      bbm: { ok: false, at: Date.now(), message: "Basketball Monster isn't connected yet. Using ESPN projections." },
    },
  };
  await fs.mkdir(".data", { recursive: true });
  await fs.writeFile(".data/snapshot.json", JSON.stringify(snap));
  console.log(`Wrote .data/snapshot.json: ${Object.keys(players).length} players, week ${currentMatchupPeriod}, day ${currentScoringPeriod}`);
  console.log("Weeks:", Object.entries(matchupPeriods).slice(0, 3).map(([k, v]) => `${k}: ${scoringPeriodDates[v[0]]}..${scoringPeriodDates[v[v.length - 1]]}`).join(" | "));
}
main();
