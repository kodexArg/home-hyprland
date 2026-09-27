import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import { createComputed } from "ags"
import { execAsync } from "ags/process"
import {
  cursorUsageSnap,
  refreshCursorUsage,
  startCursorWatch,
} from "./cursor"

const ICON_CURSOR = `${GLib.get_user_config_dir()}/ags/icons/cursor-gray.svg`

export default function CursorMeter() {
  startCursorWatch()

  const tip = createComputed(() => {
    const s = cursorUsageSnap()
    const cursorVal = s.cursor_pct !== null ? `${s.cursor_pct}%` : "—"
    const otherVal = s.other_pct !== null ? `${s.other_pct}%` : "—"
    const reset = s.reset_str || "Desconocido"
    const staleNote = s.stale ? " (datos cacheados)" : ""
    const errNote = s.error ? `\n<span foreground="#c45c4a">Error: ${GLib.markup_escape_text(s.error, -1)}</span>` : ""

    return [
      `<b><span foreground="#89b4fa">⚡ CURSOR USAGE</span></b>${staleNote}`,
      `Cursor models: <b>${cursorVal}</b>`,
      `Other models: <b>${otherVal}</b>`,
      `Reset: <b>${reset}</b>`,
      errNote,
      `<span size="smaller" alpha="75%">Clic: Refrescar  ·  Clic derecho: Abrir ajustes Cursor</span>`,
    ]
      .filter(Boolean)
      .join("\n")
  })

  const cursorClass = createComputed(() => {
    const s = cursorUsageSnap()
    if (s.error && s.cursor_pct === null) return "Cursor-val err"
    if (s.cursor_pct !== null && s.cursor_pct >= 90) return "Cursor-val high"
    if (s.cursor_pct !== null && s.cursor_pct >= 75) return "Cursor-val warn"
    return "Cursor-val"
  })

  const otherClass = createComputed(() => {
    const s = cursorUsageSnap()
    if (s.error && s.other_pct === null) return "Cursor-val err"
    if (s.other_pct !== null && s.other_pct >= 90) return "Cursor-val high"
    if (s.other_pct !== null && s.other_pct >= 75) return "Cursor-val warn"
    return "Cursor-val"
  })

  const cursorText = createComputed(() => cursorUsageSnap().cursor_formatted)
  const otherText = createComputed(() => cursorUsageSnap().other_formatted)

  return (
    <button
      class="CursorMeter"
      tooltipMarkup={tip}
      valign={Gtk.Align.CENTER}
      $={(self: Gtk.Button) => {
        const click = new Gtk.GestureClick()
        click.set_button(0)
        click.connect("pressed", (_g, _n, _x, _y) => {
          const btn = click.get_current_button()
          if (btn === 1) {
            refreshCursorUsage()
          } else if (btn === 3) {
            execAsync(["chromium-stage", "open", "https://www.cursor.com/settings"]).catch(() => {
              execAsync(["xdg-open", "https://www.cursor.com/settings"]).catch(() => undefined)
            })
          }
        })
        self.add_controller(click)
      }}
    >
      <box spacing={3} valign={Gtk.Align.CENTER} class="CursorMeter-inner">
        <image file={ICON_CURSOR} pixelSize={13} class="Cursor-icon" />
        <label class={cursorClass} label={cursorText} tooltipText="Cursor models" />
        <label class="Cursor-sep" label="/" />
        <label class={otherClass} label={otherText} tooltipText="Other models" />
      </box>
    </button>
  )
}
