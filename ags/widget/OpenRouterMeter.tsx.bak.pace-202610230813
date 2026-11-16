import { createComputed } from "ags"
import { openRouterSnap, refreshCredits, startOpenRouterWatch } from "./openrouter"
import UsageBadge, { clampFraction } from "./UsageBadge"

const LOW_BALANCE_USD = 2

export default function OpenRouterMeter() {
  startOpenRouterWatch()
  const snap = openRouterSnap
  const usd = (v?: number | null) => (typeof v === "number" ? `$${v.toFixed(2)}` : "--")

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
        subtitle: createComputed(() => `${usd(snap().balance)} disponibles`),
        rows: [
          {
            label: "Saldo restante",
            value: createComputed(() => `${usd(snap().balance)} / ${usd(snap().total_credits)}`),
            fraction: createComputed(() => {
              const s = snap()
              return s.balance !== null && s.total_credits ? clampFraction(s.balance / s.total_credits) : null
            }),
          },
          {
            label: "Consumido",
            value: createComputed(() => usd(snap().total_usage)),
            fraction: createComputed(() => {
              const s = snap()
              return s.total_usage !== undefined && s.total_credits ? clampFraction(s.total_usage / s.total_credits) : null
            }),
            kind: "time",
          },
        ],
        error: createComputed(() => snap().error),
        stale: createComputed(() => Boolean(snap().stale)),
        hint: "Clic: refrescar · Clic derecho: créditos OpenRouter",
      }}
    />
  )
}
