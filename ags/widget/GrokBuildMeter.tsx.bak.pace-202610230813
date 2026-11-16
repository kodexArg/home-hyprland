import { createComputed } from "ags"
import { execAsync } from "ags/process"
import { grokBuildUsageSnap, refreshGrokBuildUsage, startGrokBuildWatch } from "./grokbuild"
import UsageBadge, { clampFraction, cycleElapsed } from "./UsageBadge"

const WEEK_MS = 7 * 86_400_000

export default function GrokBuildMeter() {
  startGrokBuildWatch()
  const snap = grokBuildUsageSnap
  const weekly = () => snap().grok_pct_raw ?? snap().grok_pct

  return (
    <UsageBadge
      icon="grok-build"
      tone="mint"
      primary={{ value: createComputed(() => snap().grok_pct), format: "percent" }}
      onRefresh={refreshGrokBuildUsage}
      onOpen={() => execAsync(["gtk-launch", "grok"]).catch(() => undefined)}
      tip={{
        title: "Grok Build",
        subtitle: createComputed(() => [snap().plan, snap().cursor_plan].filter(Boolean).join(" · ")),
        rows: [
          {
            label: "Límite semanal",
            value: createComputed(() => (weekly() === null ? "--" : `${weekly()}%`)),
            fraction: createComputed(() => clampFraction((weekly() ?? 0) / 100)),
            detail: createComputed(() => (snap().reset_str ? `reinicia ${snap().reset_str}` : "")),
          },
          {
            label: "Tiempo de la semana",
            value: createComputed(() => {
              const f = cycleElapsed(snap().reset_iso, WEEK_MS)
              return f === null ? "--" : `${Math.round(f * 100)}%`
            }),
            fraction: createComputed(() => cycleElapsed(snap().reset_iso, WEEK_MS)),
            kind: "time",
          },
        ],
        error: createComputed(() => snap().error),
        stale: createComputed(() => Boolean(snap().stale)),
        hint: "Clic: refrescar · Clic derecho: abrir Grok Build",
      }}
    />
  )
}
