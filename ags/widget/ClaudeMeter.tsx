import { createComputed } from "ags"
import { claudeUsageSnap, refreshClaudeUsage, reloadClaudeUsage, startClaudeWatch } from "./claude"
import UsageBadge, { clampFraction, pct } from "./UsageBadge"

/** Claude Max: chip = 5 h · 7 d. Tooltip: one flat bar per window + ↻ reset (no month / per-model: not in the meter). */
export default function ClaudeMeter() {
  startClaudeWatch()
  const snap = claudeUsageSnap
  const weekPct = (s = snap()) => s.week_pct ?? s.daily_pct
  const hasData = (s = snap()) => Boolean(s.fetched_at || s.sample_at)
  const live = <T,>(pick: () => T) => createComputed(() => (hasData() ? pick() : null))

  return (
    <UsageBadge
      icon="claude"
      tone="claude"
      primary={{ value: live(() => snap().five_hour_pct), format: "percent" }}
      secondary={{ value: live(() => weekPct()), format: "percent" }}
      onTipOpen={reloadClaudeUsage}
      onRefresh={refreshClaudeUsage}
      onOpen="https://claude.ai/settings/usage"
      tip={{
        title: "Claude Max",
        subtitle: createComputed(() => [snap().tier, snap().email].filter(Boolean).join(" · ")),
        rows: [
          {
            label: "5h",
            value: createComputed(() => (hasData() ? pct(snap().five_hour_pct) : "")),
            fraction: live(() => clampFraction(snap().five_hour_pct / 100)),
            reset: createComputed(() => snap().reset_iso),
          },
          {
            label: "7d",
            value: createComputed(() => (hasData() ? pct(weekPct()) : "")),
            fraction: live(() => clampFraction(weekPct() / 100)),
            reset: createComputed(() => snap().week_reset_iso),
          },
        ],
        error: createComputed(() => snap().error),
        stale: createComputed(() => Boolean(snap().stale)),
        actions: { refresh: "Actualizar ahora (uso de la cuenta personal)", open: "Abrir uso en claude.ai" },
      }}
    />
  )
}
