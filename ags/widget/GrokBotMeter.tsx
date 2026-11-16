import { createComputed } from "ags"
import { grokBotUsageSnap, refreshGrokBotUsage, reloadGrokBotUsage, startGrokBotWatch } from "./grokbot"
import UsageBadge, { clampFraction, pct } from "./UsageBadge"

export default function GrokBotMeter() {
  startGrokBotWatch()
  const snap = grokBotUsageSnap
  const weekly = () => snap().grok_pct_raw ?? snap().grok_pct

  return (
    <UsageBadge
      icon="grok-bot"
      tone="mint"
      primary={{ value: createComputed(() => snap().grok_pct), format: "percent" }}
      onTipOpen={reloadGrokBotUsage}
      onRefresh={refreshGrokBotUsage}
      onOpen="https://cursor.com/dashboard/spending"
      tip={{
        title: "Grok Bot",
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
        actions: { refresh: "Actualizar ahora", open: "Abrir gasto en cursor.com" },
      }}
    />
  )
}
