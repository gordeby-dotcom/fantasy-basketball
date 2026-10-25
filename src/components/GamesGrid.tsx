"use client";

import { useState } from "react";
import { Term } from "./Term";
import { GapNote, PlayerName } from "./ui";
import { dayNum, dayShort, pts } from "@/lib/format";
import type { GridRow, GridView } from "@/lib/analysis/weekly";

type Sort = "games" | "points";

export function GamesGrid({ grid }: { grid: GridView }) {
  const [sort, setSort] = useState<Sort>("games");
  const order = (a: GridRow, b: GridRow) =>
    sort === "games" ? b.games - a.games || b.weekPoints - a.weekPoints : b.weekPoints - a.weekPoints;
  const mine = grid.rows.filter((r) => r.mine).sort(order);
  const fas = grid.rows.filter((r) => !r.mine).sort(order);
  const lineupBySp = new Map(grid.lineup.map((d) => [d.sp, d]));

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="text-muted">Sort by</span>
        {(["games", "points"] as Sort[]).map((s) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            className={`h-9 rounded-full px-4 font-semibold ${sort === s ? "bg-text text-bg" : "border border-line"}`}
          >
            {s === "games" ? "Games" : "Points"}
          </button>
        ))}
      </div>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[340px] table-fixed border-separate border-spacing-0 text-sm">
          <colgroup>
            <col className="w-[108px] sm:w-[220px]" />
            {grid.days.map((d) => (
              <col key={d.sp} className="w-[26px] sm:w-9" />
            ))}
            <col className="w-[26px] sm:w-10" />
            <col className="w-[36px] sm:w-12" />
          </colgroup>
          <thead>
            <tr className="text-xs text-muted">
              <th className="sticky left-0 z-10 bg-card py-2 pr-2 text-left font-medium">Player</th>
              {grid.days.map((d) => (
                <th key={d.sp} className={`py-2 text-center font-medium ${d.past ? "opacity-40" : ""}`}>
                  {dayShort(d.date).slice(0, 2)}
                  <br />
                  {dayNum(d.date)}
                </th>
              ))}
              <th className="py-2 text-center font-medium">G</th>
              <th className="py-2 text-right font-medium">Pts</th>
            </tr>
          </thead>
          <tbody>
            <Section label="Your team" colSpan={grid.days.length + 3} />
            {mine.map((r) => (
              <Row key={r.player.id} r={r} grid={grid} />
            ))}
            <tr>
              <td className="sticky left-0 z-10 bg-card py-2 pr-2 text-xs font-semibold">Lineup</td>
              {grid.days.map((d) => {
                const plan = lineupBySp.get(d.sp);
                if (!plan) return <td key={d.sp} />;
                const open = plan.openSlots;
                const benched = plan.benchedWithGame.length;
                return (
                  <td key={d.sp} className="py-2 text-center text-xs font-bold">
                    {benched > 0 ? (
                      <span className="text-bad" title={`${benched} with a game stuck on the bench`}>+{benched}</span>
                    ) : open > 0 ? (
                      <span className="text-warn" title={`${open} open lineup spots`}>{open}</span>
                    ) : (
                      <span className="text-good">✓</span>
                    )}
                  </td>
                );
              })}
              <td colSpan={2} />
            </tr>
            <Section label="Top free agents" colSpan={grid.days.length + 3} />
            {fas.map((r) => (
              <Row key={r.player.id} r={r} grid={grid} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        Lineup row: <span className="font-bold text-warn">3</span> = <Term k="openSlot">open spots</Term>,{" "}
        <span className="font-bold text-bad">+1</span> = <Term k="benched">players stuck on the bench</Term>,{" "}
        <span className="font-bold text-good">✓</span> = full. G = games left, Pts = <Term k="projected">projected points</Term>{" "}
        for them. WV = on waivers. ⚖️ = <Term k="sources">BBM and ESPN disagree</Term>.
      </p>
    </div>
  );
}

function Section({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="pb-1 pt-4 text-xs font-bold uppercase tracking-wide text-muted">
        {label}
      </td>
    </tr>
  );
}

function Row({ r, grid }: { r: GridRow; grid: GridView }) {
  const strong = r.games >= 3;
  return (
    <tr className="border-t border-line">
      <td className="sticky left-0 z-10 border-t border-line bg-card py-2 pr-2">
        <div className="flex min-w-0 flex-col">
          <PlayerName player={r.player} showTeam={false} />
          <span className="truncate text-xs text-muted">
            {r.player.proTeam} · {pts(r.ppg)}/g
            <span className="hidden sm:inline"> · {r.player.positions}</span>
            {r.player.status === "WAIVERS" && " · WV"}
          </span>
          <GapNote gap={r.gap} compact />
        </div>
      </td>
      {r.days.map((has, i) => (
        <td key={grid.days[i].sp} className={`border-t border-line text-center ${grid.days[i].past ? "opacity-30" : ""}`}>
          {has ? <span className={`inline-block h-2.5 w-2.5 rounded-full sm:h-3 sm:w-3 ${r.mine ? "bg-text" : "bg-accent"}`} /> : null}
        </td>
      ))}
      <td className={`border-t border-line text-center font-bold tabular ${strong ? "text-good" : ""}`}>{r.games}</td>
      <td className="border-t border-line text-right tabular">{pts(r.weekPoints)}</td>
    </tr>
  );
}
