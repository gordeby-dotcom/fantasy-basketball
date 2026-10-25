# Dylan's Game Plan

A private fantasy basketball assistant for Dylan's ESPN head-to-head points league. See [PRD.md](PRD.md) for the why.

Pages: **This week** (matchup, best adds/drops, stat-by-stat, lineup gaps) · **Why** (why Dylan is winning or losing this week: games vs points-per-game split, bench points, key stats, top scorers, players vs expectations; completed days from ESPN box scores) · **Games** (day-by-day grid for this and next week) · **Playoffs** (games in fantasy playoff weeks, trade targets) · **Trade** (evaluate a trade) · **Learn** (glossary). Tap any dotted-underlined word for a one-line explainer.

## How it works

- **ESPN** (`src/lib/espn/`): league settings, scoring, rosters, matchups, free agents, and the NBA schedule by fantasy day. All ESPN calls go through `src/lib/espn/client.ts`, so if ESPN changes its API, fix it there.
- **Basketball Monster** (`src/lib/bbm.ts`): per-game stats from the *Player Rankings 26-27* page (all players). They are blended with ESPN's projection by games played (BBM weight = games ÷ 10, full weight from 10 games), because a few games are a noisy sample. The raw numbers are compared, and ⚖️ marks players where the two differ by 4+ points per game and 12%+. Players BBM doesn't list fall back to ESPN.
- **Sync** (`src/lib/sync.ts`): joins the two by player name and team and stores one snapshot (Upstash Redis on Vercel, `.data/` locally). It runs daily via Vercel Cron at 10:00 UTC and on the **Refresh** button. If ESPN fails, the last good data stays up with a banner.
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

1. Push to a private GitHub repo and import it in Vercel.
2. Add Upstash Redis from the Vercel Marketplace (it sets `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`).
3. Add the other `.env` values as project environment variables. Use long random values for `AUTH_SECRET` and `CRON_SECRET`.
4. Deploy, sign in, and press Refresh once. The daily cron takes over from there.

## League facts (from ESPN, Oct 2026)

H2H points, scoring as in the PRD (REB +1.5, QD +6 confirmed). Daily lineup locks: PG, SG, SF, PF, C, G, F, 3 UTIL, 3 bench, 1 IR. 10 teams, 19 regular-season weeks, 8-team playoffs in weeks 20–22 (Mar 8–28, 2027). Trade deadline Feb 19, 2027. Waivers: 24 hours; the league setting allows 1 acquisition per matchup.
