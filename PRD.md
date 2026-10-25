# Fantasy Basketball Website — PRD

Oct 24, 2026 · @Gordon

## Overview

A personal fantasy basketball assistant that turns the weekly strategy from the [Fantasy bball call](https://notes.granola.ai/d/6fcf1bb2-9f37-4d9c-8721-8a069b3f4efd) into a repeatable routine: size up this week's opponent, find the categories worth fighting for, and add the free agents with the most games played. About three-quarters through the season it switches to playoff mode, ranking players by their games in the three fantasy playoff weeks and flagging trade targets.

The edge comes from volume. A player with 3–4 games in a week produces more bulk stats than one with 2, and in the playoffs a 4-4-4 schedule can matter more than star power. Today this work is manual and partly behind paid tools such as [Basketball Monster](https://basketballmonster.com).

## Goals and non-goals

The site wins Dylan more weekly matchups now and sets up his roster for the fantasy playoffs, while teaching him why each move works.

**Goals**

- Cut weekly prep to under 10 minutes: one page shows the opponent comparison and the best adds by games played.
- Raise games played per week versus the opponent, the main lever discussed on the call.
- Enter the fantasy playoffs with a roster weighted toward 4-4-4 and 4-4-3 schedules.
- Explain every recommendation in one plain sentence, so Dylan learns the strategy rather than just following it.

**Non-goals (v1)**

- Making roster moves on ESPN. The site recommends; Dylan adds, drops and trades in the ESPN app.
- Draft tools, other platforms (Yahoo, Sleeper) or other league managers.
- Building our own projection model. v1 uses Basketball Monster rankings and projections from Dylan's account.
- A public product or accounts for anyone other than Dylan.

## Target users

The site has one primary user, Dylan, and one supporting user, Gordon.

| User | Role | Needs |
| --- | --- | --- |
| Dylan | Manages his team in a private ESPN head-to-head points league | A quick weekly game plan, clear pickup and trade suggestions, and the reason behind each |
| Gordon | Builder, admin and co-coach | Sets up the ESPN connection, keeps the data pipeline running, reviews moves with Dylan |

Design for a young, non-technical user: short labels, big tap targets on a phone, no jargon without a one-line explainer (for example, "4-4-4 = four games in each of the three playoff weeks").

## User stories

The site supports two modes: a weekly routine during the regular season and a playoff pivot about three-quarters of the way through.

**Regular season (weekly)**

1. Before the matchup starts, Dylan sees his team versus this week's opponent: projected fantasy points overall and by stat, and games played on each side.
2. Dylan sees which stats he is likely to win, which are close, and which to give up on (for example, turnovers with a big-man-heavy roster).
3. Dylan sees a schedule grid of his roster and the top free agents, sorted by games this week, so he can stream players with 3–4 games.
4. Each suggested add or drop shows a reason, such as "4 games this week vs 2; +18 projected points."
5. Dylan sees which days his lineup has open slots or idle players, so games aren't wasted on the bench.

**Playoff pivot (from the trade deadline on)**

6. Dylan sees every rostered and available player's games in fantasy playoff weeks 1, 2 and 3 (for example 4-4-4, 4-4-3, 2-4-3).
7. Dylan gets flagged when a key player has a 2-game playoff week, with suggested trade targets who have better schedules.
8. Dylan enters a proposed trade (for example, Luka Dončić for Anthony Edwards plus a bench player) and sees the rest-of-season and playoff-week points for each side, with a verdict and reason.

## Functional requirements

All four features are in the MVP; the weekly tools ship first because the season is under way, and the playoff tools follow before the trade deadline.

**League scoring (applies to every feature)**

The league is head-to-head points. Projections must use Dylan's exact scoring, read from ESPN settings rather than hard-coded:

| Stat | Points |
| --- | --- |
| Free throw made | +0.5 |
| Block | +4 |
| Steal | +4 |
| Quadruple double | +6 |
| Triple double | +3 |
| Assist | +2 |
| Double double | +2 |
| Rebound | +1.5 |
| Point | +1 |
| Field goal made | +1 |
| Three-pointer made | +1 |
| Three-pointer missed | +0.5 |
| Free throw missed | −1 |
| Field goal missed | −1 |
| Turnover | −2 |
| Ejection | −2 |

**Requirements**

| ID | Feature | Requirement | Release |
| --- | --- | --- | --- |
| F1 | Sync | Pull league settings, Dylan's roster, opponent's roster, matchup schedule and free agents from ESPN at least daily, plus on demand | 1 |
| F2 | Games-played grid | Day-by-day grid for the current and next week: Dylan's roster and top 25 free agents, games per player, sortable by games and projected points | 1 |
| F3 | Games-played grid | Flag open lineup slots and days where more players have games than slots | 1 |
| F4 | Matchup analyzer | Projected weekly fantasy points for both teams, broken down by stat contribution, with games played remaining for each side | 1 |
| F5 | Matchup analyzer | Label each stat "winning", "close" or "concede" and suggest where an add helps most | 1 |
| F6 | Recommendations | Top 3 add/drop suggestions per week, each with a one-sentence reason | 1 |
| F7 | Playoff planner | Read fantasy playoff weeks from league settings; show each player's games in those three weeks (e.g. 4-4-4) | 2 |
| F8 | Playoff planner | Rank roster and free agents by projected points across the playoff weeks; flag any rostered player with a 2-game week | 2 |
| F9 | Trade evaluator | Enter players on each side; show rest-of-season and playoff-week projected points, net gain and a verdict with reason | 2 |
| F10 | Mode switch | Home page switches emphasis to playoff tools from the league's trade deadline (or about 75% of the season) | 2 |
| F11 | Explainers | Tap-to-open glossary for terms like streaming, punting and 4-4-4 | 1 |

## Data, integrations and technical considerations

The build is a small web app written with Claude Code that signs in to two of Dylan's accounts server-side: ESPN for league data and Basketball Monster for player rankings and projections. It combines them with the NBA schedule to score everything in his league's settings.

| Data | Source | Notes |
| --- | --- | --- |
| League settings, rosters, matchups, free agents | ESPN fantasy API (unofficial, read-only), via Dylan's ESPN sign-in | Private league access uses the `espn_s2` and `SWID` cookies from a logged-in ESPN session; endpoints are undocumented and can change |
| Player rankings, projections, schedule analysis | [Basketball Monster](https://basketballmonster.com), via Dylan's account | No public API: the app signs in and reads rankings and projection pages (or their CSV export), with his league's settings entered on the site |
| NBA game schedule | NBA public schedule feed | Drives games-per-week and playoff-week counts; cross-checked with Basketball Monster's schedule grid |
| Injury status | ESPN player data | Shown next to every recommendation |

Basketball Monster is the primary source for player value. ESPN supplies who is on which team and who is available; the app joins the two by player name and NBA team.

**Credentials (.env)**

Both sign-ins live in a `.env` file on the server, entered by Dylan at setup:

```
ESPN_LEAGUE_ID=
ESPN_SEASON=2027
ESPN_USERNAME=
ESPN_PASSWORD=
ESPN_S2=
ESPN_SWID=
BBM_USERNAME=
BBM_PASSWORD=
```

- `.env` is listed in `.gitignore` and never committed; a `.env.example` with blank values goes in the repo instead.
- On the host (Vercel or similar), the same values go in the project's environment variables, not in a file.
- Values are read only by server code and never sent to the browser or written to logs.

**Technical requirements**

- Host on Vercel (or similar) with a scheduled daily sync job and a manual "refresh" button.
- If a sign-in fails or a cookie expires, show a banner naming which account needs attention so Dylan can update `.env`.
- Cache synced data so the site loads in under 2 seconds on a phone.
- Mobile-first layout; Dylan will mostly check it on a phone.
- Password-protect the site (single shared login), since it holds league access.
- Wrap the ESPN client in one module so a format change is fixed in one place; show a clear "data out of date" banner if a sync fails.
- Keep scoring weights in config pulled from ESPN, so a league rule change needs no code change.

## Success metrics

Success is Dylan using it every week, out-gaming his opponents, and making the fantasy playoffs with a strong schedule.

| Metric | Target |
| --- | --- |
| Weekly use | Dylan opens the matchup page before every matchup week |
| Games played vs opponent | More games played than the opponent in most weeks after launch |
| Matchup record after launch | Better win rate than before launch |
| Playoff schedule | Most of the starting lineup has 3+ games in each fantasy playoff week |
| Understanding | Dylan can explain streaming and the 4-4-4 idea in his own words by the playoffs |
| Reliability | Data no more than 24 hours old on 95% of days |

## Milestones

Release 1 targets mid-November so Dylan gets most of the regular season; Release 2 must land before the league's trade deadline. Target dates assume evening and weekend build time.

1. **Week 1 (by early Nov):** ESPN connection working for Dylan's private league; settings, rosters and free agents syncing; scoring config loaded.
2. **Weeks 2–3 (by mid-Nov) — Release 1:** Games-played grid, matchup analyzer, add/drop suggestions with reasons, glossary. Deployed and password-protected.
3. **Weeks 4–6 (Dec):** Tune projections against actual results; fix whatever Dylan finds confusing.
4. **By late Jan — Release 2:** Playoff planner and trade evaluator, so trades can be made before the deadline.
5. **Trade deadline to playoffs:** Home page switches to playoff mode; weekly check-ins with Dylan.
6. **After the season:** Review metrics and decide on draft tools for 2027–28.

## Open questions

These need answers before or during Release 1.

- [ ] Points or categories? The call mentioned "9 cat" but also called it a points league with 16 scoring stats. Confirm the ESPN scoring type: in a points league, "punting" a stat means de-weighting it, not conceding a category.
- [ ] Confirm rebounds score +1.5 and quadruple doubles +6 (said on the call, not in the summary).
- [ ] What are the league's trade deadline and fantasy playoff weeks? These set the Release 2 date and the playoff planner's weeks.
- [ ] How many roster and lineup slots, and are there daily or weekly lineup locks? This affects the open-slot flag.
- [ ] Are free agents claimed via waivers or first-come? Waiver delays change which streaming adds are realistic.
- [ ] Does Basketball Monster's terms of use allow automated sign-in and reading of a subscriber's pages? If not, fall back to Dylan downloading the rankings CSV weekly and uploading it.
- [ ] ESPN's sign-in page often blocks scripted logins. Plan on the `ESPN_S2` and `ESPN_SWID` cookies doing the work, with username and password kept only as a backup. Who refreshes the cookies when they expire, roughly once a year?
- [ ] Is Dylan's Basketball Monster account a paid subscription, and which pages does it unlock (rankings, projections, schedule grid, trade analyzer)?
- [ ] Should Dylan's friends (other league managers) ever see it? v1 assumes no.

## Sources

- [Fantasy bball call, Granola notes and transcript](https://notes.granola.ai/d/6fcf1bb2-9f37-4d9c-8721-8a069b3f4efd), Oct 24, 2026
- Build decisions from Gordon in this session: users, ESPN private league, auto-sync, MVP scope, Claude Code, in-season timeline, plain-language reasons
