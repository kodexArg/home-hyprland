import { createComputed } from "ags"
import { agyUsageSnap, refreshAgyUsage, startAgyWatch } from "./agy"
import UsageBadge, { clampFraction, cycleElapsed, timeLeft } from "./UsageBadge"

const FIVE_HOURS_MS = 5 * 3_600_000
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

/** Antigravity CLI (agy) "other" models group (Claude/GPT): quota used 5 h / week.
 *  Same cache + timer as AgyMeter (~/.cache/kdx/agy_usage.json); no extra agy calls. */
export default function AgyOtherMeter() {
  startAgyWatch()
  const snap = agyUsageSnap
  const num = (v: number | null | undefined) => (typeof v === "number" ? v : null)
  const pctText = (v: number | null | undefined) => (typeof v === "number" ? `${v}%` : "--")
  const two = (n: number) => String(n).padStart(2, "0")
  /** Box clock is ART (America/Mendoza). */
  const hhmm = (iso?: string | null) => {
    if (!iso) return "--"
    const d = new Date(iso)
    return `${two(d.getHours())}:${two(d.getMinutes())} ART`
  }
  const dayHhmm = (iso?: string | null) => {
    if (!iso) return "--"
    const d = new Date(iso)
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${two(d.getHours())}:${two(d.getMinutes())} ART`
  }
  const modelsText = createComputed(() => {
    const s = snap()
    const models = s.other_models ?? []
    if (!models.length) return "Sin datos de modelos todavía (espera el próximo refresco)."
    const lines = models.map(
      (m) =>
        `${m}: 5 h ${pctText(s.other_five_hour_pct)} · sem ${pctText(s.other_week_pct)}\n` +
        `   reinicia 5 h ${hhmm(s.other_reset_iso)} · sem ${dayHhmm(s.other_week_reset_iso)}`,
    )
    if (!s.other_per_model) lines.push("agy solo da cifra de GRUPO: estos modelos comparten la misma cuota.")
    return lines.join("\n")
  })

  return (
    <UsageBadge
      icon="agy-other"
      tone="agyother"
      primary={{ value: createComputed(() => num(snap().other_five_hour_pct)), format: "percent" }}
      secondary={{ value: createComputed(() => num(snap().other_week_pct)), format: "percent" }}
      onRefresh={refreshAgyUsage}
      onOpen="https://antigravity.google"
      tip={{
        title: "agy · otros modelos",
        subtitle: createComputed(() => `${snap().other_group ?? "Claude and GPT models"} · dato ${snap().updated_at}`),
        rows: [
          {
            label: "Grupo · 5 h usado",
            value: createComputed(() => pctText(snap().other_five_hour_pct)),
            fraction: createComputed(() => clampFraction((num(snap().other_five_hour_pct) ?? 0) / 100)),
            detail: createComputed(() =>
              snap().other_reset_iso ? `reinicia ${hhmm(snap().other_reset_iso)} · ${timeLeft(snap().other_reset_iso)}` : "",
            ),
          },
          {
            label: "Tiempo de la sesión",
            value: createComputed(() => {
              const f = cycleElapsed(snap().other_reset_iso, FIVE_HOURS_MS)
              return f === null ? "--" : `${Math.round(f * 100)}%`
            }),
            fraction: createComputed(() => cycleElapsed(snap().other_reset_iso, FIVE_HOURS_MS)),
            kind: "time",
          },
          {
            label: "Grupo · semana usado",
            value: createComputed(() => pctText(snap().other_week_pct)),
            fraction: createComputed(() => clampFraction((num(snap().other_week_pct) ?? 0) / 100)),
            detail: createComputed(() =>
              snap().other_week_reset_iso
                ? `reinicia ${dayHhmm(snap().other_week_reset_iso)} · ${timeLeft(snap().other_week_reset_iso)}`
                : "",
            ),
          },
          {
            label: "Modelos (según agy /quota)",
            value: createComputed(() => `${(snap().other_models ?? []).length}`),
            fraction: createComputed(() => null),
            detail: modelsText,
          },
        ],
        error: createComputed(() => snap().error),
        stale: createComputed(() => Boolean(snap().stale)),
        hint: "Clic: refrescar cuota (agy /quota, 0 tokens) · Clic derecho: Antigravity",
      }}
    />
  )
}
