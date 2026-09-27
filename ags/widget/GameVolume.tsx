import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import { createComputed, createState } from "ags"
import {
  MAX_GAME_VOLUME,
  bumpGameVolume,
  gameMuted,
  gameTitle,
  gameVolume,
  hasGameStream,
  setGameVolume,
  startGameAudioMonitor,
  toggleGameMute,
} from "./game-audio"
import { isZoomDense } from "./zoom"

startGameAudioMonitor()

const TRACK_W_BASE = 100
const ICON_DIR = `${GLib.get_user_config_dir()}/ags/icons`
const ICON_STEAM_YELLOW = `${ICON_DIR}/steam-yellow.svg`
const ICON_STEAM_MUTED = `${ICON_DIR}/steam-muted.svg`

/* ── State: collapsed (icon only) / expanded (icon + track + ±) ───── */
const [expanded, setExpanded] = createState(false)
export function toggleGameVolumeExpanded() {
  setExpanded(!expanded.peek())
}

function GameVolumeTrack() {
  const trackW = createComputed(() =>
    isZoomDense() ? Math.round(TRACK_W_BASE / 2) : TRACK_W_BASE,
  )

  const setFromX = (widget: Gtk.Widget, x: number) => {
    const w = widget.get_allocated_width() || trackW()
    const v = Math.max(0, Math.min(MAX_GAME_VOLUME, (x / w) * MAX_GAME_VOLUME))
    setGameVolume(v)
  }

  const fillW = createComputed(() => {
    const tw = trackW()
    return Math.max(
      0,
      Math.round(
        Math.max(0, Math.min(1, gameVolume() / MAX_GAME_VOLUME)) * tw,
      ),
    )
  })

  return (
    <box
      class="GameVolume-track"
      widthRequest={trackW}
      heightRequest={16}
      valign={Gtk.Align.CENTER}
      tooltipText="Volumen de juego (arrastrar / clic / rueda)"
      $={(self) => {
        const click = new Gtk.GestureClick()
        click.set_button(1)
        click.connect("pressed", (_g, _n, x) => setFromX(self, x))
        self.add_controller(click)

        const drag = new Gtk.GestureDrag()
        drag.connect("drag-begin", (_g, x) => setFromX(self, x))
        drag.connect("drag-update", (g) => {
          const start = g.get_start_point() as unknown as
            | [boolean, number, number]
            | boolean
          const off = g.get_offset() as unknown as
            | [boolean, number, number]
            | boolean
          if (!Array.isArray(start) || !Array.isArray(off)) return
          const [, sx] = start
          const [, dx] = off
          setFromX(self, sx + dx)
        })
        self.add_controller(drag)
      }}
    >
      <box class="GameVolume-fill" widthRequest={fillW} hexpand={false} />
    </box>
  )
}

export default function GameVolume() {
  const isVisible = createComputed(() => hasGameStream())

  const steamIconFile = createComputed(() =>
    gameMuted() ? ICON_STEAM_MUTED : ICON_STEAM_YELLOW,
  )

  const steamTip = createComputed(() => {
    const title = gameTitle()
    const pct = Math.round(gameVolume() * 100)
    const m = gameMuted() ? " [Silenciado]" : ""
    const action = expanded() ? "Contraer" : "Expandir"
    return `🎮 ${title}: ${pct}%${m} · clic: ${action} · medio: mute`
  })

  const rootClass = createComputed(() => {
    const parts = ["GameVolume"]
    if (gameMuted()) parts.push("muted")
    if (expanded()) parts.push("expanded")
    return parts.join(" ")
  })

  const controlsVisible = createComputed(() => expanded())

  return (
    <box
      class={rootClass}
      spacing={1}
      visible={isVisible}
      $={(self) => {
        const scroll = new Gtk.EventControllerScroll({
          flags:
            Gtk.EventControllerScrollFlags.VERTICAL |
            Gtk.EventControllerScrollFlags.DISCRETE,
        })
        scroll.connect("scroll", (_c, _dx, dy) => {
          bumpGameVolume(dy > 0 ? -0.05 : 0.05)
          return true
        })
        self.add_controller(scroll)
      }}
    >
      <button
        class="GameVolume-steam"
        tooltipText={steamTip}
        onClicked={() => toggleGameVolumeExpanded()}
        $={(self) => {
          /* Middle click → toggle mute */
          const mid = new Gtk.GestureClick()
          mid.set_button(2)
          mid.connect("released", () => toggleGameMute())
          self.add_controller(mid)
        }}
      >
        <image file={steamIconFile} pixelSize={16} />
      </button>

      <button
        class="GameVolume-step"
        tooltipText="-5%"
        visible={controlsVisible}
        onClicked={() => bumpGameVolume(-0.05)}
      >
        <label label="−" />
      </button>

      <box visible={controlsVisible}>
        <GameVolumeTrack />
      </box>

      <button
        class="GameVolume-step"
        tooltipText="+5%"
        visible={controlsVisible}
        onClicked={() => bumpGameVolume(0.05)}
      >
        <label label="+" />
      </button>
    </box>
  )
}
