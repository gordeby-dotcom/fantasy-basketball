import { Card, GapNote, Pill, PlayerName } from "@/components/ui";
import { Term } from "@/components/Term";
import { injuryOpenings, minutesRisers } from "@/lib/analysis/opportunity";
import { projectionGap, scoringItems } from "@/lib/analysis/scoring";
import { waiverPriority, type WaiverPick } from "@/lib/analysis/waiver";
import { dayShort, monthDay, pts, signed } from "@/lib/format";
import { getSnapshot } from "@/lib/sync";
import type { Snapshot } from "@/lib/types";

const VOLUME_STYLE = {
  light: { box: "border-good bg-good-soft", text: "text-good", label: "Quiet" },
  normal: { box: "border-line bg-bg", text: "text-muted", label: "Normal" },
  heavy: { box: "border-warn bg-warn-soft", text: "text-warn", label: "Busy" },
} as const;

export default async function PickupsPage() {
  const snap = (await getSnapshot()) as Snapshot;
  const items = scoringItems(snap);
  const view = waiverPriority(snap, 10);
  const openings = injuryOpenings(snap);
  const risers = minutesRisers(snap);

  return (
    <div className="flex flex-col gap-4">
      <Card title="The next 7 nights">
        <p className="mb-3 text-sm text-muted">
          NBA games each night, and how many open spots your lineup has. <Term k="quietNight">Quiet nights</Term> are when a
          pickup&apos;s game is sure to count; on <Term k="busyNight">busy nights</Term> your lineup can fill up.
        </p>
        <ol className="grid grid-cols-7 gap-1 text-center">
          {view.nights.map((n) => {
            const style = VOLUME_STYLE[n.volume];
            const open = view.openSpotsByNight[n.sp] ?? 0;
            return (
              <li key={n.sp} className={`rounded-lg border px-0.5 py-1.5 ${style.box}`}>
                <p className="text-[11px] font-semibold">{dayShort(n.date)}</p>
                <p className="text-lg font-bold leading-tight tabular">{n.games}</p>
                <p className={`text-[10px] ${style.text}`}>{style.label}</p>
                <p className="mt-1 text-[10px] text-muted tabular">{open} open</p>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-xs text-muted">Top number: NBA games that night. Bottom: open spots in your lineup before any pickup.</p>
      </Card>

      <Card title="Claim first" aside={<span className="text-xs text-muted">Make these in the ESPN app</span>}>
        <p className="mb-3 text-sm text-muted">
          Ranked by points added to your lineup over the next 7 days, counting quiet and busy nights and any bigger role, plus
          each player&apos;s long-term value spread per week.
        </p>
        {view.picks.length === 0 ? (
          <p className="text-muted">No free agent beats your current roster right now.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {view.picks.map((p, i) => (
              <PickCard key={p.add.id} p={p} rank={i + 1} gap={projectionGap(snap.players[p.add.id], items)} />
            ))}
          </ol>
        )}
      </Card>

      <Card title="Injury openings">
        <p className="mb-3 text-sm text-muted">
          Teams missing a regular, and the free agents most likely to pick up those minutes. An{" "}
          <Term k="injuryOpening">injury opening</Term> lasts only until the starter returns.
        </p>
        {openings.length === 0 ? (
          <p className="text-muted">No big injury openings right now.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {openings.slice(0, 8).map((o) => (
              <li key={o.proTeamId} className="rounded-xl bg-bg p-3">
                <p className="font-bold">{o.proTeam}</p>
                <p className="text-sm">
                  <span className="font-semibold text-bad">Out:</span>{" "}
                  {o.injured.map((x) => `${x.player.name} (${Math.round(x.minutes)} min)`).join(", ")}
                </p>
                {o.beneficiaries.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-2">
                    {o.beneficiaries.map((b) => (
                      <li key={b.player.id} className="text-sm">
                        <span className="flex flex-wrap items-center gap-2">
                          <PlayerName player={b.player} />
                          <Pill tone="good">
                            {pts(b.ppgNow)} → {pts(b.roleValue)}/g
                          </Pill>
                        </span>
                        <span className="text-muted">{b.reason}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {o.yours.length > 0 && (
                  <p className="mt-2 text-sm text-good">Yours who may get more minutes: {o.yours.map((p) => p.name).join(", ")}.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Minutes rising">
        <p className="mb-3 text-sm text-muted">Free agents playing clearly more over the last week than their season average.</p>
        {risers.length === 0 ? (
          <p className="text-muted">No big minutes jumps right now.</p>
        ) : (
          <ul className="divide-y divide-line">
            {risers.map((r) => (
              <li key={r.player.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <PlayerName player={r.player} />
                  <span className="block text-xs text-muted tabular">
                    {Math.round(r.minutesBefore)} → {Math.round(r.minutesNow)} minutes a game
                  </span>
                </span>
                <Pill tone="good">
                  {pts(r.ppgNow)} → {pts(r.roleValue)}/g
                </Pill>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function PickCard({ p, rank, gap }: { p: WaiverPick; rank: number; gap: ReturnType<typeof projectionGap> }) {
  return (
    <li className="rounded-xl bg-bg p-3">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">{rank}</span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2">
            <span className="font-bold text-good">Add</span> <PlayerName player={p.add} /> <GapNote gap={gap} />
          </p>
          <p className="flex flex-wrap items-center gap-x-2 text-sm">
            <span className="font-bold text-bad">Drop</span> <PlayerName player={p.drop} showTeam={false} />
          </p>
          <p className="mt-1.5 text-sm">{p.reason}</p>
          {p.add.status === "WAIVERS" && p.add.waiverUntil && (
            <p className="mt-1 text-sm text-warn">
              On waivers until {monthDay(new Date(p.add.waiverUntil).toLocaleDateString("en-CA", { timeZone: "America/New_York" }))}.
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <Pill tone="good">{signed(p.next7Gain)}</Pill>
          <p className="mt-1 text-[10px] text-muted">this week</p>
          {p.restOfSeasonGain !== 0 && <p className="mt-1 text-[10px] text-muted tabular">{signed(p.restOfSeasonGain)} season</p>}
        </div>
      </div>
    </li>
  );
}
