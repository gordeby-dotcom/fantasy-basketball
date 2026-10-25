import { injuryBadge } from "@/lib/format";
import type { ProjectionGap } from "@/lib/analysis/scoring";
import type { Player } from "@/lib/types";

// Shown when Basketball Monster and ESPN disagree about a player.
export function GapNote({ gap, compact = false }: { gap: ProjectionGap | null | undefined; compact?: boolean }) {
  if (!gap) return null;
  return (
    <span
      className="truncate text-xs text-warn"
      title={`Basketball Monster and ESPN disagree. Using ${Math.round(gap.used)}/g, a blend weighted by games played.`}
    >
      {compact
        ? `⚖️ ${Math.round(gap.bbm)} vs ${Math.round(gap.espn)}`
        : `⚖️ BBM ${Math.round(gap.bbm)}/g in ${gap.games} ${gap.games === 1 ? "game" : "games"} vs ESPN ${Math.round(gap.espn)}/g · using ${Math.round(gap.used)}`}
    </span>
  );
}

export function Card({ title, aside, children, className = "" }: { title?: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-card p-4 ${className}`}>
      {(title || aside) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-lg font-bold">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  accent: "bg-accent-soft text-accent",
  muted: "bg-bg text-muted",
} as const;

export function Pill({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

export function PlayerName({ player, showTeam = true }: { player: Player; showTeam?: boolean }) {
  const inj = injuryBadge(player.injuryStatus);
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
      <span className="truncate font-semibold">{player.name}</span>
      {inj && <Pill tone={inj.tone}>{inj.label}</Pill>}
      {showTeam && (
        <span className="shrink-0 text-xs text-muted">
          {player.proTeam} · {player.positions}
        </span>
      )}
    </span>
  );
}
