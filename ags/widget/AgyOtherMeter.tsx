import { createComputed } from "ags"
import { agyUsageSnap, refreshAgyUsage, startAgyWatch } from "./agy"
import UsageBadge, { clampFraction, cycleElapsed, timeLeft } from "./UsageBadge"

const FIVE_HOURS_MS = 5 * 3_600_000
const WEEK_MS = 7 * 86_400_000
const DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

/** Antigravity CLI (agy) "other models" group (Claude Opus 5.5, Sonnet, GPT-OSS): quota used 5 h / week.
 *  Mismo diseño y dígitos morados; icono de AGY en naranja (#ff8c42). */
export default function AgyOtherMeter() {
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

  const formatTimeOnly = (iso?: string | null) => {
    if (!iso) return "--"
    const d = new Date(iso)
    return `${two(d.getHours())}:${two(d.getMinutes())} ART`
  }

  return (
    <UsageBadge
      icon="agy-other"
      tone="agyother"
      primary={{ value: createComputed(() => num(snap().other_week_pct)), format: "percent" }}
      onRefresh={refreshAgyUsage}
      onOpen="https://antigravity.google"
      tip={{
        title: "Antigravity · Other models (Opus 5.5)",
        subtitle: createComputed(() => {
          const s = snap()
          const active = s.model.toLowerCase().includes("opus")
            ? `Activo: ${s.model}`
            : (s.other_group ?? "Claude and GPT models")
          return `${active} · dato ${s.updated_at}`
        }),
        rows: [
          {
            label: "Opus 5.5 / 3P · Semana (7 d)",
            value: createComputed(() => `${pctText(snap().other_week_pct)} usado`),
            fraction: createComputed(() => clampFraction((num(snap().other_week_pct) ?? 0) / 100)),
            detail: createComputed(() =>
              snap().other_week_reset_iso
                ? `reinicia ${formatIso(snap().other_week_reset_iso)} (${timeLeft(snap().other_week_reset_iso)})`
                : "",
            ),
          },
          {
            label: "Tiempo de la semana (7 d)",
            value: createComputed(() => {
              const f = cycleElapsed(snap().other_week_reset_iso, WEEK_MS)
              return f === null ? "--" : `${Math.round(f * 100)}% transcurrido`
            }),
            fraction: createComputed(() => cycleElapsed(snap().other_week_reset_iso, WEEK_MS)),
            kind: "time",
            days: 7,
            detail: createComputed(() => "Límite ligado directamente a tu cuota semanal de tier"),
          },
          {
            label: "Opus 5.5 / 3P · Sesión 5 h",
            value: createComputed(() => `${pctText(snap().other_five_hour_pct)} usado`),
            fraction: createComputed(() => clampFraction((num(snap().other_five_hour_pct) ?? 0) / 100)),
            detail: createComputed(() =>
              snap().other_reset_iso
                ? `reinicia ${formatTimeOnly(snap().other_reset_iso)} (${timeLeft(snap().other_reset_iso)})`
                : "",
            ),
          },
          {
            label: "Tiempo de la sesión (5 h)",
            value: createComputed(() => {
              const f = cycleElapsed(snap().other_reset_iso, FIVE_HOURS_MS)
              return f === null ? "--" : `${Math.round(f * 100)}% transcurrido`
            }),
            fraction: createComputed(() => cycleElapsed(snap().other_reset_iso, FIVE_HOURS_MS)),
            kind: "time",
            detail: createComputed(() => "Ventana de 5 horas para regular demanda agregada"),
          },
          {
            label: "Modelos en grupo compartido",
            value: createComputed(() => `${(snap().other_models ?? []).length || 3} modelos`),
            fraction: createComputed(() => null),
            detail: createComputed(
              () =>
                "Claude Opus 5.5 (High) · Claude Sonnet · GPT-OSS\nConsumen del mismo cupo en proporción al costo de tokens.",
            ),
          },
        ],
        error: createComputed(() => snap().error),
        stale: createComputed(() => Boolean(snap().stale)),
        hint: "Clic: refrescar cuota (agy /quota, 0 tokens) · Clic derecho: Antigravity",
      }}
    />
  )
}
