import { Card, Pill } from "@/components/ui";
import { Term } from "@/components/Term";
import { analyzeWhy, type PlayerWeek, type WhyView } from "@/lib/analysis/why";
import { dayShort, monthDay, pts, signed } from "@/lib/format";
import { getSnapshot } from "@/lib/sync";
import type { Snapshot } from "@/lib/types";

export default async function WhyPage() {
  const snap = (await getSnapshot()) as Snapshot;
  const v = analyzeWhy(snap);
  const tone = v.margin > 0 ? "good" : v.margin < 0 ? "bad" : "muted";
  const lastDay = v.days.at(-1)?.date;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="text-sm text-muted">
          Week {v.period} vs {v.opponentName}
          {lastDay ? ` · through ${dayShort(lastDay)} ${monthDay(lastDay)}` : ""}
        </p>
        <h2 className={`mt-1 text-3xl font-bold ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>{v.headline}</h2>
        {v.hasActuals && (
          <p className="mt-1 text-lg tabular">
            <b>{pts(v.mine.points)}</b> <span className="text-muted">to</span> <b>{pts(v.theirs.points)}</b>
          </p>
        )}
        <p className="mt-2">{v.summary}</p>
        {v.daysLeft > 0 && (
          <p className="mt-2 text-sm text-muted">
            {v.daysLeft} {v.daysLeft === 1 ? "day" : "days"} left · <Term k="gamesPlayed">games left</Term>: {v.gamesLeft.mine} for you, {v.gamesLeft.theirs} for them
          </p>
        )}
      </Card>

      {v.split && <SplitCard v={v} />}

      <Card title="What made the difference">
        {v.reasons.length === 0 ? (
          <p className="text-muted">Nothing stands out yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {v.reasons.map((r) => (
              <li key={r.title} className="flex items-start gap-3 rounded-xl bg-bg p-3">
                <Pill tone={r.impact >= 0 ? "good" : "bad"}>{signed(r.impact)}</Pill>
                <div className="min-w-0">
                  <p className="font-semibold">{r.title}</p>
                  <p className="text-sm text-muted">{r.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">
          + helped you, − hurt you, in fantasy points. Bench numbers are points you <i>could</i> have had.
        </p>
      </Card>

      {v.days.length > 0 && (
        <Card title="Day by day">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="py-1 text-left font-medium">Day</th>
                <th className="py-1 text-right font-medium">You</th>
                <th className="py-1 text-right font-medium">Them</th>
                <th className="py-1 text-right font-medium">+/−</th>
              </tr>
            </thead>
            <tbody>
              {v.days.map((d) => (
                <tr key={d.date} className="border-t border-line">
                  <td className="py-2">
                    {dayShort(d.date)} {monthDay(d.date)}
                  </td>
                  <td className="py-2 text-right tabular">{pts(d.mine)}</td>
                  <td className="py-2 text-right tabular">{pts(d.theirs)}</td>
                  <td className={`py-2 text-right font-semibold tabular ${d.mine >= d.theirs ? "text-good" : "text-bad"}`}>{signed(d.mine - d.theirs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {v.stats.length > 0 && (
        <Card title="Stats that swung it" aside={<span className="text-xs text-muted">Fantasy points from starters</span>}>
          <ul className="divide-y divide-line">
            {v.stats.map((s) => (
              <li key={s.statId} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>{s.name}</span>
                <span className="tabular">
                  <b>{pts(s.mine)}</b> <span className="text-muted">vs {pts(s.theirs)}</span>{" "}
                  <span className={`ml-1 font-semibold ${s.diff >= 0 ? "text-good" : "text-bad"}`}>{signed(s.diff)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(v.myStars.length > 0 || v.theirStars.length > 0) && (
        <Card title="Top scorers">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Stars label="Yours" players={v.myStars} />
            <Stars label="Theirs" players={v.theirStars} />
          </div>
        </Card>
      )}

      {v.surprises.length > 0 && (
        <Card title="Better or worse than expected">
          <ul className="divide-y divide-line">
            {v.surprises.map((p) => {
              const diff = p.perGame - (p.projected ?? 0);
              return (
                <li key={p.playerId} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold">{p.name}</span>
                    <span className="block text-xs text-muted">
                      {pts(p.perGame)}/g in {p.games} {p.games === 1 ? "game" : "games"}, expected {pts(p.projected ?? 0)}/g
                    </span>
                  </span>
                  <Pill tone={diff >= 0 ? "good" : "bad"}>{signed(diff)}/g</Pill>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">One or two games can be a fluke, so don&apos;t drop someone over a bad night.</p>
        </Card>
      )}
    </div>
  );
}

// The margin split into its two parts: how many games each lineup used, and how well each scored per game.
function SplitCard({ v }: { v: WhyView }) {
  const split = v.split!;
  const max = Math.max(Math.abs(split.games), Math.abs(split.perGame), 1);
  const rows = [
    { label: "Games played", value: split.games, note: `${v.mine.startedGames} vs ${v.theirs.startedGames} games` },
    { label: "Points per game", value: split.perGame, note: `${pts(v.mine.perGame)} vs ${pts(v.theirs.perGame)} per game` },
  ];
  return (
    <Card title="Where the gap comes from">
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold">{r.label}</span>
              <span className={`font-bold tabular ${r.value >= 0 ? "text-good" : "text-bad"}`}>{signed(r.value)}</span>
            </div>
            <div className="relative mt-1 h-3 rounded-full bg-bg">
              <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
              <span
                className={`absolute inset-y-0 rounded-full ${r.value >= 0 ? "left-1/2 bg-good" : "right-1/2 bg-bad"}`}
                style={{ width: `${(Math.abs(r.value) / max) * 50}%` }}
              />
            </div>
            <p className="mt-0.5 text-xs text-muted">{r.note}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm">
        Together: <b className="tabular">{signed(v.margin)}</b>.{" "}
        <span className="text-muted">
          More <Term k="gamesPlayed">games played</Term> is the lever you control with <Term k="streaming">streaming</Term>.
        </span>
      </p>
    </Card>
  );
}

function Stars({ label, players }: { label: string; players: PlayerWeek[] }) {
  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-muted">{label}</p>
      <ol className="flex flex-col gap-1 text-sm">
        {players.map((p) => (
          <li key={p.playerId} className="flex justify-between gap-2">
            <span className="truncate">{p.name}</span>
            <span className="shrink-0 tabular text-muted">
              <b className="text-text">{pts(p.points)}</b> in {p.games}g
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
