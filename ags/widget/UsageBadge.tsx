import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import { Accessor, createComputed, createEffect } from "ags"
import { execAsync } from "ags/process"
import { meterIconPx, meterSpacing } from "./zoom"
import { valueChanged } from "./value-changed"
import { createGlowBeat, createFlicker } from "./usage-glow"

/**
 * UsageBadge — one bar chip for every quota/credit meter (Grok, Cursor, Claude, OpenRouter).
 * Strategy: `format` picks how a number is printed; `severity` picks how it is colored.
 * The chip is white logo + tone-colored DSEG7 digits (+ optional second value);
 * hover opens a custom tooltip with one bar per row.
 */

export type BadgeTone = "mint" | "blue" | "claude" | "green" | "gemini" | "agyother"
export type BadgeFormat = "percent" | "money"
export type BadgeSeverity = "ok" | "warn" | "high" | "err"

export type BadgeValue = {
  value: Accessor<number | null>
  format: BadgeFormat
  /** Defaults: percent → warn ≥75 / high ≥90; money → always ok. */
  severity?: (value: number) => BadgeSeverity
}

export type TipRow = {
  label: string
  value: Accessor<string>
  /** 0…1 fills the bar; null hides the bar. */
  fraction: Accessor<number | null>
  detail?: Accessor<string>
  /** "time" rows draw neutral gray (elapsed cycle) instead of the badge tone. */
  kind?: "usage" | "time"
  /** On a "time" row: cycle length in days; adds a per-day pace box fed by the row above. */
  days?: number
}

export type UsageTip = {
  title: string
  subtitle?: Accessor<string>
  rows: TipRow[]
  error?: Accessor<string | null>
  stale?: Accessor<boolean>
  /** Hard cap reached: the tooltip switches to the neutral "blocked" look. */
  blocked?: Accessor<boolean>
  hint: string
}

export type UsageBadgeProps = {
  icon: string
  tone: BadgeTone
  primary: BadgeValue
  secondary?: BadgeValue
  /** Optional short tag shown before primary (e.g. "G"). */
  prefix?: string
  /** Optional second pool shown after a "·" (e.g. "C 0/100"). */
  extra?: { prefix: string; primary: BadgeValue; secondary: BadgeValue }
  tip: UsageTip
  onRefresh: () => void
  /** Right click: URL opened on the stage Chromium, or a custom action. */
  onOpen: string | (() => void)
}

const ICON_DIR = `${GLib.get_user_config_dir()}/ags/icons/badge`
const TIP_BAR_PX = 180

const FORMATTERS: Record<BadgeFormat, (value: number) => string> = {
  percent: (value) => `${Math.round(value)}%`,
  money: (value) => (Math.trunc(value * 10) / 10).toFixed(1),
}

const DEFAULT_SEVERITY: Record<BadgeFormat, (value: number) => BadgeSeverity> = {
  percent: (value) => (value >= 90 ? "high" : value >= 75 ? "warn" : "ok"),
  money: () => "ok",
}

function isNumber(value: number | null): value is number {
  return typeof value === "number" && !Number.isNaN(value)
}

export function formatBadgeValue(value: number | null, format: BadgeFormat): string {
  return isNumber(value) ? FORMATTERS[format](value) : ""
}

export function clampFraction(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null
  return Math.min(1, Math.max(0, value))
}

/** Share of the current cycle already gone, from its reset instant and length. */
export function cycleElapsed(resetIso: string | undefined | null, periodMs: number): number | null {
  if (!resetIso) return null
  const resetMs = Date.parse(resetIso)
  if (Number.isNaN(resetMs)) return null
  return clampFraction(1 - (resetMs - Date.now()) / periodMs)
}

export function timeLeft(resetIso: string | undefined | null): string {
  if (!resetIso) return ""
  const ms = Date.parse(resetIso) - Date.now()
  if (Number.isNaN(ms) || ms <= 0) return ""
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 48) return `faltan ${Math.floor(hours / 24)}d`
  return `faltan ${hours}h ${Math.floor((ms % 3_600_000) / 60_000)}m`
}

function valueClass(spec: BadgeValue) {
  return createComputed(() => {
    const value = spec.value()
    if (value === null) return "UsageBadge-val err"
    const severity = (spec.severity ?? DEFAULT_SEVERITY[spec.format])(value)
    return severity === "ok" ? "UsageBadge-val" : `UsageBadge-val ${severity}`
  })
}

/** DSEG7 has no "%": the unit rides on its own label, baseline-aligned, so it never changes the digits' line box. */
const UNITS: Record<BadgeFormat, string> = { percent: "%", money: "" }

/** Glow color per tone (rgb triplet), mirrors $badge-tones in style.scss. */
const TONE_RGB: Record<BadgeTone, string> = {
  mint: "62, 224, 160",
  blue: "137, 180, 250",
  claude: "217, 119, 87",
  green: "123, 201, 111",
  gemini: "167, 139, 250",
  agyother: "167, 139, 250",
}

/** Calls onRise on raw (unrounded) usage: percent going up, or money balance moving (spend lowers it).
 *  First load and percent resets (drops) are ignored. */
function watchRise(spec: BadgeValue, onRise: () => void) {
  let last: number | null = null
  createEffect(() => {
    const next = spec.value()
    if (isNumber(next) && last !== null && (spec.format === "money" ? next !== last : next > last)) onRise()
    if (isNumber(next)) last = next
  })
}

function ValueLabel({ spec }: { spec: BadgeValue }) {
  const cls = valueClass(spec)
  const digits = createComputed(() => formatBadgeValue(spec.value(), spec.format).replace(/%$/, ""))
  const changed = valueChanged(digits)
  const unit = createComputed(() => (isNumber(spec.value()) ? UNITS[spec.format] : ""))
  const visible = createComputed(() => isNumber(spec.value()))
  return (
    <box valign={Gtk.Align.CENTER} visible={visible}>
      <label
        class={createComputed(
          () => `${cls()}${changed() ? " value-changed" : ""}${digits().startsWith("1") ? " lead-one" : ""}`,
        )}
        label={digits}
        valign={Gtk.Align.BASELINE_FILL}
      />
      <label
        class={createComputed(() => `${cls()} UsageBadge-unit`)}
        label={unit}
        valign={Gtk.Align.BASELINE_FILL}
      />
    </box>
  )
}

function TipBar({ row }: { row: TipRow }) {
  const fillPx = createComputed(() => Math.round((row.fraction() ?? 0) * TIP_BAR_PX))
  return (
    <box
      class={`UsageTip-track ${row.kind === "time" ? "time" : "usage"}`}
      widthRequest={TIP_BAR_PX}
      visible={createComputed(() => row.fraction() !== null)}
    >
      <box class="UsageTip-fill" widthRequest={fillPx} visible={createComputed(() => fillPx() > 0)} />
    </box>
  )
}

const PACE_RGB: Record<BadgeSeverity, [number, number, number]> = {
  ok: [0.65, 0.89, 0.63],
  warn: [0.98, 0.70, 0.53],
  high: [0.95, 0.55, 0.66],
  err: [0.95, 0.55, 0.66],
}

/** Used share split into days: track = whole cycle, fill = used (3-tone), one tick per day boundary. */
function PaceBox({ used, elapsed, days }: { used: Accessor<number | null>; elapsed: Accessor<number | null>; days: number }) {
  const pace = createComputed(() => {
    const u = used()
    if (u === null) return null
    const pct = u * 100
    const left = Math.max((1 - (elapsed() ?? 0)) * days, 1 / 24)
    const remaining = Math.max(0, 100 - pct)
    const allowed = remaining / left
    const ideal = 100 / days
    const ratio = allowed / ideal
    let verdict = "En el promedio"
    let tone = "ok"
    if (ratio >= 1.1) verdict = `Se puede aumentar la frecuencia un ${Math.round((ratio - 1) * 100)}%`
    else if (ratio <= 0.9) {
      verdict = `Se debe disminuir la frecuencia un ${Math.round((1 - ratio) * 100)}%`
      tone = ratio > 0.7 ? "warn" : "high"
    }
    return {
      used: `Usado ${pct.toFixed(1)}% del total · ${(pct / days).toFixed(1)}%/día de ${days} d`,
      left: `Quedan ${remaining.toFixed(1)}% en ${left.toFixed(2)} d → ${allowed.toFixed(1)}%/día (ideal ${ideal.toFixed(1)}%/día)`,
      verdict,
      tone,
    }
  })
  return (
    <box orientation={Gtk.Orientation.VERTICAL} spacing={3} class="UsageTip-pace" visible={createComputed(() => used() !== null)}>
      <label class="UsageTip-detail" label={createComputed(() => pace()?.used ?? "--")} xalign={0} />
      <label class="UsageTip-detail" label={createComputed(() => pace()?.left ?? "")} xalign={0} />
      <label
        class={createComputed(() => `UsageTip-verdict ${pace()?.tone ?? "ok"}`)}
        label={createComputed(() => pace()?.verdict ?? "")}
        xalign={0}
      />
      <drawingarea
        widthRequest={TIP_BAR_PX}
        heightRequest={8}
        $={(area: Gtk.DrawingArea) => {
          area.set_draw_func((_a, cr, w, h) => {
            cr.setSourceRGBA(1, 1, 1, 0.12)
            cr.rectangle(0, 0, w, h)
            cr.fill()
            const u = used() ?? 0
            const [r, g, b] = PACE_RGB[DEFAULT_SEVERITY.percent(u * 100)]
            cr.setSourceRGB(r, g, b)
            cr.rectangle(0, 0, Math.round(u * w), h)
            cr.fill()
            cr.setSourceRGBA(0, 0, 0, 0.6)
            cr.setLineWidth(1)
            for (let d = 1; d < days; d++) {
              const x = Math.round((d * w) / days) + 0.5
              cr.moveTo(x, 0)
              cr.lineTo(x, h)
            }
            cr.stroke()
          })
          createEffect(() => {
            used()
            area.queue_draw()
          })
        }}
      />
    </box>
  )
}

function TipRowView({ row }: { row: TipRow }) {
  return (
    <box orientation={Gtk.Orientation.VERTICAL} spacing={3} class="UsageTip-row">
      <box spacing={8}>
        <label class="UsageTip-label" label={row.label} xalign={0} hexpand />
        <label class="UsageTip-value" label={row.value} xalign={1} />
      </box>
      <TipBar row={row} />
      {row.detail && (
        <label
          class="UsageTip-detail"
          label={row.detail}
          xalign={0}
          wrap
          maxWidthChars={36}
          visible={createComputed(() => row.detail!() !== "")}
        />
      )}
    </box>
  )
}

function TipView({ tip, tone }: { tip: UsageTip; tone: BadgeTone }) {
  const errorText = tip.error ?? createComputed(() => null as string | null)
  return (
    <box orientation={Gtk.Orientation.VERTICAL} spacing={8} class={createComputed(() => `UsageTip tone-${tone}${tip.blocked?.() ? " blocked" : ""}`)}>
      <box orientation={Gtk.Orientation.VERTICAL} spacing={1}>
        <label
          class="UsageTip-title"
          xalign={0}
          label={createComputed(() => tip.title + (tip.stale?.() ? "  · cacheado" : ""))}
        />
        {tip.subtitle && <label class="UsageTip-subtitle" xalign={0} label={tip.subtitle} />}
      </box>
      {tip.rows.map((row, i) => (
        <TipRowView row={row} />
      ))}
      {tip.rows.flatMap((row, i) =>
        row.days && i > 0 ? [<PaceBox used={tip.rows[i - 1].fraction} elapsed={row.fraction} days={row.days} />] : [],
      )}
      <label
        class="UsageTip-error"
        xalign={0}
        wrap
        maxWidthChars={34}
        label={createComputed(() => errorText() ?? "")}
        visible={createComputed(() => Boolean(errorText()))}
      />
      <label class="UsageTip-hint" xalign={0} label={tip.hint} />
    </box>
  )
}

function openTarget(target: string | (() => void)) {
  if (typeof target === "function") return target()
  execAsync(["chromium-stage", "open", target]).catch(() => {
    execAsync(["xdg-open", target]).catch(() => undefined)
  })
}

export default function UsageBadge(props: UsageBadgeProps) {
  const tipView = (<TipView tip={props.tip} tone={props.tone} />) as Gtk.Widget
  const showBadge = createComputed(() => {
    if (isNumber(props.primary.value())) return true
    return Boolean(props.secondary) && isNumber(props.secondary!.value())
  })
  const showSep = createComputed(
    () => Boolean(props.secondary) && isNumber(props.primary.value()) && isNumber(props.secondary!.value()),
  )

  const pulses: (() => void)[] = []
  const pulse = () => pulses.forEach((beat) => beat())
  for (const spec of [props.primary, props.secondary, props.extra?.primary, props.extra?.secondary]) {
    if (spec) watchRise(spec, pulse)
  }

  return (
    <button
      visible={showBadge}
      class={`UsageBadge tone-${props.tone}`}
      valign={Gtk.Align.CENTER}
      hasTooltip
      onQueryTooltip={(_self, _x, _y, _keyboard, tooltip) => {
        tooltip.set_custom(tipView)
        return true
      }}
      $={(self: Gtk.Button) => {
        const glow = createGlowBeat(self, TONE_RGB[props.tone])
        const flicker = createFlicker(self, TONE_RGB[props.tone])
        pulses.push(() => {
          flicker()
          GLib.timeout_add(GLib.PRIORITY_DEFAULT, 260, () => {
            glow()
            return GLib.SOURCE_REMOVE
          })
        })
        const click = new Gtk.GestureClick()
        click.set_button(0)
        click.connect("pressed", () => {
          const button = click.get_current_button()
          if (button === 1) props.onRefresh()
          else if (button === 3) openTarget(props.onOpen)
        })
        self.add_controller(click)
      }}
    >
      <box spacing={meterSpacing} valign={Gtk.Align.CENTER} class="UsageBadge-inner">
        <image file={`${ICON_DIR}/${props.icon}.svg`} pixelSize={meterIconPx} class="UsageBadge-icon" />
        {props.prefix && <label class="UsageBadge-sep" label={props.prefix} />}
        <ValueLabel spec={props.primary} />
        {props.secondary && <label class="UsageBadge-sep" label="·" visible={showSep} />}
        {props.secondary && <ValueLabel spec={props.secondary} />}
        {props.extra && <label class="UsageBadge-sep" label={`· ${props.extra.prefix}`} />}
        {props.extra && <ValueLabel spec={props.extra.primary} />}
        {props.extra && <label class="UsageBadge-sep" label="·" />}
        {props.extra && <ValueLabel spec={props.extra.secondary} />}
      </box>
    </button>
  )
}
