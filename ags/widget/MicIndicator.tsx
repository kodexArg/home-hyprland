import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import GLib from "gi://GLib"
import Pango from "gi://Pango"
import { createComputed, For } from "ags"
import { createPoll } from "ags/time"
import { barVisible, setOverBar } from "./bar-mode"
import { isZoomDense } from "./zoom"
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
  eeEnabled,
  eeBusy,
  eeResync,
  setEasyEffects,
  eeReclaimsStreams,
  type MicTone,
  type MicSource,
  type EasyEffectsInfo,
} from "./mic"
import { micMenuOpen, openMicMenu, closeAllClusterMenus } from "./cluster-menu"
import { voz, vozUp, vozSend, vozToast, type VozMode } from "./voz"

// Modos del daemon de voz (hyprland-whisper). El micrófono es su interfaz.
const VOZ_MODE_LABEL: Record<VozMode, string> = {
  comando: "ÓRDENES",
  dictado: "DICTADO",
  off: "APAGADO",
}

/** Aviso breve bajo la barra con lo último que hizo la voz (reemplaza a notify-send). */
function VozToast(gdkmonitor: Gdk.Monitor) {
  const { TOP, RIGHT } = Astal.WindowAnchor
  const visible = createComputed(() => vozToast() !== "" && !micMenuOpen())

  return (
    <window
      visible={visible}
      name="voz-toast"
      namespace="ags-voz-toast"
      class="MicPanel VozToast"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.NORMAL}
      anchor={TOP | RIGHT}
      layer={Astal.Layer.OVERLAY}
      marginTop={4}
      marginRight={8}
      keymode={Astal.Keymode.NONE}
      application={app}
    >
      <box class="LocalLlm-menu VozToast-box">
        <label
          class="LocalLlm-label"
          label={vozToast}
          xalign={0}
          wrap
          wrapMode={Pango.WrapMode.WORD_CHAR}
          maxWidthChars={48}
        />
      </box>
    </window>
  )
}

function VozModeRow({ id, label, hint }: { id: VozMode; label: string; hint: string }) {
  const on = createComputed(() => vozUp() && voz().mode === id)
  return (
    <button
      class={createComputed(() => (on() ? "LocalLlm-model on" : "LocalLlm-model"))}
      tooltipText={hint}
      onClicked={() => vozSend(`mode ${id}`)}
    >
      <box spacing={8} valign={Gtk.Align.CENTER} hexpand>
        <label class="LocalLlm-mark" label={createComputed(() => (on() ? "●" : "○"))} xalign={0.5} />
        <box orientation={Gtk.Orientation.VERTICAL} hexpand spacing={0}>
          <label class="LocalLlm-label" label={label} xalign={0} hexpand />
          <label class="Mic-source-detail" label={hint} xalign={0} hexpand />
        </box>
      </box>
    </button>
  )
}

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

  const sourcesFp = createPoll("", 2000, () =>
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

  const vozBadge = createComputed(() => {
    if (!vozUp()) return "[SIN DAEMON]"
    const v = voz()
    if (v.phase === "loading") return "[CARGANDO MODELO]"
    if (v.phase === "error") return "[ERROR]"
    if (v.armed) return "[TE ESCUCHO]"
    if (v.phase === "stt") return "[TRANSCRIBIENDO]"
    if (v.phase === "llm") return "[PENSANDO]"
    return `[${VOZ_MODE_LABEL[v.mode] ?? v.mode}]`
  })

  const vozLast = createComputed(() => {
    if (!vozUp()) return "El daemon no responde · systemctl --user start voz"
    const v = voz()
    if (!v.text) return `Decí «${v.wake}» y la orden.`
    if (v.kind === "oido") return `«${v.text}» (sin orden)`
    if (v.kind === "dictado") return `«${v.text}»`
    return `«${v.text}» → ${v.did}`
  })

  const vozFoot = createComputed(() => {
    if (!vozUp()) return ""
    const v = voz()
    const laya = v.laya ? "laya ✓" : "laya —"
    const llm = v.llm ? `LLM ✓ US$ ${v.spent.toFixed(3)}` : "LLM —"
    return `${v.model} · ${v.ms} ms · ${laya} · ${llm}`
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
  const eeBadge = createComputed(() => {
    if (eeBusy()) return "[…]"
    return eeEnabled() ? "ON" : "OFF"
  })
  const eeSwitchLabel = createComputed(() => `Easy Effects: ${eeEnabled() ? "ON" : "OFF"}`)
  const eeModeLine = createComputed(() => {
    if (eeEnabled()) return "Todo el audio pasa por Easy Effects."
    return eeReclaimsStreams()
      ? "Directo (defaults reales + bypass; EE re-captura streams abiertos)."
      : "Audio directo, sin Easy Effects."
  })
  const inputSectionTitle = createComputed(() =>
    eeEnabled() ? "ENTRADA (alimenta a Easy Effects)" : "ENTRADA DIRECTA (sin Easy Effects)",
  )

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
            <label class="LocalLlm-log-title" label="🗣 VOZ" hexpand xalign={0} />
            <label class="LocalLlm-log-title" label={vozBadge} xalign={1} />
          </box>
          <label
            class="LocalLlm-log-content"
            label={vozLast}
            xalign={0}
            wrap
            wrapMode={Pango.WrapMode.WORD_CHAR}
            maxWidthChars={100}
          />
          <label class="Mic-source-detail" label={vozFoot} xalign={0} />
        </box>

        <VozModeRow
          id="comando"
          label="Órdenes"
          hint="Escucha siempre; actúa cuando decís la palabra de activación"
        />
        <VozModeRow
          id="dictado"
          label="Dictado"
          hint="Escribe lo que decís en la ventana activa"
        />
        <VozModeRow
          id="off"
          label="Apagado"
          hint="No transcribe y libera la VRAM del modelo"
        />

        <box class="LocalLlm-sep" heightRequest={1} hexpand />

        <box
          class="Mic-ee-box"
          orientation={Gtk.Orientation.VERTICAL}
          spacing={2}
          visible={eeVisible}
        >
          <box spacing={8} valign={Gtk.Align.CENTER}>
            <label class="LocalLlm-log-title" label="🎛 EASY EFFECTS" hexpand xalign={0} />
            <label class="LocalLlm-log-title" label={eeSwitchLabel} xalign={1} />
            <box
              $={(self: Gtk.Box) => {
                const sw = new Gtk.Switch()
                sw.set_valign(Gtk.Align.CENTER)
                sw.set_tooltip_text("Easy Effects ON/OFF (clic central en el icono del micrófono)")
                let syncing = false
                const sync = () => {
                  syncing = true
                  sw.set_active(eeEnabled.peek())
                  sw.set_sensitive(!eeBusy.peek())
                  syncing = false
                }
                sw.connect("notify::active", () => {
                  if (syncing) return
                  if (sw.get_active() !== eeEnabled.peek()) {
                    setEasyEffects(sw.get_active() ? "on" : "off")
                  }
                })
                eeEnabled.subscribe(sync)
                eeBusy.subscribe(sync)
                eeResync.subscribe(sync)
                sync()
                self.append(sw)
              }}
            />
          </box>
          <label class="Mic-ee-preset" label={eePreset} xalign={0} />
          <label class="Mic-ee-summary" label={eeModeLine} xalign={0} />
          <label
            class="Mic-ee-summary"
            label={eeSummary}
            xalign={0}
            wrap
            wrapMode={Pango.WrapMode.WORD_CHAR}
          />
        </box>

        <box class="LocalLlm-sep" heightRequest={1} hexpand />

        <label class="LocalLlm-section-title" label={inputSectionTitle} xalign={0} />

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
              return "○"
            })
            const title = s.title
            return (
              <button
                class={rowClass}
                tooltipText={`Usar ${s.description} como entrada`}
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
    VozToast(gdkmonitor)
  }

  // gris: escucha · verde: voz · naranja: procesando o armado · rojo: dictado
  const tone = createComputed((): MicTone => {
    if (micMuted()) return "muted"
    if (vozUp()) {
      const v = voz()
      if (v.phase === "error") return "error"
      if (v.mode !== "off") {
        if (v.phase === "loading" || v.phase === "stt" || v.phase === "llm" || v.armed) return "busy"
        if (v.mode === "dictado") return "recording"
      }
    }
    if (micHearing()) return "voice"
    return "unmuted"
  })

  const vozClass = createComputed(() => (vozUp() ? `voz-${voz().mode}` : "voz-down"))

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
    } else if (t === "busy") {
      badgeText = voz().armed ? "TE ESCUCHO" : "PROCESANDO"
      badgeColor = "#ff8c42"
    } else if (t === "recording") {
      badgeText = "DICTANDO"
      badgeColor = "#c45c4a"
    } else if (t === "error") {
      badgeText = "ERROR"
      badgeColor = "#c45c4a"
    }

    const stateLine = t === "voice"
      ? `Entrada: <b>${name}</b>  ·  <span foreground="#7bc96f">● detectando audio</span>`
      : `Entrada: <b>${name}</b>`

    const v = voz()
    const wake = GLib.markup_escape_text(v.wake, -1)
    const vozLine = !vozUp()
      ? `Voz: <span alpha="60%">daemon apagado</span>`
      : v.mode === "off"
        ? `Voz: <span alpha="60%">apagada</span>`
        : `Voz: <b>${VOZ_MODE_LABEL[v.mode]}</b>  ·  decí «${wake}» y la orden`

    return [
      `<b><span size="small" letter_spacing="1500" foreground="#ff8c42">🎙️ MICRÓFONO</span></b>   <span size="small" weight="bold" foreground="${badgeColor}">[${badgeText}]</span>`,
      stateLine,
      vozLine,
      `<span size="smaller" alpha="75%">Clic: ${action}  ·  Clic secundario: Selector de entrada  ·  Clic central: Easy Effects ${eeEnabled() ? "ON→OFF" : "OFF→ON"}</span>`,
    ].join("\n")
  })

  const cls = createComputed(() => {
    const t = tone()
    const open = micMenuOpen() ? "open" : ""
    const sub = t === "voice" ? "hearing live" : t === "unmuted" ? "idle" : t === "muted" ? "muted" : ""
    return `MicIndicator ${t} ${sub} ${vozClass()} ${open}`.replace(/\s+/g, " ").trim()
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
          } else if (btn === 2) {
            setEasyEffects("toggle")
          }
        })
        self.add_controller(click)
      }}
    >
      <image file={iconFile} pixelSize={isZoomDense() ? 11 : 16} />
    </button>
  )
}
