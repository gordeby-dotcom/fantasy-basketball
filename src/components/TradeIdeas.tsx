import Link from "next/link";
import { Pill, PlayerName } from "./ui";
import { formOf } from "@/lib/analysis/value";
import { pointsPerGame } from "@/lib/analysis/scoring";
import { pts, signed } from "@/lib/format";
import type { TradeIdea } from "@/lib/analysis/trades";
import type { Player, ScoringItem, Snapshot } from "@/lib/types";

const CHANCE_TONE = { fair: "good", stretch: "warn", "long shot": "bad" } as const;
const CHANCE_TEXT = { fair: "Fair offer", stretch: "Stretch", "long shot": "Long shot" } as const;

export function FormBadge({ player, items }: { player: Player; items: ScoringItem[] }) {
  const f = formOf(player, items);
  if (!f.trend || f.recentPpg === null) return null;
  return (
    <Pill tone={f.trend === "hot" ? "good" : "bad"}>
      {f.trend === "hot" ? "🔥" : "🧊"} {pts(f.recentPpg)}/g lately
    </Pill>
  );
}

const CHANCE_HEADING = {
  fair: { title: "Fair offers", text: "They get back about as much value as they give. The most realistic deals." },
  stretch: { title: "Stretch offers", text: "A bit in your favor. Worth asking, maybe with a small add-on." },
  "long shot": { title: "Long shots", text: "Big wins for you if they say yes. Expect a no or a counteroffer." },
} as const;

// Trade ideas in three groups (fair, stretch, long shot), best gain first within each.
export function GroupedTradeIdeas({ ideas, snap, items, perGroup }: { ideas: TradeIdea[]; snap: Snapshot; items: ScoringItem[]; perGroup?: number }) {
  return (
    <div className="flex flex-col gap-5">
      {(["fair", "stretch", "long shot"] as const).map((chance) => {
        const group = ideas.filter((i) => i.chance === chance);
        return (
          <section key={chance}>
            <h3 className="font-bold">{CHANCE_HEADING[chance].title}</h3>
            <p className="mb-2 text-sm text-muted">{CHANCE_HEADING[chance].text}</p>
            {group.length === 0 ? (
              <p className="text-sm text-muted">None right now.</p>
            ) : (
              <TradeIdeaList ideas={group} snap={snap} items={items} limit={perGroup} />
            )}
          </section>
        );
      })}
    </div>
  );
}

export function TradeIdeaList({ ideas, snap, items, limit }: { ideas: TradeIdea[]; snap: Snapshot; items: ScoringItem[]; limit?: number }) {
  const shown = limit ? ideas.slice(0, limit) : ideas;
  if (shown.length === 0) return <p className="text-muted">No trade beats your current roster right now.</p>;
  const line = (ids: number[]) =>
    ids.map((id) => snap.players[id]).filter(Boolean).map((p) => (
      <span key={p.id} className="flex flex-wrap items-center gap-x-2">
        <PlayerName player={p} /> <span className="text-xs text-muted">{pts(pointsPerGame(p, items))}/g</span>
        <FormBadge player={p} items={items} />
      </span>
    ));
  return (
    <ol className="flex flex-col gap-3">
      {shown.map((t) => (
        <li key={`${t.teamId}-${t.give.join(",")}-${t.get.join(",")}`} className="rounded-xl bg-bg p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm text-muted">with {t.teamName}</span>
            <Pill tone={CHANCE_TONE[t.chance]}>{CHANCE_TEXT[t.chance]}</Pill>
          </div>
          <div className="mt-1.5 flex gap-2">
            <span className="w-10 shrink-0 font-bold text-good">Get</span>
            <div className="min-w-0 flex-1">{line(t.get)}</div>
          </div>
          <div className="mt-1 flex gap-2">
            <span className="w-10 shrink-0 font-bold text-bad">Give</span>
            <div className="min-w-0 flex-1">{line(t.give)}</div>
          </div>
          <p className="mt-2 text-sm">
            <b className="text-good">{signed(t.myGain)}</b> points for you the rest of the season
            {Math.abs(t.myPlayoffGain) >= 5 ? ` (${signed(t.myPlayoffGain)} in the playoffs)` : ""}. They get back{" "}
            {Math.round(t.valueBack * 100)}% of the value by standard rankings.
          </p>
          {t.reason && <p className="mt-1 text-sm text-muted">{t.reason}</p>}
          <Link
            href={`/trade?give=${t.give.join(",")}&get=${t.get.join(",")}#check`}
            className="mt-2 inline-block text-sm font-semibold text-accent"
          >
            Check this trade →
          </Link>
        </li>
      ))}
    </ol>
  );
}
