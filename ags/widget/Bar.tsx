import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import AstalWp from "gi://AstalWp"
import GLib from "gi://GLib"
import { createBinding, createComputed } from "ags"
import { createPoll } from "ags/time"
import { barModeClass, barVisible, setOverBar } from "./bar-mode"
import LocalLlm from "./LocalLlm"
import RamTrack from "./RamTrack"
import SystemMenu from "./SystemMenu"
import WorkspacePeek from "./WorkspacePeek"
// import RecMenu from "./RecMenu" // parked — REC lamp menu WIP, re-enable later
import DictatorIndicator from "./DictatorIndicator"
import LiveIndicator from "./LiveIndicator"
import KodexbotChip from "./KodexbotChip"
import RecModeIndicator from "./RecModeIndicator"
import CastRecChip from "./CastRecChip"
import MicIndicator from "./MicIndicator"
import GameVolume from "./GameVolume"
import { ensureGameStreamsFollowDefault } from "./game-audio"
// import LiveModeIndicator from "./LiveModeIndicator" // Super+L liberada 2026-08-01
// Caffeine + ClockCluster parked (UI hidden). Restore with widget/caffeine.ts + block below.
// import {
//   caffeineShellClass,
//   caffeineTooltip,
//   caffeineUiOn,
//   toggleCaffeine,
// } from "./caffeine"
// export {
//   toggleCaffeine,
//   getCaffeineOn,
//   getCaffeineStatus,
//   getCaffeineToken,
//   requestCaffeineOn,
//   requestCaffeineOff,
// } from "./caffeine"

const TRACK_W = 140

const ICON_DIR = `${GLib.get_user_config_dir()}/ags/icons`
const ICON_SPEAKERS = `${ICON_DIR}/speakers.svg`
const ICON_MUTED = `${ICON_DIR}/muted.svg`
const ICON_HEADPHONES = `${ICON_DIR}/headphones.svg`

function isVirtualEndpoint(ep: AstalWp.Endpoint): boolean {
  const d = `${ep.description ?? ""} ${ep.name ?? ""}`.toLowerCase()
  return (
    d.includes("easy effects") ||
    d.includes("easyeffects") ||
    d.includes("echo-cancel")
  )
}

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

function endpointLooksLikeHdmiHeadphones(ep: AstalWp.Endpoint): boolean {
  if (isVirtualEndpoint(ep)) return false
  const d = `${ep.description ?? ""} ${ep.name ?? ""}`.toLowerCase()
  return (
    d.includes("auricular") ||
    d.includes("headphone") ||
    d.includes("headset") ||
    d.includes("g2790g4") ||
    d.includes("aoc") ||
    d.includes("tu106") ||
    (d.includes("hdmi") && !d.includes("asus"))
  )
}

function endpointLooksLikeMbSpeakers(ep: AstalWp.Endpoint): boolean {
  if (isVirtualEndpoint(ep)) return false
  if (endpointLooksLikeHdmiHeadphones(ep)) return false
  const d = `${ep.description ?? ""} ${ep.name ?? ""}`.toLowerCase()
  return (
    d.includes("parlante") ||
    d.includes("motherboard") ||
    d.includes("analog") ||
    d.includes("ryzen") ||
    d.includes("alc897") ||
    d.includes("lineout") ||
    d.includes("line-out") ||
    d.includes("family 17h") ||
    d.includes("starship")
  )
}

type OutputMode = "speakers" | "mute" | "headphones"

function endpointIsHeadphones(ep: AstalWp.Endpoint): boolean {
  if (isVirtualEndpoint(ep)) return false
  if (endpointLooksLikeHdmiHeadphones(ep)) return true
  if (endpointLooksLikeMbSpeakers(ep)) return false
  const r = ep.route
  return routeLooksLikeHeadphones(r?.name, r?.description)
}

function listSpeakers(wp: AstalWp.Wp): AstalWp.Endpoint[] {
  return (wp.audio?.speakers ?? []).filter((s) => !isVirtualEndpoint(s))
}

function findSpeakerSink(wp: AstalWp.Wp): AstalWp.Endpoint | null {
  const all = listSpeakers(wp)
  return (
    all.find((s) => endpointLooksLikeMbSpeakers(s)) ??
    all.find((s) => !endpointIsHeadphones(s)) ??
    null
  )
}

function findHeadphoneSink(wp: AstalWp.Wp): AstalWp.Endpoint | null {
  const all = listSpeakers(wp)
  return (
    all.find((s) => endpointLooksLikeHdmiHeadphones(s)) ??
    all.find((s) => endpointIsHeadphones(s)) ??
    null
  )
}

function modeOfEndpoint(ep: AstalWp.Endpoint): OutputMode {
  if (!ep || ep.mute) return "mute"
  if (endpointIsHeadphones(ep)) return "headphones"
  return "speakers"
}

function currentOutputMode(wp: AstalWp.Wp): OutputMode {
  const def = wp.defaultSpeaker
  if (!def) return "speakers"
  if (def.mute) return "mute"
  if (isVirtualEndpoint(def)) {
    const sp = findSpeakerSink(wp)
    const hp = findHeadphoneSink(wp)
    if (hp && !hp.mute) return "headphones"
    if (sp && !sp.mute) return "speakers"
    return "mute"
  }
  return modeOfEndpoint(def)
}

function iconFileForMode(mode: OutputMode): string {
  if (mode === "mute") return ICON_MUTED
  if (mode === "headphones") return ICON_HEADPHONES
  return ICON_SPEAKERS
}

function muteAllPhysicalSinks(wp: AstalWp.Wp) {
  const hp = findHeadphoneSink(wp)
  const sp = findSpeakerSink(wp)
  if (sp) sp.set_mute(true)
  if (hp) hp.set_mute(true)
}

function cycleOutputMode(wp: AstalWp.Wp) {
  const mode = currentOutputMode(wp)
  const hp = findHeadphoneSink(wp)
  const sp = findSpeakerSink(wp)

  if (mode === "speakers") {
    muteAllPhysicalSinks(wp)
    ensureGameStreamsFollowDefault()
    return
  }
  if (mode === "mute") {
    if (sp) sp.set_mute(true)
    if (hp) {
      hp.set_is_default(true)
      hp.set_mute(false)
    } else {
      wp.defaultSpeaker?.set_mute(false)
    }
    for (const s of wp.audio?.speakers ?? []) {
      if (isVirtualEndpoint(s)) s.set_mute(false)
    }
    ensureGameStreamsFollowDefault()
    return
  }
  if (hp) hp.set_mute(true)
  if (sp) {
    sp.set_is_default(true)
    sp.set_mute(false)
  } else {
    wp.defaultSpeaker?.set_mute(false)
  }
  for (const s of wp.audio?.speakers ?? []) {
    if (isVirtualEndpoint(s)) s.set_mute(false)
  }
  ensureGameStreamsFollowDefault()
}

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

  const fillW = vol((v) =>
    Math.max(0, Math.round(Math.max(0, Math.min(1, v)) * TRACK_W)),
  )

  return (
    <box
      class="Volume-track"
      widthRequest={TRACK_W}
      heightRequest={16}
      valign={Gtk.Align.CENTER}
      tooltipText="Drag / click / scroll"
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
      <box class="Volume-fill" widthRequest={fillW} hexpand={false} />
    </box>
  )
}

function Volume() {
  const wp = AstalWp.get_default()!
  const speaker = () => wp.defaultSpeaker

  const mute = createBinding(wp, "defaultSpeaker", "mute")
  const sinkId = createBinding(wp, "defaultSpeaker", "id")
  const sinkDesc = createBinding(wp, "defaultSpeaker", "description")
  const routePulse = createPoll(0, 250, () => {
    const s = AstalWp.get_default()?.defaultSpeaker
    const r = s?.route
    const sp = AstalWp.get_default() ? findSpeakerSink(AstalWp.get_default()!) : null
    const hp = AstalWp.get_default() ? findHeadphoneSink(AstalWp.get_default()!) : null
    return `${s?.id ?? 0}|${s?.mute ? 1 : 0}|${sp?.mute ? 1 : 0}|${hp?.mute ? 1 : 0}|${r?.name ?? ""}`.length
  })

  const outputIconFile = createComputed(() => {
    void mute()
    void sinkId()
    void sinkDesc()
    void routePulse()
    return iconFileForMode(currentOutputMode(wp))
  })

  const iconTip = createComputed(() => {
    void mute()
    void sinkId()
    void routePulse()
    const mode = currentOutputMode(wp)
    if (mode === "mute") return "Silencio → Auriculares"
    if (mode === "headphones") return "Auriculares → Parlantes"
    return "Parlantes → Silencio"
  })

  const bump = (delta: number) => {
    const s = speaker()
    s.set_volume(Math.max(0, Math.min(1, s.volume + delta)))
  }

  return (
    <box
      class="Volume"
      spacing={1}
      tooltipText={sinkDesc((d) => d || "Volume")}
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
        class="Volume-mute"
        tooltipText={iconTip}
        onClicked={() => cycleOutputMode(wp)}
      >
        <image file={outputIconFile} pixelSize={16} />
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

// --- parked: ClockCluster (clock + caffeine cup) — restore with caffeine imports above ---
// const ICON_CAFFEINE_ON = `${ICON_DIR}/caffeine-on.svg`
// const ICON_CAFFEINE_OFF = `${ICON_DIR}/caffeine-off.svg`
//
// function ClockCaffeine({ timeFormat = "%H:%M" }) {
//   const time = createPoll("", 1000, () =>
//     GLib.DateTime.new_now_local().format(timeFormat)!,
//   )
//   const iconFile = caffeineUiOn((on) =>
//     on ? ICON_CAFFEINE_ON : ICON_CAFFEINE_OFF,
//   )
//
//   return (
//     <box class={caffeineShellClass} spacing={0} valign={Gtk.Align.CENTER}>
//       <menubutton class="ClockCluster-time" tooltipText="Calendar">
//         <label class="Clock-time" label={time} />
//         <popover>
//           <Gtk.Calendar />
//         </popover>
//       </menubutton>
//
//       <button
//         class="ClockCluster-cup"
//         tooltipText={caffeineTooltip}
//         onClicked={() => toggleCaffeine()}
//       >
//         <image file={iconFile} pixelSize={14} />
//       </button>
//     </box>
//   )
// }
// --- end parked ClockCaffeine ---

/** Clock only — DSEG7, no caffeine. */
function Clock({ timeFormat = "%H:%M" }) {
  const time = createPoll("", 1000, () =>
    GLib.DateTime.new_now_local().format(timeFormat)!,
  )

  return (
    <menubutton class="Clock" tooltipText="Calendar" valign={Gtk.Align.CENTER}>
      <label class="Clock-time" label={time} />
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
          <GameVolume />
        </box>
        <box $type="center">
          <WorkspacePeek />
        </box>
        {/* spacing=10: equal gap brain · track · clock · sandwich (and chips) */}
        <box $type="end" spacing={10} class="Bar-end">
          {/* legacy voice indicators retired 2026-08-01 — kodexBot cutover */}
          {/* <LiveIndicator /> */}
          {/* <DictationIndicator /> */}
          {/* <LiveModeIndicator /> — desactivado 2026-08-01: Super+L liberada */}
          <KodexbotChip />
          <RecModeIndicator />
          <CastRecChip />
          {/* <RecMenu gdkmonitor={gdkmonitor} /> parked — REC lamp WIP */}
          {/* mic indicator + dictator indicator + brain clustered tightly (spacing=2) */}
          <box spacing={2} class="BrainCluster" valign={Gtk.Align.CENTER}>
            <MicIndicator />
            <DictatorIndicator />
            <LocalLlm gdkmonitor={gdkmonitor} />
          </box>
          <RamTrack />
          {/* <ClockCaffeine /> parked — clock+cup cluster; see ClockCaffeine above */}
          <Clock />
          {/* Extreme right: sandwich → system menu (mic · restart · power off) */}
          <SystemMenu gdkmonitor={gdkmonitor} />
        </box>
      </centerbox>
    </window>
  )
}
