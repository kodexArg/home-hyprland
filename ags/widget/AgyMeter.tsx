import { createComputed } from "ags"
import { agyUsageSnap, refreshAgyUsage, startAgyWatch } from "./agy"
import UsageBadge, { clampFraction, compactDate, pct } from "./UsageBadge"

/** Antigravity (agy): one badge, Google models only (Gemini group 5 h · 7 d).
 *  The rarely used pools (Argon + every other_groups entry, e.g. Claude/GPT) share a single text line in the tooltip. */
export default function AgyMeter() {
  startAgyWatch()
  const snap = agyUsageSnap
  const num = (v: number | null | undefined) => (typeof v === "number" ? v : null)
  const shortName = (name: string) => name.replace(/^Gemini \d+(\.\d+)? /, "").replace(/ models?$/i, "").replace(/ and /g, "/")
  const part = (name: string, five: number | null | undefined, week: number | null | undefined, reset?: string | null) => {
    const vals = [pct(five) && num(five)! > 0 ? `5h ${pct(five)}` : "", pct(week)].filter(Boolean).join(" ")
    if (!vals) return ""
    const r = compactDate(reset)
    return `${shortName(name)} ${vals}${r ? ` ↻${r}` : ""}`
  }
  const others = createComputed(() => {
    const s = snap() as any
    const parts = [part(s.argon_name ?? "Argon", s.argon_five_hour_pct, s.argon_week_pct, s.argon_week_reset_iso)]
    const groups: any[] = Array.isArray(s.other_groups) && s.other_groups.length
      ? s.other_groups
      : s.other_group ? [{ name: s.other_group, five_hour_pct: s.other_five_hour_pct, week_pct: s.other_week_pct, week_reset_iso: s.other_week_reset_iso }] : []
    for (const g of groups) parts.push(part(g.name ?? "otros", g.five_hour_pct, g.week_pct, g.week_reset_iso))
    return parts.filter(Boolean).join(" · ")
  })

  return (
    <UsageBadge
      icon="antigravity"
      tone="gemini"
      primary={{ value: createComputed(() => num(snap().five_hour_pct)), format: "percent" }}
      secondary={{ value: createComputed(() => num(snap().week_pct)), format: "percent" }}
      onRefresh={refreshAgyUsage}
      onOpen="https://antigravity.google"
      tip={{
        title: "Antigravity · Gemini",
        subtitle: createComputed(() => (snap().gemini_models ?? []).map(shortName).join(" · ")),
        rows: [
          {
            label: "5h",
            value: createComputed(() => pct(snap().five_hour_pct)),
            fraction: createComputed(() => clampFraction((num(snap().five_hour_pct) ?? NaN) / 100)),
            reset: createComputed(() => snap().reset_iso),
          },
          {
            label: "7d",
            value: createComputed(() => pct(snap().week_pct)),
            fraction: createComputed(() => clampFraction((num(snap().week_pct) ?? NaN) / 100)),
            reset: createComputed(() => snap().week_reset_iso),
          },
          { label: "+", value: others, fraction: createComputed(() => null) },
        ],
        error: createComputed(() => snap().error),
        stale: createComputed(() => Boolean(snap().stale)),
        hint: "clic ⟳ (agy /quota, 0 tokens) · der ↗",
      }}
    />
  )
}
