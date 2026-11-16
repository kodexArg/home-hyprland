import { createComputed } from "ags"
import { claudeAlvsUsageSnap, refreshClaudeAlvsUsage, startClaudeAlvsWatch } from "./claude"
import UsageBadge, { clampFraction, cycleElapsed, timeLeft } from "./UsageBadge"

const FIVE_HOURS_MS = 5 * 3_600_000
const WEEK_MS = 7 * 86_400_000

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
      onRefresh={refreshClaudeAlvsUsage}
      onOpen="https://claude.ai/settings/usage"
      tip={{
        title: "Claude ALVS",
        subtitle: createComputed(() => {
          const s = snap()
          const src = s.source === "desktop" ? ` · dato Claude Desktop ${s.updated_at}` : s.stale ? ` · dato ${s.updated_at}` : ""
          return `${s.org} · ${s.tier} · ${s.email}${src}`
        }),
        rows: [
          {
            label: "Sesión 5 h",
            value: createComputed(() => (hasData() ? `${snap().five_hour_pct}%` : "--")),
            fraction: live(() => clampFraction(snap().five_hour_pct / 100)),
            detail: createComputed(() => (snap().reset_iso ? `reinicia ${snap().reset_str} · ${timeLeft(snap().reset_iso)}` : "")),
          },
          {
            label: "Tiempo de la sesión",
            value: createComputed(() => {
              const f = cycleElapsed(snap().reset_iso, FIVE_HOURS_MS)
              return f === null ? "--" : `${Math.round(f * 100)}%`
            }),
            fraction: createComputed(() => cycleElapsed(snap().reset_iso, FIVE_HOURS_MS)),
            kind: "time",
          },
          {
            label: "Semana (7 d)",
            value: createComputed(() => (hasData() ? `${weekPct()}%` : "--")),
            fraction: live(() => clampFraction(weekPct() / 100)),
            detail: createComputed(() =>
              snap().week_reset_str ? `reinicia ${snap().week_reset_str} · ${timeLeft(snap().week_reset_iso)}` : "",
            ),
          },
          {
            label: "Tiempo de la semana",
            value: createComputed(() => {
              const f = cycleElapsed(snap().week_reset_iso, WEEK_MS)
              return f === null ? "--" : `${Math.round(f * 100)}%`
            }),
            fraction: createComputed(() => cycleElapsed(snap().week_reset_iso, WEEK_MS)),
            kind: "time",
            days: 7,
          },
        ],
        error: createComputed(() => snap().error),
        stale: createComputed(() => Boolean(snap().stale)),
        hint: "Clic: refrescar · Clic derecho: uso en claude.ai",
      }}
    />
  )
}
