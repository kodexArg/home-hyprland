import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import { createComputed } from "ags"
import {
  MAX_SPOTIFY_VOLUME,
  bumpSpotifyVolume,
  hasSpotifyStream,
  isSpotifyAppRunning,
  setSpotifyVolume,
  spotifyMuted,
  spotifyTitle,
  spotifyVolume,
  startSpotifyAudioMonitor,
  toggleSpotifyMute,
  toggleSpotifyPlay,
} from "./spotify-audio"
import { isZoomDense } from "./zoom"

startSpotifyAudioMonitor()

const ICON_DIR = `${GLib.get_user_config_dir()}/ags/icons`
const ICON_SPOTIFY_GREEN = `${ICON_DIR}/spotify-green.svg`
const ICON_SPOTIFY_MUTED = `${ICON_DIR}/spotify-muted.svg`

function SpotifyVolumeTrack() {
  const trackW = createComputed(() => (isZoomDense() ? 16 : 24))

  const setFromX = (widget: Gtk.Widget, x: number) => {
    const w = widget.get_allocated_width() || trackW()
    const v = Math.max(0, Math.min(MAX_SPOTIFY_VOLUME, x / w))
    setSpotifyVolume(v)
  }

  const bump = (delta: number) => {
    bumpSpotifyVolume(delta)
  }

  const fillW = createComputed(() => {
    const tw = trackW()
    if (spotifyMuted()) return 0
    const v = Number(spotifyVolume())
    return Math.max(0, Math.min(tw, Math.round(Math.max(0, Math.min(1, v)) * tw)))
  })

  return (
    <box
      class="SpotifyVolume-track"
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
        class="SpotifyVolume-fill"
        widthRequest={fillW}
        heightRequest={2}
        hexpand={false}
      />
    </box>
  )
}

export default function SpotifyVolume() {
  const isVisible = createComputed(() => hasSpotifyStream() || isSpotifyAppRunning())

  const iconFile = createComputed(() =>
    spotifyMuted() ? ICON_SPOTIFY_MUTED : ICON_SPOTIFY_GREEN,
  )

  const tip = createComputed(() => {
    const title = spotifyTitle()
    const pct = Math.round(spotifyVolume() * 100)
    const m = spotifyMuted() ? " [Silenciado]" : ""
    return `🎵 ${title}: ${pct}%${m} · clic: silenciar · medio: play/pausa · rueda: volumen`
  })

  const rootClass = createComputed(() => {
    const parts = ["SpotifyVolume"]
    if (spotifyMuted()) parts.push("muted")
    return parts.join(" ")
  })

  const bump = (delta: number) => {
    bumpSpotifyVolume(delta)
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
        class="SpotifyVolume-btn"
        tooltipText={tip}
        onClicked={() => toggleSpotifyMute()}
        hexpand={false}
        halign={Gtk.Align.CENTER}
        $={(self) => {
          /* Middle click → toggle play/pause */
          const mid = new Gtk.GestureClick()
          mid.set_button(2)
          mid.connect("released", () => toggleSpotifyPlay())
          self.add_controller(mid)
        }}
      >
        <image file={iconFile} pixelSize={isZoomDense() ? 10 : 13} />
      </button>

      <SpotifyVolumeTrack />
    </box>
  )
}
