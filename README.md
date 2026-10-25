# Dylan's Game Plan

A private fantasy basketball assistant for Dylan's ESPN head-to-head points league. See [PRD.md](PRD.md) for the why.

Pages: **Home** (matchup; in the regular season, trade ideas, hot/cold and rest-of-season pickups; in playoff mode, games-this-week streaming first) · **Why** (why Dylan is winning or losing this week) · **Lineup** (bench manager: roster ranked by BBM vs ESPN, today's lineup fixes, daily best lineups by each source) · **Games** (day-by-day grid) · **Playoffs** (games in fantasy playoff weeks, trade targets) · **Trade** (trade finder across all teams, how the league's scoring differs from standard, buy-low targets, trade checker). 💡 in the header opens the glossary; tap any dotted-underlined word for a one-line explainer.

## How it works

- **ESPN** (`src/lib/espn/`): league settings, scoring, rosters, matchups, free agents, and the NBA schedule by fantasy day. All ESPN calls go through `src/lib/espn/client.ts`, so if ESPN changes its API, fix it there.
- **Basketball Monster** (`src/lib/bbm.ts`): per-game stats from the *Player Rankings 26-27* page (all players). They are blended with ESPN's projection by games played (BBM weight = games ÷ 10, full weight from 10 games), because a few games are a noisy sample. The raw numbers are compared, and ⚖️ marks players where the two differ by 4+ points per game and 12%+. Players BBM doesn't list fall back to ESPN.
- **Sync** (`src/lib/sync.ts`): joins the two by player name and team and stores one snapshot (Upstash Redis on Vercel, `.data/` locally). It runs daily via Vercel Cron at 10:00 UTC and on the **Refresh** button. If ESPN fails, the last good data stays up with a banner.
- **Player value**: BBM/ESPN blend, then 30% of the last-15-days line once a player has 5+ games in that window (`FORM_WEIGHT` in `sync.ts`).
- **Trade finder** (`src/lib/analysis/trades.ts`, run at sync time): 1-for-1, 2-for-1 and 1-for-2 trades with every team, ranked by Dylan's rest-of-season lineup points. The chance label compares the value the other team gives and gets back in ESPN standard scoring (fair ≥95%, stretch ≥85%, long shot ≥75%, lower not shown: `MIN_VALUE_BACK`).
- **Analysis** (`src/lib/analysis/`): pure functions. `lineup.ts` simulates Dylan's daily lineup (who starts given the slots), and everything else (matchup, adds/drops, playoff planner, trades) is built on it.
- **Weeks**: ESPN doesn't publish which days are in each matchup, so `parseMatchupPeriods` rebuilds them: Monday to Sunday, with the All-Star week merged into the next week. It's checked against ESPN's final fantasy day.

## Run locally

```bash
npm install
cp .env.example .env   # then fill it in
npm run dev
```

Open http://localhost:3000, sign in with `SITE_PASSWORD`, and press **Refresh**.

`npx tsx scripts/sample-snapshot.ts` writes sample data from ESPN's public player pool if you want to work on pages without the league.

### Getting the ESPN cookies

Sign in at fantasy.espn.com in a desktop browser, then go to DevTools → Application → Cookies → `espn.com`. Copy `espn_s2` into `ESPN_S2` and `SWID` (with the braces) into `ESPN_SWID`. They last about a year; when they expire, the site shows an ESPN banner.

## Deploy (Vercel)

1. In Vercel, **Add New → Project**, import `gordeby-dotcom/fantasy-basketball`, and keep the Next.js defaults. Production branch: `main`.
2. In the project's **Storage** tab, add **Upstash for Redis** (free plan) and connect it to the project. It adds `KV_REST_API_URL` / `KV_REST_API_TOKEN`, which the app reads. Without it, syncing fails with a "No cache store" banner, because Vercel's file system is read-only.
3. In **Settings → Environment Variables**, paste the values from `.env`: `ESPN_LEAGUE_ID`, `ESPN_SEASON`, `ESPN_S2`, `ESPN_SWID`, `BBM_USERNAME`, `BBM_PASSWORD`, `SITE_PASSWORD`, `AUTH_SECRET`, `CRON_SECRET`. The ESPN username and password aren't used, so leave them out.
4. Redeploy so the variables take effect, open the site, sign in with `SITE_PASSWORD`, and press **Load my league** once. After that, the daily cron (10:00 UTC, set in `vercel.json`) keeps the data fresh; Vercel sends `CRON_SECRET` with each run.

Every push to `main` redeploys.

## League facts (from ESPN, Oct 2026)

H2H points, scoring as in the PRD (REB +1.5, QD +6 confirmed). Daily lineup locks: PG, SG, SF, PF, C, G, F, 3 UTIL, 3 bench, 1 IR. 10 teams, 19 regular-season weeks, 8-team playoffs in weeks 20–22 (Mar 8–28, 2027). Trade deadline Feb 19, 2027. Waivers: 24 hours; the league setting allows 1 acquisition per matchup.
