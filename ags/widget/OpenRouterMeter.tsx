import { createComputed } from "ags"
import { openRouterSnap, refreshCredits, startOpenRouterWatch } from "./openrouter"
import UsageBadge, { clampFraction } from "./UsageBadge"

const LOW_BALANCE_USD = 2

/** Chip: balance left (USD). Tooltip: $ balance/total with flat bar · Σ spent. */
export default function OpenRouterMeter() {
  startOpenRouterWatch()
  const snap = openRouterSnap
  const usd = (v?: number | null) => (typeof v === "number" ? `$${v.toFixed(2)}` : "")

  return (
    <UsageBadge
      icon="openrouter"
      tone="green"
      primary={{
        value: createComputed(() => snap().balance),
        format: "money",
        severity: (balance) => (balance < LOW_BALANCE_USD ? "warn" : "ok"),
      }}
      onRefresh={refreshCredits}
      onOpen="https://openrouter.ai/settings/credits"
      tip={{
        title: "OpenRouter",
        rows: [
          {
            label: "$",
            value: createComputed(() => {
              const b = usd(snap().balance)
              const t = usd(snap().total_credits)
              return b && t ? `${b}/${t}` : b
            }),
            fraction: createComputed(() => {
              const s = snap()
              return typeof s.balance === "number" && s.total_credits ? clampFraction(s.balance / s.total_credits) : null
            }),
          },
          { label: "Σ", value: createComputed(() => usd(snap().total_usage)), fraction: createComputed(() => null) },
        ],
        error: createComputed(() => snap().error),
        stale: createComputed(() => Boolean(snap().stale)),
        hint: "clic ⟳ · der ↗",
      }}
    />
  )
}
