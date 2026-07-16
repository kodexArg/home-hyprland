import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import AstalWp from "gi://AstalWp"
import GLib from "gi://GLib"
import { createBinding, createComputed } from "ags"
import { createPoll } from "ags/time"
import { barModeClass, barVisible, setOverBar } from "./bar-mode"

const TRACK_W = 140

/**
 * Fixed triple (status icons — same Adwaita family as the old volume ladder so
 * they always paint in this bar). No headphones-mute: mute always uses slash.
 *
 *   speakers   → audio-volume-high-symbolic   (parlante)
 *   muted      → audio-volume-muted-symbolic  (parlante tachado)
 *   headphones → audio-headphones-symbolic   (auris)
 *
 * This host: HDMI (TU106) = speakers · Ryzen analog port headphones = auris.
 * WirePlumber default sink must match the real path (GNOME does this on jack).
 */
const ICON_SPEAKERS = "audio-volume-high-symbolic"
const ICON_MUTED = "audio-volume-muted-symbolic"
const ICON_HEADPHONES = "audio-headphones-symbolic"

function routeLooksLikeHeadphones(
  name: string | null | undefined,
  description: string | null | undefined,
): boolean {
  const hay = `${name ?? ""} ${description ?? ""}`.toLowerCase()
  return (
    hay.includes("headphone") ||
    hay.includes("headset") ||
    hay.includes("auricular")
  )
}

type OutputMode = "speakers" | "mute" | "headphones"

function endpointIsHeadphones(ep: AstalWp.Endpoint): boolean {
  const r = ep.route
  return routeLooksLikeHeadphones(r?.name, r?.description)
}

function listSpeakers(wp: AstalWp.Wp): AstalWp.Endpoint[] {
  return wp.audio?.speakers ?? []
}

/** HDMI / non-jack sink (this host: TU106 HDMI). */
function findSpeakerSink(wp: AstalWp.Wp): AstalWp.Endpoint | null {
  const all = listSpeakers(wp)
  return (
    all.find((s) => {
      const d = (s.description ?? "").toLowerCase()
      return d.includes("hdmi") || d.includes("displayport")
    }) ??
    all.find((s) => !endpointIsHeadphones(s)) ??
    null
  )
}

/** Analog jack sink when route is headphones (this host: Ryzen ALC897). */
function findHeadphoneSink(wp: AstalWp.Wp): AstalWp.Endpoint | null {
  return listSpeakers(wp).find((s) => endpointIsHeadphones(s)) ?? null
}

function currentOutputMode(wp: AstalWp.Wp): OutputMode {
  const s = wp.defaultSpeaker
  if (s.mute) return "mute"
  if (endpointIsHeadphones(s)) return "headphones"
  return "speakers"
}

/**
 * Icon click cycle (fixed order):
 *   parlante → mute → auris → parlante
 * Mute is always the slash icon; no headphones-mute state.
 */
function cycleOutputMode(wp: AstalWp.Wp) {
  const mode = currentOutputMode(wp)
  if (mode === "speakers") {
    wp.defaultSpeaker.set_mute(true)
    return
  }
  if (mode === "mute") {
    const hp = findHeadphoneSink(wp)
    if (hp) {
      hp.set_is_default(true)
      hp.set_mute(false)
    } else {
      wp.defaultSpeaker.set_mute(false)
    }
    return
  }
  // headphones → speakers
  const sp = findSpeakerSink(wp)
  if (sp) {
    sp.set_is_default(true)
    sp.set_mute(false)
  } else {
    wp.defaultSpeaker.set_mute(false)
  }
}

/**
 * Volume track: click / drag / scroll — no Gtk.Scale (broken hit-target on
 * layer-shell + GSK gl for us). Fill width mirrors WirePlumber volume.
 */
function VolumeTrack() {
  const wp = AstalWp.get_default()!
  const speaker = () => wp.defaultSpeaker
  const vol = createBinding(wp, "defaultSpeaker", "volume")

  const setFromX = (widget: Gtk.Widget, x: number) => {
    const w = widget.get_allocated_width() || TRACK_W
    const v = Math.max(0, Math.min(1, x / w))
    speaker().set_volume(v)
  }

  const bump = (delta: number) => {
    const s = speaker()
    s.set_volume(Math.max(0, Math.min(1, s.volume + delta)))
  }

  // Fill is a *child* — never rebind css/class on the gesture target itself
  // (that tears down controllers mid-click and feels "not clickable").
  const fillW = vol((v) =>
    Math.max(0, Math.round(Math.max(0, Math.min(1, v)) * TRACK_W)),
  )

  return (
    <box
      class="Volume-track"
      widthRequest={TRACK_W}
      heightRequest={22}
      valign={Gtk.Align.CENTER}
      tooltipText="Drag / click / scroll"
      $={(self) => {
        // Click-to-seek (left button)
        const click = new Gtk.GestureClick()
        click.set_button(1)
        click.connect("pressed", (_g, _n, x) => setFromX(self, x))
        self.add_controller(click)

        // Drag — GJS out-params come back as [ok, x, y]
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

        // Scroll wheel
        const scroll = new Gtk.EventControllerScroll({
          flags:
            Gtk.EventControllerScrollFlags.VERTICAL |
            Gtk.EventControllerScrollFlags.DISCRETE,
        })
        scroll.connect("scroll", (_c, _dx, dy) => {
          // dy > 0 = scroll down = quieter
          bump(dy > 0 ? -0.05 : 0.05)
          return true
        })
        self.add_controller(scroll)
      }}
    >
      <box class="Volume-fill" widthRequest={fillW} hexpand={false} />
    </box>
  )
}

/** Volume: output icon (speakers / mute / headphones), track, ±. First control on the bar. */
function Volume() {
  const wp = AstalWp.get_default()!
  // Always resolve default sink (HDMI speakers vs Ryzen analog headphones).
  const speaker = () => wp.defaultSpeaker

  // Nested bindings re-track when defaultSpeaker / route changes (gnim multi-prop).
  // Also bind sink id/description so a default-node switch (HDMI ↔ analog) repaints.
  const mute = createBinding(wp, "defaultSpeaker", "mute")
  const sinkId = createBinding(wp, "defaultSpeaker", "id")
  const routeName = createBinding(wp, "defaultSpeaker", "route", "name")
  const routeDesc = createBinding(
    wp,
    "defaultSpeaker",
    "route",
    "description",
  )
  const sinkDesc = createBinding(wp, "defaultSpeaker", "description")

  const outputIcon = createComputed(() => {
    // touch sinkId so default-node changes recompute even if mute/route objects stick
    void sinkId()
    void sinkDesc()
    if (mute()) return ICON_MUTED
    if (routeLooksLikeHeadphones(routeName(), routeDesc()))
      return ICON_HEADPHONES
    return ICON_SPEAKERS
  })

  const iconTip = createComputed(() => {
    void sinkId()
    if (mute()) return "Muted → headphones"
    if (routeLooksLikeHeadphones(routeName(), routeDesc()))
      return "Headphones → speakers"
    return "Speakers → mute"
  })

  const bump = (delta: number) => {
    const s = speaker()
    s.set_volume(Math.max(0, Math.min(1, s.volume + delta)))
  }

  return (
    <box
      class="Volume"
      spacing={4}
      tooltipText={sinkDesc((d) => d || "Volume")}
      $={(self) => {
        // Scroll anywhere on the volume group
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
        class="Volume-mute"
        tooltipText={iconTip}
        onClicked={() => cycleOutputMode(wp)}
      >
        <image iconName={outputIcon} pixelSize={18} />
      </button>

      <button
        class="Volume-step"
        tooltipText="-5%"
        onClicked={() => bump(-0.05)}
      >
        <label label="−" />
      </button>

      <VolumeTrack />

      <button
        class="Volume-step"
        tooltipText="+5%"
        onClicked={() => bump(0.05)}
      >
        <label label="+" />
      </button>
    </box>
  )
}

function Clock({ format = "%H:%M" }) {
  const time = createPoll("", 1000, () => {
    return GLib.DateTime.new_now_local().format(format)!
  })

  return (
    <menubutton class="Clock">
      <label label={time} />
      <popover>
        <Gtk.Calendar />
      </popover>
    </menubutton>
  )
}

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

export default function Bar(gdkmonitor: Gdk.Monitor) {
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor

  return (
    <window
      visible={barVisible}
      name="bar"
      namespace="ags-bar"
      class={barModeClass}
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={TOP | LEFT | RIGHT}
      layer={Astal.Layer.TOP}
      // Pointer only — ON_DEMAND can steal keys; NONE still receives clicks.
      keymode={Astal.Keymode.NONE}
      application={app}
      $={(self) =>
        attachMotion(
          self,
          () => setOverBar(true),
          () => setOverBar(false),
        )
      }
    >
      <centerbox cssName="centerbox">
        <box $type="start" spacing={8} class="Bar-start">
          <Volume />
        </box>
        <box $type="center" />
        <box $type="end" spacing={8} class="Bar-end">
          <Clock />
        </box>
      </centerbox>
    </window>
  )
}
