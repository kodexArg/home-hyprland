import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import { createComputed } from "ags"
import { execAsync } from "ags/process"
import {
  grokBotUsageSnap,
  refreshGrokBotUsage,
  startGrokBotWatch,
} from "./grokbot"

const ICON_GROK_BOT = `${GLib.get_user_config_dir()}/ags/icons/grok-bot.svg`

export default function GrokBotMeter() {
  startGrokBotWatch()

  const tip = createComputed(() => {
    const s = grokBotUsageSnap()
    const grokVal = s.grok_pct !== null ? `${s.grok_pct}%` : "—"
    const rawVal = s.grok_pct_raw !== undefined ? ` (${s.grok_pct_raw}%)` : ""
    const plan = s.plan || "Grok Bot Plan"
    const reset = s.reset_str || "Desconocido"
    const staleNote = s.stale ? " (datos cacheados)" : ""
    const errNote = s.error
      ? `\n<span foreground="#c45c4a">Error: ${GLib.markup_escape_text(s.error, -1)}</span>`
      : ""

    return [
      `<b><span foreground="#3ee0a0">🤖 GROK BOT USAGE</span></b>${staleNote}`,
      `Consumo semanal: <b>${grokVal}</b>${rawVal}`,
      `Plan: <b>${plan}</b>`,
      `Reset: <b>${reset}</b>`,
      errNote,
      `<span size="smaller" alpha="75%">Clic: Refrescar  ·  Clic derecho: Abrir spending dashboard</span>`,
    ]
      .filter(Boolean)
      .join("\n")
  })

  const valClass = createComputed(() => {
    const s = grokBotUsageSnap()
    if (s.error && s.grok_pct === null) return "GrokBot-val err"
    if (s.grok_pct !== null && s.grok_pct >= 90) return "GrokBot-val high"
    if (s.grok_pct !== null && s.grok_pct >= 75) return "GrokBot-val warn"
    return "GrokBot-val"
  })

  const valText = createComputed(() => grokBotUsageSnap().grok_formatted)

  return (
    <button
      class="GrokBotMeter"
      tooltipMarkup={tip}
      valign={Gtk.Align.CENTER}
      $={(self: Gtk.Button) => {
        const click = new Gtk.GestureClick()
        click.set_button(0)
        click.connect("pressed", (_g, _n, _x, _y) => {
          const btn = click.get_current_button()
          if (btn === 1) {
            refreshGrokBotUsage()
          } else if (btn === 3) {
            execAsync(["chromium-stage", "open", "https://cursor.com/dashboard/spending"]).catch(() => {
              execAsync(["xdg-open", "https://cursor.com/dashboard/spending"]).catch(() => undefined)
            })
          }
        })
        self.add_controller(click)
      }}
    >
      <box spacing={3} valign={Gtk.Align.CENTER} class="GrokBotMeter-inner">
        <image file={ICON_GROK_BOT} pixelSize={13} class="GrokBot-icon" />
        <label class={valClass} label={valText} tooltipText="Grok Bot weekly quota" />
      </box>
    </button>
  )
}
