import { createComputed } from "ags"
import { agyUsageSnap, refreshAgyUsage, reloadAgyUsage, startAgyWatch } from "./agy"
import UsageBadge, { clampFraction, pct } from "./UsageBadge"

/** Antigravity "other models" pool (Claude/GPT). Not mounted in the bar anymore: AgyMeter folds it into one tooltip line.
 *  Kept on the compact API in case a profile wants it back via show("agy-other"). */
export default function AgyOtherMeter() {
  startAgyWatch()
  const snap = agyUsageSnap
  const num = (v: number | null | undefined) => (typeof v === "number" ? v : null)
  return (
    <UsageBadge
      icon="agy-other"
      tone="agyother"
      primary={{ value: createComputed(() => num(snap().other_week_pct)), format: "percent" }}
      onTipOpen={reloadAgyUsage}
      onRefresh={refreshAgyUsage}
      onOpen="https://antigravity.google"
      tip={{
        title: "Antigravity · otros",
        subtitle: createComputed(() => (snap().other_models ?? []).join(" · ")),
        rows: [
          {
            label: "5h",
            value: createComputed(() => pct(snap().other_five_hour_pct)),
            fraction: createComputed(() => clampFraction((num(snap().other_five_hour_pct) ?? NaN) / 100)),
            reset: createComputed(() => snap().other_reset_iso),
          },
          {
            label: "7d",
            value: createComputed(() => pct(snap().other_week_pct)),
            fraction: createComputed(() => clampFraction((num(snap().other_week_pct) ?? NaN) / 100)),
            reset: createComputed(() => snap().other_week_reset_iso),
          },
        ],
        error: createComputed(() => snap().error),
        stale: createComputed(() => Boolean(snap().stale)),
        actions: { refresh: "Actualizar ahora (agy /quota, 0 tokens)", open: "Abrir antigravity.google" },
      }}
    />
  )
}
