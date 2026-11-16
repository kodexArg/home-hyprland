import { createComputed } from "ags"
import { execAsync } from "ags/process"
import { grokBuildUsageSnap, refreshGrokBuildUsage, reloadGrokBuildUsage, startGrokBuildWatch } from "./grokbuild"
import UsageBadge, { clampFraction, pct } from "./UsageBadge"

export default function GrokBuildMeter() {
  startGrokBuildWatch()
  const snap = grokBuildUsageSnap
  const weekly = () => snap().grok_pct_raw ?? snap().grok_pct

  return (
    <UsageBadge
      icon="grok-build"
      tone="mint"
      primary={{ value: createComputed(() => snap().grok_pct), format: "percent" }}
      onTipOpen={reloadGrokBuildUsage}
      onRefresh={refreshGrokBuildUsage}
      onOpen={() => execAsync(["gtk-launch", "grok"]).catch(() => undefined)}
      tip={{
        title: "Grok Build",
        subtitle: createComputed(() => [snap().plan, snap().cursor_plan].filter(Boolean).join(" · ")),
        rows: [
          {
            label: "7d",
            value: createComputed(() => pct(weekly())),
            fraction: createComputed(() => clampFraction((weekly() ?? NaN) / 100)),
            reset: createComputed(() => snap().reset_iso ?? (snap().reset_str && snap().reset_str !== "..." ? { left: "", date: snap().reset_str } : null)),
          },
        ],
        error: createComputed(() => snap().error),
        stale: createComputed(() => Boolean(snap().stale)),
        actions: { refresh: "Actualizar ahora", open: "Abrir Grok Build" },
      }}
    />
  )
}
