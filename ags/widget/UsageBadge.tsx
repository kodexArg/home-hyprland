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
 * hover opens a compact tooltip: one line per window (tag · flat bar · % · ↻ reset).
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
  /** Short tag for the window: "5h", "7d", "30d", "$"… */
  label: string
  value: Accessor<string>
  /** 0…1 fills the flat bar; null = text-only row (no bar). */
  fraction: Accessor<number | null>
  /** Reset instant (ISO) or an already-compact string; shown as "↻ 12:10" / "↻ 20/11". */
  reset?: Accessor<string | null | undefined>
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
const TIP_BAR_PX = 96

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

const two = (n: number) => String(n).padStart(2, "0")

/** Compact local date: "12:10" when it is less than 24 h away, else "20/11". Non-ISO strings pass through. */
export function compactDate(reset: string | null | undefined): string {
  if (!reset) return ""
  const ms = Date.parse(reset)
  if (Number.isNaN(ms)) return reset
  const d = new Date(ms)
  return ms - Date.now() < 86_400_000 ? `${two(d.getHours())}:${two(d.getMinutes())}` : `${two(d.getDate())}/${two(d.getMonth() + 1)}`
}

/** "73%" or "" when the number does not exist. */
export function pct(value: number | null | undefined): string {
  return typeof value === "number" && !Number.isNaN(value) ? `${Math.round(value)}%` : ""
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

function TipBar({ fraction }: { fraction: Accessor<number | null> }) {
  const fillPx = createComputed(() => Math.round((fraction() ?? 0) * TIP_BAR_PX))
  return (
    <box
      class="UsageTip-track"
      widthRequest={TIP_BAR_PX}
      valign={Gtk.Align.CENTER}
      visible={createComputed(() => fraction() !== null)}
    >
      <box class="UsageTip-fill" widthRequest={fillPx} visible={createComputed(() => fillPx() > 0)} />
    </box>
  )
}

/** One line per window: tag · flat bar · value · ↻ reset. */
function TipRowView({ row }: { row: TipRow }) {
  const reset = createComputed(() => {
    const r = compactDate(row.reset?.())
    return r ? `↻ ${r}` : ""
  })
  return (
    <box spacing={6} class="UsageTip-row" visible={createComputed(() => row.value() !== "")}>
      <label class="UsageTip-label" label={row.label} xalign={0} widthChars={3} />
      <TipBar fraction={row.fraction} />
      <label class="UsageTip-value" label={row.value} xalign={1} hexpand />
      <label class="UsageTip-reset" label={reset} xalign={1} visible={createComputed(() => reset() !== "")} />
    </box>
  )
}

function TipView({ tip, tone }: { tip: UsageTip; tone: BadgeTone }) {
  const errorText = tip.error ?? createComputed(() => null as string | null)
  return (
    <box orientation={Gtk.Orientation.VERTICAL} spacing={4} class={createComputed(() => `UsageTip tone-${tone}${tip.blocked?.() ? " blocked" : ""}`)}>
      <box orientation={Gtk.Orientation.VERTICAL} spacing={1}>
        <label
          class="UsageTip-title"
          xalign={0}
          label={createComputed(() => tip.title + (tip.stale?.() ? " ⧗" : ""))}
        />
        {tip.subtitle && <label class="UsageTip-subtitle" xalign={0} label={tip.subtitle} />}
      </box>
      {tip.rows.map((row) => (
        <TipRowView row={row} />
      ))}
      <label
        class="UsageTip-error"
        xalign={0}
        wrap
        maxWidthChars={30}
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
