import { createComputed } from "ags"
import { cursorUsageSnap, refreshCursorUsage, reloadCursorUsage, startCursorWatch } from "./cursor"
import UsageBadge, { clampFraction, pct } from "./UsageBadge"

/**
 * Chip: Auto pool % · API pool % (Cursor's own two quotas, GetCurrentPeriodUsage).
 * Tooltip, one line each: A (Auto pool) · API (third-party pool) · $ spend/cap with cycle reset · split Grok/3P/Auto.
 * Blocked (Cursor says "usage limit", on-demand off): the tooltip switches to the neutral "blocked" look.
 */
export default function CursorMeter() {
  startCursorWatch()
  const snap = cursorUsageSnap
  const blocked = createComputed(() => {
    const s = snap()
    return /usage limit/i.test(s.display_message ?? "") || (typeof s.remaining === "number" && s.remaining <= 0)
  })
  const usd = (cents?: number | null) => (typeof cents === "number" ? `$${(cents / 100).toFixed(cents >= 10_000 ? 0 : 2)}` : "")
  const cap = () => (snap().limit ?? 0) + (snap().bonus_spend ?? 0)
  /** kdx-cursor-usage gives no ISO instant, only days_left + "21 Nov (5d)": countdown from days_left, date from reset_str. */
  const resetText = () => {
    const s = snap()
    const date = s.reset_str && s.reset_str !== "..." ? s.reset_str.replace(/\s*\(.*\)\s*$/, "") : ""
    return typeof s.days_left === "number" ? { left: `${s.days_left}d`, date } : date ? { left: "", date } : null
  }
  const split = createComputed(() => {
    const s = snap().split
    if (!s || !(s.total_cents > 0)) return ""
    return [`Grok ${usd(s.grok_cents)}`, `3P ${usd(s.third_cents)}`, `Auto ${usd(s.auto_cents)}`].join(" · ")
  })

  return (
    <UsageBadge
      icon="cursor"
      tone="blue"
      primary={{ value: createComputed(() => snap().cursor_pct), format: "percent", severity: () => "ok" }}
      secondary={{ value: createComputed(() => snap().other_pct), format: "percent", severity: () => "ok" }}
      onTipOpen={reloadCursorUsage}
      onRefresh={refreshCursorUsage}
      onOpen="https://www.cursor.com/settings"
      tip={{
        title: "Cursor",
        subtitle: createComputed(() => (blocked() ? `⛔ ${snap().reset_str || ""}`.trim() : "")),
        blocked,
        rows: [
          {
            label: "A",
            value: createComputed(() => pct(snap().cursor_pct)),
            fraction: createComputed(() => clampFraction((snap().cursor_pct ?? NaN) / 100)),
          },
          {
            label: "API",
            value: createComputed(() => pct(snap().other_pct)),
            fraction: createComputed(() => clampFraction((snap().other_pct ?? NaN) / 100)),
          },
          {
            label: "$",
            value: createComputed(() => {
              const t = usd(snap().total_spend)
              return t && cap() ? `${t}/${usd(cap())}` : t
            }),
            fraction: createComputed(() => {
              const total = snap().total_spend
              return typeof total === "number" && cap() ? clampFraction(total / cap()) : null
            }),
            reset: createComputed(resetText),
          },
          { label: "Σ", value: split, fraction: createComputed(() => null) },
        ],
        error: createComputed(() => snap().error),
        stale: createComputed(() => Boolean(snap().stale)),
        actions: { refresh: "Actualizar ahora", open: "Abrir ajustes de Cursor" },
      }}
    />
  )
}
