import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import { createComputed } from "ags"
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

startGameAudioMonitor()

const TRACK_W = 100
const ICON_DIR = `${GLib.get_user_config_dir()}/ags/icons`
const ICON_STEAM_YELLOW = `${ICON_DIR}/steam-yellow.svg`
const ICON_STEAM_MUTED = `${ICON_DIR}/steam-muted.svg`

function GameVolumeTrack() {
  const setFromX = (widget: Gtk.Widget, x: number) => {
    const w = widget.get_allocated_width() || TRACK_W
    const v = Math.max(0, Math.min(MAX_GAME_VOLUME, (x / w) * MAX_GAME_VOLUME))
    setGameVolume(v)
  }

  const fillW = createComputed(() =>
    Math.max(
      0,
      Math.round(
        Math.max(0, Math.min(1, gameVolume() / MAX_GAME_VOLUME)) * TRACK_W,
      ),
    ),
  )

  return (
    <box
      class="GameVolume-track"
      widthRequest={TRACK_W}
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
    return `🎮 ${title}: ${pct}%${m} (clic para silenciar/reactivar)`
  })

  const rootClass = createComputed(() =>
    `GameVolume ${gameMuted() ? "muted" : ""}`,
  )

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
      {/* Ícono de Steam: clic para silenciar/reactivar juego en tándem */}
      <button
        class="GameVolume-steam"
        tooltipText={steamTip}
        onClicked={() => toggleGameMute()}
      >
        <image file={steamIconFile} pixelSize={16} />
      </button>

      <button
        class="GameVolume-step"
        tooltipText="-5%"
        onClicked={() => bumpGameVolume(-0.05)}
      >
        <label label="−" />
      </button>

      <GameVolumeTrack />

      <button
        class="GameVolume-step"
        tooltipText="+5%"
        onClicked={() => bumpGameVolume(0.05)}
      >
        <label label="+" />
      </button>
    </box>
  )
}
