import { createComputed } from "ags"
import { agyUsageSnap, refreshAgyUsage, startAgyWatch } from "./agy"
import UsageBadge, { clampFraction, cycleElapsed, timeLeft } from "./UsageBadge"

const FIVE_HOURS_MS = 5 * 3_600_000
const WEEK_MS = 7 * 86_400_000
const DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

/** Antigravity CLI (agy): Gemini 4 Argon quota used. Mismo icono blanco (antigravity), foco en Argon. */
export default function AgyMeter() {
  startAgyWatch()
  const snap = agyUsageSnap
  const num = (v: number | null | undefined) => (typeof v === "number" ? v : null)
  const pctText = (v: number | null | undefined) => (typeof v === "number" ? `${v}%` : "--")
  const two = (n: number) => String(n).padStart(2, "0")

  const formatIso = (iso?: string | null) => {
    if (!iso) return "--"
    const d = new Date(iso)
    const day = DAYS[d.getDay()]
    const month = MONTHS[d.getMonth()]
    return `${day} ${d.getDate()} ${month} ${two(d.getHours())}:${two(d.getMinutes())} ART`
  }

  const primaryValue = createComputed(() => {
    const s = snap()
    return s.argon_five_hour_pct != null ? num(s.argon_five_hour_pct) : num(s.argon_week_pct)
  })

  const secondaryValue = createComputed(() => {
    const s = snap()
    return s.argon_five_hour_pct != null ? num(s.argon_week_pct) : null
  })

  const isExhausted = createComputed(() => (snap().argon_week_pct ?? 0) >= 100)

  return (
    <UsageBadge
      icon="antigravity"
      tone="gemini"
      primary={{ value: primaryValue, format: "percent" }}
      secondary={{ value: secondaryValue, format: "percent" }}
      onRefresh={refreshAgyUsage}
      onOpen="https://antigravity.google"
      tip={{
        title: "Antigravity · Gemini 4 Argon",
        subtitle: createComputed(() => {
          const s = snap()
          const state = isExhausted() ? "Límite semanal alcanzado" : "Cuota semanal activa"
          return `${state} · dato ${s.updated_at}`
        }),
        rows: [
          {
            label: "Argon · semana usado",
            value: createComputed(() => (isExhausted() ? "100% (límite)" : pctText(snap().argon_week_pct))),
            fraction: createComputed(() => clampFraction((num(snap().argon_week_pct) ?? 0) / 100)),
            detail: createComputed(() =>
              snap().argon_week_reset_iso
                ? `reinicia ${formatIso(snap().argon_week_reset_iso)} (${timeLeft(snap().argon_week_reset_iso)})`
                : "",
            ),
          },
          {
            label: "Tiempo del ciclo (7 d)",
            value: createComputed(() => {
              const f = cycleElapsed(snap().argon_week_reset_iso, WEEK_MS)
              return f === null ? "--" : `${Math.round(f * 100)}% transcurrido`
            }),
            fraction: createComputed(() => cycleElapsed(snap().argon_week_reset_iso, WEEK_MS)),
            kind: "time",
            days: 7,
            detail: createComputed(() => "Argon tiene cuota semanal propia e independiente de Gemini general"),
          },
          {
            label: "Gemini general · 5 h / sem",
            value: createComputed(() => `${pctText(snap().five_hour_pct)} / ${pctText(snap().week_pct)}`),
            fraction: createComputed(() => clampFraction((num(snap().five_hour_pct) ?? 0) / 100)),
            detail: createComputed(() => {
              const models = (snap().gemini_models ?? ["Flash", "Pro"]).join(", ")
              const reset = snap().reset_iso ? ` · 5 h reinicia ${formatIso(snap().reset_iso)}` : ""
              return `Modelos: ${models}${reset}`
            }),
          },
          {
            label: "Modelo activo en agy",
            value: createComputed(() => snap().model_short || "--"),
            fraction: createComputed(() => null),
            detail: createComputed(() => snap().model || "Configurado en Antigravity CLI"),
          },
        ],
        error: createComputed(() => snap().error),
        stale: createComputed(() => Boolean(snap().stale)),
        hint: "Clic: refrescar cuota (agy /quota, 0 tokens) · Clic derecho: Antigravity",
      }}
    />
  )
}
