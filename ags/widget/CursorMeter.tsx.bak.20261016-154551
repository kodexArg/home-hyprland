import { createComputed } from "ags"
import { cursorUsageSnap, refreshCursorUsage, startCursorWatch } from "./cursor"
import UsageBadge, { clampFraction } from "./UsageBadge"

const CYCLE_DAYS = 30

export default function CursorMeter() {
  startCursorWatch()
  const snap = cursorUsageSnap
  const pctText = (v: number | null) => (v === null ? "--" : `${v}%`)
  const dollars = (cents?: number | null) => (typeof cents === "number" ? `$${(cents / 100).toFixed(2)}` : "--")

  return (
    <UsageBadge
      icon="cursor"
      tone="blue"
      primary={{ value: createComputed(() => snap().cursor_pct), format: "percent" }}
      secondary={{ value: createComputed(() => snap().other_pct), format: "percent" }}
      onRefresh={refreshCursorUsage}
      onOpen="https://www.cursor.com/settings"
      tip={{
        title: "Cursor",
        subtitle: createComputed(() => snap().display_message ?? ""),
        rows: [
          {
            label: "Modelos Cursor",
            value: createComputed(() => pctText(snap().cursor_pct)),
            fraction: createComputed(() => clampFraction((snap().cursor_pct ?? 0) / 100)),
          },
          {
            label: "Otros modelos",
            value: createComputed(() => pctText(snap().other_pct)),
            fraction: createComputed(() => clampFraction((snap().other_pct ?? 0) / 100)),
          },
          {
            label: "Gasto del ciclo",
            value: createComputed(() => `${dollars(snap().total_spend)} / ${dollars(snap().limit)}`),
            fraction: createComputed(() => {
              const s = snap()
              return s.total_spend && s.limit ? clampFraction(s.total_spend / s.limit) : null
            }),
          },
          {
            label: "Tiempo del ciclo",
            value: createComputed(() => snap().reset_str || "--"),
            fraction: createComputed(() => {
              const left = snap().days_left
              return typeof left === "number" ? clampFraction(1 - left / CYCLE_DAYS) : null
            }),
            kind: "time",
          },
        ],
        error: createComputed(() => snap().error),
        stale: createComputed(() => Boolean(snap().stale)),
        hint: "Clic: refrescar · Clic derecho: ajustes Cursor",
      }}
    />
  )
}
