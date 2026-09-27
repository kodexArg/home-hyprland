import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import Pango from "gi://Pango"
import { createState, createComputed, For } from "ags"
import { createPoll } from "ags/time"
import { barVisible, setOverBar } from "./bar-mode"
import { micMuted } from "./mic"
import {
  dictatorMenuOpen,
  openDictatorMenu,
  closeAllClusterMenus,
  readLastLogLine,
  FSM2_LOG,
} from "./cluster-menu"

const ICON_DIR = `${GLib.get_user_config_dir()}/ags/icons`
const STATE_FILE = "/tmp/dictate_state.json"
const FLAG_FILE = "/tmp/dictate_active"
const CONFIG_FILE = `${GLib.get_home_dir()}/.config/voice-dictation/config.json`
const PANEL_GAP = 4
const DICTATOR_BIN =
  GLib.find_program_in_path("kdx-dictator") ??
  GLib.find_program_in_path("dictate") ??
  `${GLib.get_home_dir()}/.local/bin/kdx-dictator`

export type DictatorTone = "muted" | "idle" | "working" | "busy" | "error" | "loading"

const ICONS: Record<DictatorTone, string> = {
  muted: `${ICON_DIR}/dictate-bubble-dark.svg`,
  idle: `${ICON_DIR}/dictate-bubble-gray.svg`,
  working: `${ICON_DIR}/dictate-bubble-green.svg`,
  busy: `${ICON_DIR}/dictate-bubble-orange.svg`,
  error: `${ICON_DIR}/dictate-bubble-red.svg`,
  loading: `${ICON_DIR}/dictate-bubble-orange.svg`,
}

const STT_MODELS = [
  { id: "whisper-cuda", label: "Whisper CUDA · Large-v3 Turbo (INT8)" },
  { id: "distil-whisper", label: "Distil-Whisper · Large-v3 (INT8, Rápido)" },
  { id: "qwen3-asr", label: "Qwen3-ASR · 0.6B (BF16)" },
  { id: "auto", label: "Enrutador Automático · VRAM-aware" },
]

const [dictatorPhase, setDictatorPhase] = createState("idle")
const [dictatorMode, setDictatorMode] = createState("off")
const [dictatorDetail, setDictatorDetail] = createState("")

let timerId: number | null = null

function snap(): void {
  try {
    const file = Gio.File.new_for_path(STATE_FILE)
    if (file.query_exists(null)) {
      const [ok, bytes] = file.load_contents(null)
      if (ok) {
        const text = new TextDecoder().decode(bytes).trim()
        const data = JSON.parse(text)
        const p = (data.phase || "idle").toLowerCase().trim()
        const m = (data.mode || (p === "idle" ? "off" : "direct")).toLowerCase().trim()
        const d = data.detail || ""
        if (dictatorPhase.peek() !== p) setDictatorPhase(p)
        if (dictatorMode.peek() !== m) setDictatorMode(m)
        if (dictatorDetail.peek() !== d) setDictatorDetail(d)
        return
      }
    }
    const flag = Gio.File.new_for_path(FLAG_FILE)
    if (flag.query_exists(null)) {
      const [ok, bytes] = flag.load_contents(null)
      if (ok) {
        const word = new TextDecoder().decode(bytes).toLowerCase().trim()
        if (dictatorPhase.peek() !== word) setDictatorPhase(word)
        if (dictatorMode.peek() !== "direct") setDictatorMode("direct")
        return
      }
    }
  } catch {}
  if (dictatorPhase.peek() !== "idle") setDictatorPhase("idle")
  if (dictatorMode.peek() !== "off") setDictatorMode("off")
  if (dictatorDetail.peek() !== "") setDictatorDetail("")
}

function startWatching(): void {
  if (timerId !== null) return
  snap()
  timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
    snap()
    return GLib.SOURCE_CONTINUE
  })
}

function readDictateConfig(): { backend_mode: string; auto_enter: boolean; silence_sec: number } {
  try {
    const file = Gio.File.new_for_path(CONFIG_FILE)
    if (file.query_exists(null)) {
      const [ok, bytes] = file.load_contents(null)
      if (ok) {
        return JSON.parse(new TextDecoder().decode(bytes))
      }
    }
  } catch {}
  return { backend_mode: "whisper-cuda", auto_enter: true, silence_sec: 0.45 }
}

const configPoll = createPoll(
  JSON.stringify(readDictateConfig()),
  1000,
  () => JSON.stringify(readDictateConfig()),
)

const dictatorConfig = createComputed(() => {
  try {
    return JSON.parse(configPoll())
  } catch {
    return { backend_mode: "whisper-cuda", auto_enter: true, silence_sec: 0.45 }
  }
})

export function toggleDictation(): void {
  if (dictatorMode() === "off" && micMuted()) {
    try {
      Gio.Subprocess.new(
        [
          "notify-send",
          "-t",
          "2500",
          "-i",
          "dialog-warning-symbolic",
          "Dictado de Voz",
          "⚠️ Micrófono silenciado — activalo para iniciar dictado",
        ],
        Gio.SubprocessFlags.STDERR_SILENCE,
      )
    } catch {}
    return
  }

  try {
    Gio.Subprocess.new(
      [DICTATOR_BIN, "toggle"],
      Gio.SubprocessFlags.STDERR_SILENCE,
    )
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 40, () => {
      snap()
      return GLib.SOURCE_REMOVE
    })
  } catch (e) {
    printerr(`dictator: toggle failed: ${e}`)
  }
}

export function stopDictation(): void {
  try {
    Gio.Subprocess.new([DICTATOR_BIN, "stop"], Gio.SubprocessFlags.STDERR_SILENCE)
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
      snap()
      return GLib.SOURCE_REMOVE
    })
  } catch (e) {
    printerr(`dictator: stop failed: ${e}`)
  }
}

function selectBackendMode(mode: string): void {
  try {
    Gio.Subprocess.new([DICTATOR_BIN, "backend", "set", mode], Gio.SubprocessFlags.STDERR_SILENCE)
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => {
      snap()
      return GLib.SOURCE_REMOVE
    })
  } catch (e) {
    printerr(`dictator: select backend failed: ${e}`)
  }
}

function toggleAutoEnter(): void {
  try {
    Gio.Subprocess.new([DICTATOR_BIN, "enter", "toggle"], Gio.SubprocessFlags.STDERR_SILENCE)
  } catch (e) {
    printerr(`dictator: toggle enter failed: ${e}`)
  }
}

function DictatorClickaway(gdkmonitor: Gdk.Monitor) {
  const { TOP, RIGHT, LEFT, BOTTOM } = Astal.WindowAnchor
  const visible = createComputed(() => dictatorMenuOpen() && barVisible())

  return (
    <window
      visible={visible}
      name="dictator-clickaway"
      namespace="ags-dictator-clickaway"
      class="DictatorClickaway"
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

function DictatorPanel(gdkmonitor: Gdk.Monitor) {
  const { TOP, RIGHT } = Astal.WindowAnchor
  const panelVisible = createComputed(() => dictatorMenuOpen() && barVisible())

  DictatorClickaway(gdkmonitor)

  const config = dictatorConfig

  const lastFsm2Log = createPoll(readLastLogLine(FSM2_LOG), 1000, () =>
    readLastLogLine(FSM2_LOG),
  )

  const fsm2Badge = createComputed(() => {
    const p = dictatorPhase()
    const m = dictatorMode()
    if (m === "off" || p === "idle") return "[OFF]"
    if (p === "loading" || p === "arming") return "[CARGANDO VRAM]"
    if (p === "writing" || p === "listening") return "[TRANSCRIBIENDO]"
    if (p === "busy" || p === "thinking") return "[COLA CEREBRO]"
    return `[${p.toUpperCase()}]`
  })

  const statusLine = createComputed(() => {
    const p = dictatorPhase()
    const m = dictatorMode()
    const cfg = config()
    const isAct = m !== "off" && p !== "idle"
    return `DICTADO  ·  ${isAct ? p.toUpperCase() : "INACTIVO"}  ·  Modo: ${cfg.backend_mode || "auto"}`
  })

  const statusCls = createComputed(() => {
    const p = dictatorPhase()
    const m = dictatorMode()
    if (m === "off" || p === "idle") return "LocalLlm-status off"
    if (p === "loading" || p === "arming") return "LocalLlm-status loading"
    if (p === "rec") return "LocalLlm-status ready"
    return "LocalLlm-status"
  })

  const dictatorActiveMark = createComputed(() => {
    const p = dictatorPhase()
    const m = dictatorMode()
    return (m !== "off" && p !== "idle") ? "●" : "○"
  })

  const dictatorActiveLabel = createComputed(() => {
    const p = dictatorPhase()
    const m = dictatorMode()
    return (m !== "off" && p !== "idle")
      ? "🎙️ Dictado Continuo: ACTIVO"
      : "🎙️ Dictado Continuo: INACTIVO"
  })

  const autoEnterLabel = createComputed(() => {
    const cfg = config()
    return cfg.auto_enter ? "↩️ Auto-Enter: ACTIVADO" : "↩️ Auto-Enter: DESACTIVADO"
  })

  const autoEnterMark = createComputed(() => {
    const cfg = config()
    return cfg.auto_enter ? "●" : "○"
  })

  const offClass = createComputed(() => {
    const p = dictatorPhase()
    const m = dictatorMode()
    return (m === "off" || p === "idle") ? "LocalLlm-off armed" : "LocalLlm-off"
  })

  return (
    <window
      visible={panelVisible}
      name="dictator-panel"
      namespace="ags-dictator-panel"
      class="DictatorPanel"
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
        class="LocalLlm-menu"
        orientation={Gtk.Orientation.VERTICAL}
        spacing={2}
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
            <label class="LocalLlm-log-title" label="📋 ÚLTIMO ESTADO FSM2" hexpand xalign={0} />
            <label class="LocalLlm-log-title" label={fsm2Badge} xalign={1} />
          </box>
          <label
            class="LocalLlm-log-content"
            label={lastFsm2Log}
            xalign={0}
            wrap
            wrapMode={Pango.WrapMode.WORD_CHAR}
          />
        </box>

        <box class="LocalLlm-sep" heightRequest={1} hexpand />

        <label class="LocalLlm-section-title" label="INTERACCIÓN DICTADO" xalign={0} />

        <button
          class={createComputed(() => (dictatorMode() !== "off" && dictatorPhase() !== "idle") ? "LocalLlm-model on" : "LocalLlm-model")}
          tooltipText="Activar/desactivar dictado continuo por voz"
          onClicked={() => toggleDictation()}
        >
          <box spacing={8} valign={Gtk.Align.CENTER} hexpand>
            <label class="LocalLlm-mark" label={dictatorActiveMark} xalign={0.5} />
            <label class="LocalLlm-label" label={dictatorActiveLabel} xalign={0} hexpand />
          </box>
        </button>

        <button
          class={createComputed(() => config().auto_enter ? "LocalLlm-model on" : "LocalLlm-model")}
          tooltipText="Alternar pulsación automática de Enter al pausar frase"
          onClicked={() => toggleAutoEnter()}
        >
          <box spacing={8} valign={Gtk.Align.CENTER} hexpand>
            <label class="LocalLlm-mark" label={autoEnterMark} xalign={0.5} />
            <label class="LocalLlm-label" label={autoEnterLabel} xalign={0} hexpand />
          </box>
        </button>

        <box class="LocalLlm-sep" heightRequest={1} hexpand />

        <label class="LocalLlm-section-title" label="MODELOS STT DISPONIBLES" xalign={0} />

        <For each={createComputed(() => STT_MODELS)}>
          {(m) => {
            const rowClass = createComputed(() => {
              const current = (config().backend_mode || "auto").toLowerCase()
              return current === m.id ? "LocalLlm-model on" : "LocalLlm-model"
            })
            const mark = createComputed(() => {
              const current = (config().backend_mode || "auto").toLowerCase()
              return current === m.id ? "●" : "○"
            })
            return (
              <button
                class={rowClass}
                tooltipText={`Seleccionar modelo ${m.label}`}
                onClicked={() => selectBackendMode(m.id)}
              >
                <box spacing={8} valign={Gtk.Align.CENTER} hexpand>
                  <label class="LocalLlm-mark" label={mark} xalign={0.5} />
                  <label class="LocalLlm-label" label={m.label} xalign={0} hexpand />
                </box>
              </button>
            )
          }}
        </For>

        <box class="LocalLlm-sep" heightRequest={1} hexpand />

        <button
          class={offClass}
          tooltipText="Detener dictado y descargar modelo STT de VRAM (OFF)"
          onClicked={() => stopDictation()}
        >
          <box spacing={8} valign={Gtk.Align.CENTER} hexpand>
            <label class="LocalLlm-mark" label="⏹" xalign={0.5} />
            <label
              class="LocalLlm-label"
              label="Apagar dictado (OFF) — liberar VRAM"
              xalign={0}
              hexpand
            />
          </box>
        </button>
      </box>
    </window>
  )
}

export default function DictatorIndicator({
  gdkmonitor,
}: {
  gdkmonitor?: Gdk.Monitor
} = {}) {
  startWatching()
  if (gdkmonitor) {
    DictatorPanel(gdkmonitor)
  }

  const tone = createComputed((): DictatorTone => {
    const p = dictatorPhase()
    const m = dictatorMode()
    const d = dictatorDetail()

    if (p === "idle" || !p || m === "off") {
      return "muted"
    }
    if (p === "err") {
      return "error"
    }
    if (
      p === "loading" ||
      p === "arming" ||
      d.includes("loading") ||
      d.includes("spawn") ||
      d.includes("worker")
    ) {
      return "loading"
    }
    if (p === "rec" || d === "standby_listening") {
      return "idle"
    }
    if (p === "stt" || p === "paste" || p === "ok" || p === "working" || p === "writing" || p === "listening") {
      return "working"
    }
    if (p === "stopping" || p === "busy" || p === "thinking") {
      return "busy"
    }
    return "idle"
  })

  const iconFile = createComputed(() => {
    const t = tone()
    return ICONS[t] || ICONS.muted
  })

  const tip = createComputed(() => {
    const t = tone()
    const cfg = dictatorConfig()
    const mObj = STT_MODELS.find((m) => m.id === (cfg.backend_mode || "whisper-cuda"))
    const rawModel = mObj ? mObj.label.split(" · ")[0] : cfg.backend_mode || "Whisper CUDA"
    const modelLabel = GLib.markup_escape_text(rawModel, -1)

    let badgeText = "EN ESPERA"
    let badgeColor = "#9a9a9a"
    let action = "Clic: Iniciar dictado  ·  Clic secundario: Menú STT"

    if (t === "muted") {
      if (micMuted()) {
        badgeText = "MIC SILENCIADO"
        badgeColor = "#c45c4a"
        action = "Activar micrófono antes de dictar  ·  Clic secundario: Menú"
      } else {
        badgeText = "INACTIVO (OFF)"
        badgeColor = "#9a9a9a"
        action = "Clic: Iniciar dictado continuo  ·  Clic secundario: Menú STT"
      }
    } else if (t === "loading") {
      badgeText = "CARGANDO GPU"
      badgeColor = "#e6b84d"
      action = "Cargando modelo en VRAM...  ·  Clic secundario: Menú"
    } else if (t === "idle") {
      badgeText = "LISTO (ESCUCHANDO)"
      badgeColor = "#7bc96f"
      action = "Clic: Pausar dictado  ·  Clic secundario: Menú STT"
    } else if (t === "working") {
      badgeText = "TRANSCRIBIENDO"
      badgeColor = "#7bc96f"
      action = "Clic: Detener dictado  ·  Clic secundario: Menú STT"
    } else if (t === "busy") {
      badgeText = "PROCESANDO"
      badgeColor = "#ff8c42"
      action = "Clic: Detener dictado  ·  Clic secundario: Menú STT"
    } else if (t === "error") {
      badgeText = "ERROR"
      badgeColor = "#c45c4a"
      action = "Clic secundario: Ver log FSM2 y reiniciar"
    }

    const autoEnterBadge = cfg.auto_enter
      ? '  ·  <span foreground="#7bc96f">↩️ Auto-Enter</span>'
      : '  ·  <span alpha="60%">↩️ Manual</span>'

    return [
      `<b><span size="small" letter_spacing="1500" foreground="#ff8c42">💬 DICTADO VOZ</span></b>   <span size="small" weight="bold" foreground="${badgeColor}">[${badgeText}]</span>`,
      `Motor: <b>${modelLabel}</b>${autoEnterBadge}`,
      `<span size="smaller" alpha="75%">${action}</span>`,
    ].join("\n")
  })

  const cls = createComputed(() => {
    const p = dictatorPhase()
    const t = tone()
    const open = dictatorMenuOpen() ? "open" : ""
    return `DictatorIndicator ${t} phase-${p} ${open}`.trim()
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
            openDictatorMenu()
          } else if (btn === 1) {
            toggleDictation()
          }
        })
        self.add_controller(click)
      }}
    >
      <image
        file={iconFile}
        pixelSize={16}
      />
    </button>
  )
}
