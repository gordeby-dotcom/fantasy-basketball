import Link from "next/link";
import { Card, PlayerName } from "@/components/ui";
import { Term } from "@/components/Term";
import { TradeForm, type TradePlayer } from "@/components/TradeForm";
import { GroupedTradeIdeas } from "@/components/TradeIdeas";
import { pointsPerGame, projectionGap, scoringItems } from "@/lib/analysis/scoring";
import { scoringDifferences, undervaluedTargets } from "@/lib/analysis/value";
import { getSnapshot } from "@/lib/sync";
import type { Snapshot } from "@/lib/types";

const ids = (s?: string) => (s ? s.split(",").map(Number).filter(Boolean) : []);

export default async function TradePage({ searchParams }: { searchParams: Promise<{ give?: string; get?: string; team?: string }> }) {
  const { give, get, team } = await searchParams;
  const snap = (await getSnapshot()) as Snapshot;
  const items = scoringItems(snap);
  const teamNames = new Map(snap.teams.map((t) => [t.id, t.name]));
  const toOption = (id: number): TradePlayer | null => {
    const p = snap.players[id];
    if (!p) return null;
    return {
      id: p.id,
      name: p.name,
      proTeam: p.proTeam,
      positions: p.positions,
      ppg: pointsPerGame(p, items),
      teamName: teamNames.get(p.onTeamId) ?? "",
      gap: projectionGap(p, items),
    };
  };
  const byPpg = (a: TradePlayer, b: TradePlayer) => b.ppg - a.ppg;
  const mine = (snap.teams.find((t) => t.id === snap.myTeamId)?.rosterIds ?? []).map(toOption).filter((p): p is TradePlayer => !!p).sort(byPpg);
  const others = snap.teams
    .filter((t) => t.id !== snap.myTeamId)
    .flatMap((t) => t.rosterIds.map(toOption))
    .filter((p): p is TradePlayer => !!p)
    .sort(byPpg);

  const ideas = snap.tradeIdeas ?? [];
  const teamFilter = team ? Number(team) : null;
  const shown = teamFilter ? ideas.filter((i) => i.teamId === teamFilter) : ideas;
  const ideaTeams = [...new Set(ideas.map((i) => i.teamId))];
  const diffs = scoringDifferences(snap);
  const targets = undervaluedTargets(snap);

  return (
    <div className="flex flex-col gap-4">
      <Card title="Trade ideas">
        <p className="mb-3 text-sm text-muted">
          Trades with every team that add the most <Term k="restOfSeason">rest-of-season</Term> points to your lineup, using your
          league&apos;s scoring and how players are playing lately. Five of each kind, from realistic to long shots, judged by how much value the other team gets back.
        </p>
        {ideaTeams.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-2">
            <FilterChip href="/trade" active={!teamFilter} label="All teams" />
            {ideaTeams.map((id) => (
              <FilterChip key={id} href={`/trade?team=${id}`} active={teamFilter === id} label={teamNames.get(id) ?? `Team ${id}`} />
            ))}
          </div>
        )}
        <GroupedTradeIdeas ideas={shown} snap={snap} items={items} />
      </Card>

      {diffs.length > 0 && (
        <Card title="How your league scores">
          <p className="mb-2 text-sm text-muted">
            Compared with ESPN&apos;s standard points scoring, which most rankings use. Players strong in these stats are worth more to you
            than their ranking suggests.
          </p>
          <ul className="divide-y divide-line text-sm">
            {diffs.map((d) => (
              <li key={d.stat} className="flex items-center justify-between gap-2 py-2">
                <span>{d.stat}</span>
                <span className="text-right">
                  <b className="tabular">{d.league > 0 ? `+${d.league}` : d.league}</b>
                  <span className="text-muted"> vs {d.standard === null ? "none" : d.standard > 0 ? `+${d.standard}` : d.standard}</span>
                  <span className={`block text-xs ${d.note.includes("more") || d.note.startsWith("Bonus") ? "text-good" : "text-bad"}`}>{d.note}</span>
                </span>
              </li>
            ))}
          </ul>
          {targets.length > 0 && (
            <>
              <h3 className="mt-4 font-bold">Worth more in your league</h3>
              <p className="text-sm text-muted">Their managers may value them by standard rankings, so they can be cheap to get.</p>
              <ul className="mt-1 divide-y divide-line text-sm">
                {targets.map(({ player, edge }) => (
                  <li key={player.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <PlayerName player={player} />
                      <span className="block truncate text-xs text-muted">{teamNames.get(player.onTeamId) ?? "Free agent"}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs tabular">
                      <b className="text-good">#{edge.leagueRank}</b> here
                      <span className="block text-muted">#{edge.standardRank} standard</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      <div id="check" className="scroll-mt-4">
        <Card title="Check a trade">
          <p className="text-sm text-muted">
            Pick who you&apos;d give and who you&apos;d get. We compare your rest-of-season and playoff-week points before and after,
            counting only players who&apos;d actually be in your lineup.
          </p>
        </Card>
      </div>
      <TradeForm key={`${give ?? ""}|${get ?? ""}`} mine={mine} others={others} initialGive={ids(give)} initialGet={ids(get)} />
    </div>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} className={`flex h-9 items-center rounded-full px-3 text-sm font-semibold ${active ? "bg-text text-bg" : "border border-line"}`}>
      {label}
    </Link>
  );
}
