"use client";

import { useMemo, useState, useTransition } from "react";
import { runTrade } from "@/app/actions";
import { pts, signed } from "@/lib/format";
import { GapNote } from "./ui";
import type { TradeResult } from "@/lib/analysis/playoffs";
import type { ProjectionGap } from "@/lib/analysis/scoring";

export interface TradePlayer {
  id: number;
  name: string;
  proTeam: string;
  positions: string;
  ppg: number;
  teamName: string;
  gap: ProjectionGap | null;
}

export function TradeForm({ mine, others, initialGive }: { mine: TradePlayer[]; others: TradePlayer[]; initialGive: number[] }) {
  const [give, setGive] = useState<number[]>(initialGive.filter((id) => mine.some((p) => p.id === id)));
  const [get, setGet] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<TradeResult | null>(null);
  const [pending, start] = useTransition();

  const toggle = (list: number[], set: (v: number[]) => void, id: number) => {
    setResult(null);
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return others.slice(0, 8);
    return others.filter((p) => p.name.toLowerCase().includes(q) || p.teamName.toLowerCase().includes(q)).slice(0, 12);
  }, [others, query]);
  const byId = new Map([...mine, ...others].map((p) => [p.id, p]));

  return (
    <>
      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="text-lg font-bold">You give</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {mine.map((p) => (
            <Chip key={p.id} p={p} selected={give.includes(p.id)} onClick={() => toggle(give, setGive, p.id)} tone="bad" />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="text-lg font-bold">You get</h2>
        {get.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {get.map((id) => byId.get(id) && <Chip key={id} p={byId.get(id)!} selected onClick={() => toggle(get, setGet, id)} tone="good" />)}
          </div>
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a player or team"
          className="mt-3 h-12 w-full rounded-xl border border-line bg-bg px-4 text-base"
        />
        <ul className="mt-2 divide-y divide-line">
          {matches
            .filter((p) => !get.includes(p.id))
            .map((p) => (
              <li key={p.id}>
                <button onClick={() => toggle(get, setGet, p.id)} className="flex min-h-12 w-full items-center justify-between gap-2 py-2 text-left">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {p.proTeam} · {p.positions} · {p.teamName}
                    </span>
                    <GapNote gap={p.gap} />
                  </span>
                  <span className="shrink-0 text-sm tabular text-muted">{pts(p.ppg)}/g</span>
                </button>
              </li>
            ))}
        </ul>
      </section>

      <button
        disabled={pending || give.length === 0 || get.length === 0}
        onClick={() => start(async () => setResult(await runTrade(give, get)))}
        className="h-14 rounded-2xl bg-accent text-lg font-bold text-white disabled:opacity-40"
      >
        {pending ? "Checking…" : "Check this trade"}
      </button>

      {result && <Verdict r={result} disputed={[...give, ...get].map((id) => byId.get(id)).filter((p): p is TradePlayer => !!p?.gap)} />}
    </>
  );
}

function Chip({ p, selected, onClick, tone }: { p: TradePlayer; selected: boolean; onClick: () => void; tone: "good" | "bad" }) {
  const on = tone === "good" ? "border-good bg-good-soft text-good" : "border-bad bg-bad-soft text-bad";
  return (
    <button onClick={onClick} className={`min-h-11 rounded-full border px-3 text-sm font-semibold ${selected ? on : "border-line bg-bg"}`}>
      {selected ? "✓ " : ""}
      {p.name} <span className="font-normal opacity-70">{pts(p.ppg)}/g</span>
    </button>
  );
}

function Verdict({ r, disputed }: { r: TradeResult; disputed: TradePlayer[] }) {
  const tone = r.verdict === "accept" ? "border-good bg-good-soft" : r.verdict === "decline" ? "border-bad bg-bad-soft" : "border-warn bg-warn-soft";
  const title = r.verdict === "accept" ? "👍 Do it" : r.verdict === "decline" ? "👎 Pass" : "🤷 Toss-up";
  return (
    <section className={`rounded-2xl border p-4 ${tone}`}>
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mt-1">{r.reason}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-center">
        <Net label="Rest of season" net={r.restOfSeason.net} before={r.restOfSeason.before} />
        <Net label="Playoff weeks" net={r.playoffs.net} before={r.playoffs.before} />
      </div>
      {disputed.length > 0 && (
        <div className="mt-3 rounded-xl bg-card p-3 text-sm">
          <p className="font-semibold">Projections disagree on:</p>
          <ul className="mt-1">
            {disputed.map((p) => (
              <li key={p.id}>
                {p.name}: <GapNote gap={p.gap} />
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">The verdict uses Basketball Monster stats. Talk it through before trading.</p>
        </div>
      )}
    </section>
  );
}

function Net({ label, net, before }: { label: string; net: number; before: number }) {
  return (
    <div className="rounded-xl bg-card p-3">
      <p className="text-sm text-muted">{label}</p>
      <p className={`text-2xl font-bold tabular ${net >= 0 ? "text-good" : "text-bad"}`}>{signed(net)}</p>
      <p className="text-xs text-muted">from {pts(before)} pts</p>
    </div>
  );
}
