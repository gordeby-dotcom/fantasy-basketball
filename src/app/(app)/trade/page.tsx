import { Card } from "@/components/ui";
import { Term } from "@/components/Term";
import { TradeForm, type TradePlayer } from "@/components/TradeForm";
import { pointsPerGame, projectionGap, scoringItems } from "@/lib/analysis/scoring";
import { getSnapshot } from "@/lib/sync";
import type { Snapshot } from "@/lib/types";

export default async function TradePage({ searchParams }: { searchParams: Promise<{ give?: string }> }) {
  const { give } = await searchParams;
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

  return (
    <div className="flex flex-col gap-4">
      <Card title="Trade check">
        <p className="text-sm text-muted">
          Pick who you&apos;d give and who you&apos;d get. We compare your <Term k="restOfSeason">rest of season</Term> and
          playoff-week points before and after, counting only players who&apos;d actually be in your lineup.
        </p>
      </Card>
      <TradeForm mine={mine} others={others} initialGive={give ? [Number(give)] : []} />
    </div>
  );
}
