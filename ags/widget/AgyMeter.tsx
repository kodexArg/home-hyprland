import { createComputed } from "ags"
import { agyUsageSnap, refreshAgyUsage, startAgyWatch } from "./agy"
import UsageBadge, { clampFraction, cycleElapsed, timeLeft } from "./UsageBadge"

const FIVE_HOURS_MS = 5 * 3_600_000
const WEEK_MS = 7 * 86_400_000

/** Antigravity CLI (agy): Gemini quota used (5 h / week); active model only in the tooltip. */
export default function AgyMeter() {
  startAgyWatch()
  const snap = agyUsageSnap
  const num = (v: number | null | undefined) => (typeof v === "number" ? v : null)
  const pctText = (v: number | null | undefined) => (typeof v === "number" ? `${v}%` : "--")
  const resetDetail = (iso?: string | null) => {
    if (!iso) return ""
    const d = new Date(iso)
    const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    return `reinicia ${hhmm} · ${timeLeft(iso)}`
  }

  return (
    <UsageBadge
      icon="gemini"
      tone="gemini"
      primary={{ value: createComputed(() => num(snap().five_hour_pct)), format: "percent" }}
      secondary={{ value: createComputed(() => num(snap().week_pct)), format: "percent" }}
      onRefresh={refreshAgyUsage}
      onOpen="https://antigravity.google"
      tip={{
        title: "Antigravity (agy)",
        subtitle: createComputed(() => `${snap().model} · dato ${snap().updated_at}`),
        rows: [
          {
            label: "Gemini · 5 h usado",
            value: createComputed(() => pctText(snap().five_hour_pct)),
            fraction: createComputed(() => clampFraction((num(snap().five_hour_pct) ?? 0) / 100)),
            detail: createComputed(() => resetDetail(snap().reset_iso)),
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
            label: "Gemini · semana usado",
            value: createComputed(() => pctText(snap().week_pct)),
            fraction: createComputed(() => clampFraction((num(snap().week_pct) ?? 0) / 100)),
            detail: createComputed(() => resetDetail(snap().week_reset_iso)),
          },
          {
            label: "Claude/GPT en agy · 5 h / sem",
            value: createComputed(() => `${pctText(snap().other_five_hour_pct)} / ${pctText(snap().other_week_pct)}`),
            fraction: createComputed(() => null),
          },
        ],
        error: createComputed(() => snap().error),
        stale: createComputed(() => Boolean(snap().stale)),
        hint: "Clic: refrescar cuota (agy /quota, 0 tokens) · Clic derecho: Antigravity",
      }}
    />
  )
}
