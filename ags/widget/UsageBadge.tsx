import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import { Accessor, createComputed } from "ags"
import { execAsync } from "ags/process"
import { meterIconPx, meterSpacing } from "./zoom"

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
}

export type UsageTip = {
  title: string
  subtitle?: Accessor<string>
  rows: TipRow[]
  error?: Accessor<string | null>
  stale?: Accessor<boolean>
  hint: string
}

export type UsageBadgeProps = {
  icon: string
  tone: BadgeTone
  primary: BadgeValue
  secondary?: BadgeValue
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

export function formatBadgeValue(value: number | null, format: BadgeFormat): string {
  return value === null || Number.isNaN(value) ? "--" : FORMATTERS[format](value)
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

function ValueLabel({ spec }: { spec: BadgeValue }) {
  const cls = valueClass(spec)
  const digits = createComputed(() => formatBadgeValue(spec.value(), spec.format).replace(/%$/, ""))
  const unit = createComputed(() => (spec.value() === null ? "" : UNITS[spec.format]))
  return (
    <box valign={Gtk.Align.CENTER}>
      <label class={cls} label={digits} valign={Gtk.Align.BASELINE_FILL} />
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
          visible={createComputed(() => row.detail!() !== "")}
        />
      )}
    </box>
  )
}

function TipView({ tip, tone }: { tip: UsageTip; tone: BadgeTone }) {
  const errorText = tip.error ?? createComputed(() => null as string | null)
  return (
    <box orientation={Gtk.Orientation.VERTICAL} spacing={8} class={`UsageTip tone-${tone}`}>
      <box orientation={Gtk.Orientation.VERTICAL} spacing={1}>
        <label
          class="UsageTip-title"
          xalign={0}
          label={createComputed(() => tip.title + (tip.stale?.() ? "  · cacheado" : ""))}
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

  return (
    <button
      class={`UsageBadge tone-${props.tone}`}
      valign={Gtk.Align.CENTER}
      hasTooltip
      onQueryTooltip={(_self, _x, _y, _keyboard, tooltip) => {
        tooltip.set_custom(tipView)
        return true
      }}
      $={(self: Gtk.Button) => {
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
        <ValueLabel spec={props.primary} />
        {props.secondary && <label class="UsageBadge-sep" label="/" />}
        {props.secondary && <ValueLabel spec={props.secondary} />}
      </box>
    </button>
  )
}
