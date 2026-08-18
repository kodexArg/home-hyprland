import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import GLib from "gi://GLib"
import { createComputed, createState } from "ags"
import { barVisible, setOverBar } from "./bar-mode"

const ICON_DIR = `${GLib.get_user_config_dir()}/ags/icons`
const ICON_REC_IDLE = `${ICON_DIR}/rec.svg`
const ICON_REC_ON = `${ICON_DIR}/rec-on.svg`

/** Mock rows — replace labels/actions later; keep structure. */
const MOCK_OPTIONS = [
  { id: "opt-1", label: "Option 1" },
  { id: "opt-2", label: "Option 2" },
  { id: "opt-3", label: "Option 3" },
  { id: "opt-4", label: "Option 4" },
  { id: "opt-5", label: "Option 5" },
] as const

const PANEL_GAP = 4

const [menuOpen, setMenuOpen] = createState(false)
const [selectedId, setSelectedId] = createState<string | null>(null)

function attachMotion(
  widget: Gtk.Widget,
  onEnter: () => void,
  onLeave: () => void,
) {
  const motion = new Gtk.EventControllerMotion()
  motion.connect("enter", onEnter)
  motion.connect("leave", onLeave)
  widget.add_controller(motion)
}

function closeMenu() {
  setMenuOpen(false)
}

function onPick(id: string) {
  setSelectedId(id)
  // Mock: select only. Wire real actions later; menu stays open so you can inspect.
}

function RecClickaway(gdkmonitor: Gdk.Monitor) {
  const { TOP, RIGHT, LEFT, BOTTOM } = Astal.WindowAnchor
  const visible = createComputed(() => menuOpen() && barVisible())

  return (
    <window
      visible={visible}
      name="rec-menu-clickaway"
      namespace="ags-rec-menu-clickaway"
      class="RecClickaway"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.IGNORE}
      anchor={TOP | RIGHT | LEFT | BOTTOM}
      layer={Astal.Layer.TOP}
      keymode={Astal.Keymode.NONE}
      application={app}
      $={(self: Gtk.Window) => {
        const click = new Gtk.GestureClick()
        click.set_button(0)
        click.connect("pressed", () => closeMenu())
        self.add_controller(click)
      }}
    >
      <box hexpand vexpand />
    </window>
  )
}

function RecPanel(gdkmonitor: Gdk.Monitor) {
  const { TOP, RIGHT } = Astal.WindowAnchor
  const panelVisible = createComputed(() => menuOpen() && barVisible())

  RecClickaway(gdkmonitor)

  return (
    <window
      visible={panelVisible}
      name="rec-menu"
      namespace="ags-rec-menu"
      class="RecPanel"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.NORMAL}
      anchor={TOP | RIGHT}
      layer={Astal.Layer.OVERLAY}
      marginTop={PANEL_GAP}
      marginRight={8}
      keymode={Astal.Keymode.ON_DEMAND}
      application={app}
      $={(self: Gtk.Window) => {
        const key = new Gtk.EventControllerKey()
        key.connect("key-pressed", (_c, keyval) => {
          if (keyval === Gdk.KEY_Escape) {
            closeMenu()
            return true
          }
          return false
        })
        self.add_controller(key)
      }}
    >
      <box
        class="Rec-menu"
        orientation={Gtk.Orientation.VERTICAL}
        spacing={2}
        valign={Gtk.Align.CENTER}
        $={(self) =>
          attachMotion(
            self,
            () => setOverBar(true),
            () => setOverBar(false),
          )
        }
      >
        <label
          class="Rec-status"
          label="REC"
          xalign={0}
          tooltipText="Mock menu · 5 slots · click outside or Esc to close"
        />

        <box class="Rec-sep" heightRequest={1} hexpand />

        {MOCK_OPTIONS.map((opt) => {
          const rowClass = createComputed(() => {
            const on = selectedId() === opt.id
            return on ? "Rec-row on" : "Rec-row"
          })
          const mark = createComputed(() =>
            selectedId() === opt.id ? "●" : " ",
          )
          return (
            <button
              class={rowClass}
              tooltipText={`${opt.label} · mock`}
              onClicked={() => onPick(opt.id)}
            >
              <box spacing={8} valign={Gtk.Align.CENTER} hexpand>
                <label class="Rec-mark" label={mark} xalign={0.5} />
                <label
                  class="Rec-label"
                  label={opt.label}
                  xalign={0}
                  hexpand
                />
              </box>
            </button>
          )
        })}
      </box>
    </window>
  )
}

export default function RecMenu({
  gdkmonitor,
}: {
  gdkmonitor: Gdk.Monitor
}) {
  RecPanel(gdkmonitor)

  const cls = createComputed(() => {
    const parts = ["Rec"]
    if (menuOpen()) parts.push("open")
    if (selectedId()) parts.push("armed")
    return parts.join(" ")
  })

  // Same visual language as a camcorder REC lamp: cream idle, red when armed.
  const iconFile = createComputed(() =>
    selectedId() || menuOpen() ? ICON_REC_ON : ICON_REC_IDLE,
  )

  const tip = createComputed(() => {
    const sel = selectedId()
    const name = sel
      ? (MOCK_OPTIONS.find((o) => o.id === sel)?.label ?? sel)
      : "none"
    return `REC · selected: ${name} — click for menu · outside/Esc closes`
  })

  return (
    <button
      class={cls}
      tooltipText={tip}
      onClicked={() => setMenuOpen(!menuOpen.peek())}
    >
      <image file={iconFile} pixelSize={16} />
    </button>
  )
}

export function getRecMenuOpen(): boolean {
  return menuOpen.peek()
}

export function toggleRecMenu(): string {
  setMenuOpen(!menuOpen.peek())
  return menuOpen.peek() ? "rec-menu-open" : "rec-menu-closed"
}
