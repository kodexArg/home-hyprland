import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import { createComputed } from "ags"
import { execAsync } from "ags/process"
import {
  openRouterSnap,
  refreshCredits,
  startOpenRouterWatch,
} from "./openrouter"

const ICON_OPENROUTER = `${GLib.get_user_config_dir()}/ags/icons/openrouter-gray.svg`

export default function OpenRouterMeter() {
  startOpenRouterWatch()

  const tip = createComputed(() => {
    const s = openRouterSnap()
    const bal = s.balance !== null ? `$${s.formatted}` : "Desconocido"
    const total = s.total_credits !== undefined ? `$${s.total_credits.toFixed(2)}` : "—"
    const usage = s.total_usage !== undefined ? `$${s.total_usage.toFixed(2)}` : "—"
    const staleNote = s.stale ? " (datos cacheados)" : ""
    const errNote = s.error ? `\n<span foreground="#c45c4a">Error: ${GLib.markup_escape_text(s.error, -1)}</span>` : ""

    return [
      `<b><span foreground="#699856">⚡ OPENROUTER CREDITS</span></b>${staleNote}`,
      `Saldo disponible: <b>${bal}</b>`,
      `Créditos totales: ${total} · Consumo acumulado: ${usage}`,
      errNote,
      `<span size="smaller" alpha="75%">Clic: Refrescar saldo  ·  Clic derecho: Abrir ajustes OpenRouter</span>`,
    ]
      .filter(Boolean)
      .join("\n")
  })

  const valClass = createComputed(() => {
    const s = openRouterSnap()
    if (s.error && s.balance === null) return "OpenRouter-val err"
    if (s.balance !== null && s.balance < 2.0) return "OpenRouter-val low"
    return "OpenRouter-val"
  })

  const valText = createComputed(() => {
    return openRouterSnap().formatted
  })

  return (
    <button
      class="OpenRouterMeter"
      tooltipMarkup={tip}
      valign={Gtk.Align.CENTER}
      $={(self: Gtk.Button) => {
        const click = new Gtk.GestureClick()
        click.set_button(0)
        click.connect("pressed", (_g, _n, _x, _y) => {
          const btn = click.get_current_button()
          if (btn === 1) {
            refreshCredits()
          } else if (btn === 3) {
            execAsync(["chromium-stage", "open", "https://openrouter.ai/settings/credits"]).catch(() => {
              execAsync(["xdg-open", "https://openrouter.ai/settings/credits"]).catch(() => undefined)
            })
          }
        })
        self.add_controller(click)
      }}
    >
      <box spacing={3} valign={Gtk.Align.CENTER} class="OpenRouterMeter-inner">
        <image file={ICON_OPENROUTER} pixelSize={13} class="OpenRouter-icon" />
        <label class={valClass} label={valText} />
      </box>
    </button>
  )
}
