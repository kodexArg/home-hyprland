import { createComputed } from "ags"
import { claudeAlvsUsageSnap, refreshClaudeAlvsUsage, reloadClaudeAlvsUsage, startClaudeAlvsWatch } from "./claude"
import UsageBadge, { clampFraction, pct } from "./UsageBadge"

/** Claude ALVS: chip = 5 h · 7 d. Tooltip: one flat bar per window + ↻ reset (no month / per-model: not in the meter). */
export default function ClaudeAlvsMeter() {
  startClaudeAlvsWatch()
  const snap = claudeAlvsUsageSnap
  const weekPct = (s = snap()) => s.week_pct ?? s.daily_pct
  const hasData = (s = snap()) => Boolean(s.fetched_at || s.sample_at)
  const live = <T,>(pick: () => T) => createComputed(() => (hasData() ? pick() : null))

  return (
    <UsageBadge
      icon="claude-alvs"
      tone="claude"
      primary={{ value: live(() => snap().five_hour_pct), format: "percent" }}
      secondary={{ value: live(() => weekPct()), format: "percent" }}
      onTipOpen={reloadClaudeAlvsUsage}
      onRefresh={refreshClaudeAlvsUsage}
      onOpen="https://claude.ai/settings/usage"
      tip={{
        title: "Claude ALVS",
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
        actions: { refresh: "Actualizar ahora (uso de la cuenta ALVS)", open: "Abrir uso en claude.ai" },
      }}
    />
  )
}
