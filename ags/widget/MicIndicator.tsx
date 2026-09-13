import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import GLib from "gi://GLib"
import Pango from "gi://Pango"
import { createComputed, For } from "ags"
import { createPoll } from "ags/time"
import { barVisible, setOverBar } from "./bar-mode"
import {
  startMicWatch,
  toggleMicMute,
  micMuted,
  micName,
  micHearing,
  listMicrophoneSources,
  selectMicrophoneSource,
  turnOffMicrophone,
  probeEasyEffects,
  type MicTone,
  type MicSource,
  type EasyEffectsInfo,
} from "./mic"
import {
  micMenuOpen,
  openMicMenu,
  closeAllClusterMenus,
  readLastLogLine,
  FSM1_LOG,
} from "./cluster-menu"

const ICON_DIR = `${GLib.get_user_config_dir()}/ags/icons`
const PANEL_GAP = 4

const ICON_BY_TONE: Record<MicTone, string> = {
  muted: `${ICON_DIR}/vintage-mic-dark.svg`,
  unmuted: `${ICON_DIR}/vintage-mic-gray.svg`,
  voice: `${ICON_DIR}/vintage-mic-green.svg`,
  busy: `${ICON_DIR}/vintage-mic-orange.svg`,
  recording: `${ICON_DIR}/vintage-mic-red.svg`,
  error: `${ICON_DIR}/vintage-mic-red.svg`,
}

function MicClickaway(gdkmonitor: Gdk.Monitor) {
  const { TOP, RIGHT, LEFT, BOTTOM } = Astal.WindowAnchor
  const visible = createComputed(() => micMenuOpen() && barVisible())

  return (
    <window
      visible={visible}
      name="mic-clickaway"
      namespace="ags-mic-clickaway"
      class="MicClickaway"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.IGNORE}
      anchor={TOP | RIGHT | LEFT | BOTTOM}
      layer={Astal.Layer.TOP}
      keymode={Astal.Keymode.NONE}
      application={app}
      $={(self: Gtk.Window) => {
        const click = new Gtk.GestureClick()
        click.set_button(0)
        click.connect("pressed", () => closeAllClusterMenus())
        self.add_controller(click)
      }}
    >
      <box hexpand vexpand />
    </window>
  )
}

function MicPanel(gdkmonitor: Gdk.Monitor) {
  const { TOP, RIGHT } = Astal.WindowAnchor
  const panelVisible = createComputed(() => micMenuOpen() && barVisible())

  MicClickaway(gdkmonitor)

  const sourcesFp = createPoll("", 5000, () =>
    JSON.stringify(listMicrophoneSources()),
  )
  const sources = createComputed((): MicSource[] => {
    try {
      return JSON.parse(sourcesFp()) || []
    } catch {
      return []
    }
  })

  const eeFp = createPoll("", 8000, () => JSON.stringify(probeEasyEffects()))
  const eeInfo = createComputed((): EasyEffectsInfo => {
    try {
      return JSON.parse(eeFp()) || { available: false, sourceName: null, preset: null, plugins: [], inputDevice: null, summary: "" }
    } catch {
      return { available: false, sourceName: null, preset: null, plugins: [], inputDevice: null, summary: "" }
    }
  })

  const lastFsm1Log = createPoll(readLastLogLine(FSM1_LOG), 1000, () =>
    readLastLogLine(FSM1_LOG),
  )

  const fsm1Badge = createComputed(() => {
    if (micMuted()) return "[MIC_OFF]"
    if (micHearing()) return "[VOZ VIVA]"
    return "[MIC_ON]"
  })

  const statusLine = createComputed(() => {
    const name = micName()
    const state = micMuted() ? "Silenciado" : "Activo"
    const hearing = micHearing() ? " · 🟢 Audio" : ""
    return `${name}  ·  ${state}${hearing}`
  })

  const statusCls = createComputed(() => {
    if (micMuted()) return "LocalLlm-status off"
    if (micHearing()) return "LocalLlm-status ready"
    return "LocalLlm-status"
  })

  const offClass = createComputed(() => {
    return micMuted() ? "LocalLlm-off armed" : "LocalLlm-off"
  })

  const eeVisible = createComputed(() => eeInfo().available)
  const eeSummary = createComputed(() => eeInfo().summary || "Easy Effects disponible")
  const eePreset = createComputed(() => {
    const p = eeInfo().preset
    return p ? `Preset: ${p}` : "Easy Effects"
  })
  const eeSourceReady = createComputed(() => Boolean(eeInfo().sourceName))
  const eeBadge = createComputed(() => (eeSourceReady() ? "[LISTO]" : "[SIN SOURCE]"))

  return (
    <window
      visible={panelVisible}
      name="mic-panel"
      namespace="ags-mic-panel"
      class="MicPanel"
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
            closeAllClusterMenus()
            return true
          }
          return false
        })
        self.add_controller(key)
      }}
    >
      <box
        class="LocalLlm-menu MicMenu"
        orientation={Gtk.Orientation.VERTICAL}
        spacing={4}
        valign={Gtk.Align.CENTER}
        $={(self) => {
          const motion = new Gtk.EventControllerMotion()
          motion.connect("enter", () => setOverBar(true))
          motion.connect("leave", () => setOverBar(false))
          self.add_controller(motion)
        }}
      >
        <label class={statusCls} label={statusLine} xalign={0} />

        <box class="LocalLlm-log-box" orientation={Gtk.Orientation.VERTICAL}>
          <box spacing={6} valign={Gtk.Align.CENTER}>
            <label class="LocalLlm-log-title" label="📋 ÚLTIMO ESTADO FSM1" hexpand xalign={0} />
            <label class="LocalLlm-log-title" label={fsm1Badge} xalign={1} />
          </box>
          <label
            class="LocalLlm-log-content"
            label={lastFsm1Log}
            xalign={0}
            wrap
            wrapMode={Pango.WrapMode.WORD_CHAR}
          />
        </box>

        <box
          class="Mic-ee-box"
          orientation={Gtk.Orientation.VERTICAL}
          spacing={2}
          visible={eeVisible}
        >
          <box spacing={6} valign={Gtk.Align.CENTER}>
            <label class="LocalLlm-log-title" label="🎛 EASY EFFECTS" hexpand xalign={0} />
            <label
              class="LocalLlm-log-title"
              label={eeBadge}
              xalign={1}
            />
          </box>
          <label class="Mic-ee-preset" label={eePreset} xalign={0} />
          <label
            class="Mic-ee-summary"
            label={eeSummary}
            xalign={0}
            wrap
            wrapMode={Pango.WrapMode.WORD_CHAR}
          />
          <button
            class="LocalLlm-model"
            visible={eeSourceReady}
            tooltipText="Usar Easy Effects como entrada predeterminada"
            onClicked={() => {
              const n = eeInfo.peek().sourceName
              if (n) selectMicrophoneSource(n)
            }}
          >
            <box spacing={8} valign={Gtk.Align.CENTER} hexpand>
              <label class="LocalLlm-mark" label="★" xalign={0.5} />
              <label
                class="LocalLlm-label"
                label="Usar Easy Effects (preferido)"
                xalign={0}
                hexpand
              />
            </box>
          </button>
        </box>

        <box class="LocalLlm-sep" heightRequest={1} hexpand />

        <label class="LocalLlm-section-title" label="DISPOSITIVOS DE ENTRADA" xalign={0} />

        <For each={sources}>
          {(s) => {
            const rowClass = createComputed(() => {
              void micName()
              void micMuted()
              const on = s.isDefault ? "on" : ""
              const ee = s.isEasyEffects ? "ee" : ""
              return `LocalLlm-model Mic-source ${on} ${ee}`.trim()
            })
            const mark = createComputed(() => {
              void micName()
              if (s.isDefault) return "●"
              if (s.isEasyEffects) return "★"
              return "○"
            })
            const title = s.isEasyEffects
              ? `${s.title} · preferido`
              : s.title
            return (
              <button
                class={rowClass}
                tooltipText={`Seleccionar ${s.description} como micrófono predeterminado`}
                onClicked={() => selectMicrophoneSource(s.name)}
              >
                <box spacing={8} valign={Gtk.Align.CENTER} hexpand>
                  <label class="LocalLlm-mark" label={mark} xalign={0.5} />
                  <box orientation={Gtk.Orientation.VERTICAL} hexpand spacing={0}>
                    <label
                      class="LocalLlm-label"
                      label={title}
                      xalign={0}
                      hexpand
                    />
                    <label
                      class="Mic-source-detail"
                      label={s.detail}
                      xalign={0}
                      hexpand
                    />
                  </box>
                </box>
              </button>
            )
          }}
        </For>

        <box class="LocalLlm-sep" heightRequest={1} hexpand />

        <button
          class={offClass}
          tooltipText="Silenciar micrófono · Desactivar entrada de audio (OFF)"
          onClicked={() => turnOffMicrophone()}
        >
          <box spacing={8} valign={Gtk.Align.CENTER} hexpand>
            <label class="LocalLlm-mark" label="⏹" xalign={0.5} />
            <label
              class="LocalLlm-label"
              label="Silenciar micrófono (OFF)"
              xalign={0}
              hexpand
            />
          </box>
        </button>
      </box>
    </window>
  )
}

export default function MicIndicator({
  gdkmonitor,
}: {
  gdkmonitor?: Gdk.Monitor
} = {}) {
  startMicWatch()
  if (gdkmonitor) {
    MicPanel(gdkmonitor)
  }

  const tone = createComputed((): MicTone => {
    if (micMuted()) return "muted"
    if (micHearing()) return "voice"
    return "unmuted"
  })

  const iconFile = createComputed(() => {
    const t = tone()
    return ICON_BY_TONE[t] || ICON_BY_TONE.muted
  })

  const tip = createComputed(() => {
    const name = GLib.markup_escape_text(micName() || "Micrófono predeterminado", -1)
    const t = tone()
    let badgeText = "EN ESPERA"
    let badgeColor = "#9a9a9a"
    let action = "Silenciar micrófono"

    if (t === "muted") {
      badgeText = "SILENCIADO"
      badgeColor = "#c45c4a"
      action = "Activar micrófono"
    } else if (t === "voice") {
      badgeText = "VOZ VIVA"
      badgeColor = "#7bc96f"
      action = "Silenciar micrófono"
    }

    const stateLine = t === "voice"
      ? `Entrada: <b>${name}</b>  ·  <span foreground="#7bc96f">● detectando audio</span>`
      : `Entrada: <b>${name}</b>`

    return [
      `<b><span size="small" letter_spacing="1500" foreground="#ff8c42">🎙️ MICRÓFONO</span></b>   <span size="small" weight="bold" foreground="${badgeColor}">[${badgeText}]</span>`,
      stateLine,
      `<span size="smaller" alpha="75%">Clic: ${action}  ·  Clic secundario: Selector de entrada</span>`,
    ].join("\n")
  })

  const cls = createComputed(() => {
    const t = tone()
    const open = micMenuOpen() ? "open" : ""
    return `MicIndicator ${t} ${t === "voice" ? "hearing live" : t === "unmuted" ? "idle" : "muted"} ${open}`.trim()
  })

  return (
    <button
      class={cls}
      tooltipMarkup={tip}
      $={(self: Gtk.Button) => {
        const click = new Gtk.GestureClick()
        click.set_button(0)
        click.connect("pressed", (_g, _n, _x, _y) => {
          const btn = click.get_current_button()
          if (btn === 3) {
            openMicMenu()
          } else if (btn === 1) {
            toggleMicMute()
          }
        })
        self.add_controller(click)
      }}
    >
      <image file={iconFile} pixelSize={16} />
    </button>
  )
}
