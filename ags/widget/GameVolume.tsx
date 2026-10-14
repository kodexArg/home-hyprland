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
  isSteamAppRunning,
  setGameVolume,
  startGameAudioMonitor,
  toggleGameMute,
} from "./game-audio"
import { isZoomDense } from "./zoom"

startGameAudioMonitor()

const ICON_DIR = `${GLib.get_user_config_dir()}/ags/icons`
const ICON_STEAM_YELLOW = `${ICON_DIR}/steam-yellow.svg`
const ICON_STEAM_MUTED = `${ICON_DIR}/steam-muted.svg`

function GameVolumeTrack() {
  const trackW = createComputed(() => (isZoomDense() ? 16 : 24))

  const setFromX = (widget: Gtk.Widget, x: number) => {
    const w = widget.get_allocated_width() || trackW()
    const v = Math.max(0, Math.min(MAX_GAME_VOLUME, x / w))
    setGameVolume(v)
  }

  const bump = (delta: number) => {
    bumpGameVolume(delta)
  }

  const fillW = createComputed(() => {
    const tw = trackW()
    if (gameMuted()) return 0
    const v = Number(gameVolume())
    return Math.max(0, Math.min(tw, Math.round(Math.max(0, Math.min(1, v)) * tw)))
  })

  return (
    <box
      class="GameVolume-track"
      widthRequest={trackW}
      heightRequest={2}
      hexpand={false}
      vexpand={false}
      halign={Gtk.Align.CENTER}
      valign={Gtk.Align.CENTER}
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

        const scroll = new Gtk.EventControllerScroll({
          flags:
            Gtk.EventControllerScrollFlags.VERTICAL |
            Gtk.EventControllerScrollFlags.DISCRETE,
        })
        scroll.connect("scroll", (_c, _dx, dy) => {
          bump(dy > 0 ? -0.05 : 0.05)
          return true
        })
        self.add_controller(scroll)
      }}
    >
      <box
        class="GameVolume-fill"
        widthRequest={fillW}
        heightRequest={2}
        hexpand={false}
      />
    </box>
  )
}

export default function GameVolume() {
  const isVisible = createComputed(() => hasGameStream() || isSteamAppRunning())

  const steamIconFile = createComputed(() =>
    gameMuted() ? ICON_STEAM_MUTED : ICON_STEAM_YELLOW,
  )

  const steamTip = createComputed(() => {
    const title = gameTitle()
    const pct = Math.round(gameVolume() * 100)
    const m = gameMuted() ? " [Silenciado]" : ""
    return `🎮 ${title}: ${pct}%${m} · clic: silenciar · rueda: volumen`
  })

  const rootClass = createComputed(() => {
    const parts = ["GameVolume"]
    if (gameMuted()) parts.push("muted")
    return parts.join(" ")
  })

  const bump = (delta: number) => {
    bumpGameVolume(delta)
  }

  return (
    <box
      class={rootClass}
      orientation={Gtk.Orientation.VERTICAL}
      spacing={isZoomDense() ? 4 : 5}
      valign={Gtk.Align.CENTER}
      halign={Gtk.Align.CENTER}
      visible={isVisible}
      tooltipText="scroll mouse to change volume"
      $={(self) => {
        const scroll = new Gtk.EventControllerScroll({
          flags:
            Gtk.EventControllerScrollFlags.VERTICAL |
            Gtk.EventControllerScrollFlags.DISCRETE,
        })
        scroll.connect("scroll", (_c, _dx, dy) => {
          bump(dy > 0 ? -0.05 : 0.05)
          return true
        })
        self.add_controller(scroll)
      }}
    >
      <button
        class="GameVolume-steam"
        tooltipText={steamTip}
        onClicked={() => toggleGameMute()}
        hexpand={false}
        halign={Gtk.Align.CENTER}
        $={(self) => {
          /* Middle click → toggle mute */
          const mid = new Gtk.GestureClick()
          mid.set_button(2)
          mid.connect("released", () => toggleGameMute())
          self.add_controller(mid)
        }}
      >
        <image file={steamIconFile} pixelSize={isZoomDense() ? 10 : 13} />
      </button>

      <GameVolumeTrack />
    </box>
  )
}
