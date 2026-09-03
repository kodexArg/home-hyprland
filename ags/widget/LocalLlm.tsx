import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createComputed, createState, For } from "ags"
import { createPoll } from "ags/time"
import { execAsync } from "ags/process"
import { barVisible, setOverBar } from "./bar-mode"

const HOME = GLib.get_home_dir()
const ICON_DIR = `${GLib.get_user_config_dir()}/ags/icons`
const ICON_BRAIN = `${ICON_DIR}/brain.svg` // monochrome (currentColor) — state via CSS color
const GGUF_DIR = `${HOME}/Services/local-llm/models/gguf`
const CONFIG_FILE = `${HOME}/.config/local-llm/selected-model`
const SERVICE = "local-llm.service"
const API_MODELS = "http://127.0.0.1:28000/v1/models"
// Color SSOT v1 (clients paint busy/feedback; AGS owns readiness green/gray):
//   $XDG_RUNTIME_DIR/local-llm-color.json
//     {v:1, busy:N, feedback:null|"unknown", feedback_until:epoch|null}
// Priority: busy>0 → orange · feedback unknown (timed) → red · else readiness.
// Legacy: local-llm-thinking presence = busy (orange).
const COLOR_FILE = `${GLib.get_user_runtime_dir()}/local-llm-color.json`
const THINKING_FILE = `${GLib.get_user_runtime_dir()}/local-llm-thinking`
const PANEL_GAP = 4
const TICK_MS = 400

const LOAD_BUDGET_SEC = 45
const LOAD_TIMEOUT_SEC = LOAD_BUDGET_SEC * 2
const UNLOAD_TIMEOUT_SEC = 30
const VRAM_YELLOW_UNDER_MIB = 7 * 1024

const VENDOR_RE =
  /^(THUDM|Qwen|deepseek-ai|meta-llama|mistralai|google|microsoft|XiaomiMiMo|BAAI|unsloth|bartowski|TheBloke)[_/]/i

type SvcState = "stopped" | "starting" | "running" | "stopping" | "failed"

type Tx = {
  phase: "idle" | "unload" | "load"
  from: string | null
  to: string | null
  since: number
}

const IDLE: Tx = { phase: "idle", from: null, to: null, since: 0 }

const [menuOpen, setMenuOpen] = createState(false)
const [tx, setTx] = createState<Tx>(IDLE)
const [liveModel, setLiveModel] = createState("")
const [svcSnap, setSvcSnap] = createState<SvcState>("stopped")
const [selectedSnap, setSelectedSnap] = createState(readSelected())
const [apiReady, setApiReady] = createState(false)
const [lastFail, setLastFail] = createState("")
const [vramUsedMib, setVramUsedMib] = createState<number | null>(null)

let tickSource: number | null = null
let ctlInFlight = false

function nowSec(): number {
  return GLib.get_monotonic_time() / 1_000_000
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

function listChatModels(): string[] {
  const out: string[] = []
  try {
    const dir = Gio.File.new_for_path(GGUF_DIR)
    const iter = dir.enumerate_children(
      "standard::name,standard::type",
      Gio.FileQueryInfoFlags.NONE,
      null,
    )
    let info: Gio.FileInfo | null
    while ((info = iter.next_file(null)) !== null) {
      if (info.get_file_type() !== Gio.FileType.REGULAR) continue
      const n = info.get_name()
      if (!n.endsWith(".gguf")) continue
      if (/embedding/i.test(n)) continue
      out.push(n)
    }
    iter.close(null)
  } catch (e) {
    printerr(`local-llm: scan failed: ${e}`)
  }
  out.sort((a, b) => a.localeCompare(b))
  return out
}

function readSelected(): string {
  try {
    const [ok, raw] = Gio.File.new_for_path(CONFIG_FILE).load_contents(null)
    if (ok) return new TextDecoder().decode(raw).trim()
  } catch {}
  return ""
}

function writeSelected(name: string) {
  try {
    Gio.File.new_for_path(`${HOME}/.config/local-llm`).make_directory_with_parents(
      null,
    )
  } catch {}
  Gio.File.new_for_path(CONFIG_FILE).replace_contents(
    new TextEncoder().encode(name),
    null,
    false,
    Gio.FileCreateFlags.REPLACE_DESTINATION,
    null,
  )
  setSelectedSnap(name)
}

function isHybridMoE(id: string): boolean {
  return /35B|A3B|MoE|moe/i.test(id)
}

function shortLabel(id: string): string {
  if (!id) return "(none)"
  const base = id.replace(/\.gguf$/i, "")
  const qm = base.match(/[-_.]((?:I?Q\d+(?:_\w+)*)|F16|F32|BF16|FP16)$/i)
  const quant = qm ? qm[1].toUpperCase() : "GGUF"
  const family = (qm ? base.slice(0, qm.index) : base).replace(VENDOR_RE, "")
  const hybrid = isHybridMoE(id) ? "  ·  hybrid" : ""
  return `${family}  ·  ${quant}${hybrid}`
}

function probeSvc(): SvcState {
  try {
    const proc = Gio.Subprocess.new(
      ["systemctl", "--user", "is-active", SERVICE],
      Gio.SubprocessFlags.STDOUT_PIPE,
    )
    const [, stdout] = proc.communicate_utf8(null, null)
    const s = (stdout ?? "").trim()
    if (s === "active") return "running"
    if (s === "activating") return "starting"
    if (s === "deactivating") return "stopping"
    if (s === "failed") return "failed"
    return "stopped"
  } catch {
    return "stopped"
  }
}

function probeApiReady(): boolean {
  try {
    const proc = Gio.Subprocess.new(
      ["curl", "-sf", "--max-time", "1", API_MODELS],
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    const [ok, stdout] = proc.communicate_utf8(null, null)
    if (!ok) return false
    const body = stdout ?? ""
    return body.includes('"data"') || body.includes("object")
  } catch {
    return false
  }
}

function probeVramUsedMib(): number | null {
  try {
    const proc = Gio.Subprocess.new(
      [
        "nvidia-smi",
        "--query-gpu=memory.used",
        "--format=csv,noheader,nounits",
      ],
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    const [ok, stdout] = proc.communicate_utf8(null, null)
    if (!ok) return null
    const line = (stdout ?? "").trim().split("\n")[0] ?? ""
    const n = parseInt(line, 10)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function formatVram(used: number | null): string {
  if (used === null) return "VRAM ?"
  return `VRAM ${(used / 1024).toFixed(1)}/8.0 GiB`
}

function vramHeadroomYellow(): boolean {
  const u = vramUsedMib()
  return u !== null && u < VRAM_YELLOW_UNDER_MIB
}

function ctl(action: "start" | "stop" | "kill") {
  ctlInFlight = true
  const argv =
    action === "kill"
      ? ["systemctl", "--user", "kill", "-s", "SIGKILL", SERVICE]
      : ["systemctl", "--user", action, SERVICE]
  const run = () =>
    execAsync(argv)
      .catch((e) => printerr(`local-llm: systemctl ${action}: ${e}`))
      .finally(() => {
        ctlInFlight = false
      })
  if (action === "start") {
    execAsync(["systemctl", "--user", "reset-failed", SERVICE])
      .catch(() => undefined)
      .finally(run)
  } else {
    run()
  }
}

function enterPhase(
  phase: Tx["phase"],
  from: string | null,
  to: string | null,
) {
  setTx({ phase, from, to, since: nowSec() })
  if (phase === "load") setLastFail("")
}

function failLoad(reason: string, model: string | null) {
  printerr(`local-llm: ${reason} (${model ?? "?"})`)
  setLastFail(reason)
  setLiveModel("")
  setApiReady(false)
  if (!ctlInFlight) ctl("kill")
  execAsync(["systemctl", "--user", "stop", SERVICE]).catch(() => undefined)
  setTx(IDLE)
}

let vramTick = 0

function ensureTick() {
  if (tickSource !== null) return
  tickSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TICK_MS, () => {
    const busy = tickFsm()
    if (!busy) {
      const s = probeSvc()
      setSvcSnap(s)
      const ready = s === "running" && probeApiReady()
      setApiReady(ready)
      if (ready) {
        const sel = readSelected()
        setSelectedSnap(sel)
        if (liveModel.peek() !== sel) setLiveModel(sel)
      } else if (s === "stopped" || s === "failed") {
        if (tx.peek().phase === "idle") {
          if (liveModel.peek()) setLiveModel("")
          setApiReady(false)
        }
      } else if (s === "running" && !ready) {
        if (liveModel.peek()) setLiveModel("")
      }
    }

    vramTick++
    const needFast =
      busy ||
      apiReady.peek() ||
      svcSnap.peek() === "running" ||
      svcSnap.peek() === "starting" ||
      tx.peek().phase !== "idle"
    const every = needFast ? 5 : 20
    if (vramTick >= every) {
      vramTick = 0
      setVramUsedMib(probeVramUsedMib())
    }
    return GLib.SOURCE_CONTINUE
  })
}

function tickFsm(): boolean {
  const t = tx.peek()
  const s = probeSvc()
  setSvcSnap(s)
  const elapsed = nowSec() - (t.since || nowSec())

  if (t.phase === "idle") return false

  if (t.phase === "unload") {
    if (elapsed > UNLOAD_TIMEOUT_SEC) {
      printerr(`local-llm: unload timeout ${UNLOAD_TIMEOUT_SEC}s — SIGKILL`)
      ctl("kill")
      return true
    }
    if (s === "stopped" || s === "failed") {
      setLiveModel("")
      setApiReady(false)
      if (t.to) {
        writeSelected(t.to)
        enterPhase("load", null, t.to)
        if (!ctlInFlight) ctl("start")
      } else {
        setTx(IDLE)
      }
    }
    return true
  }

  if (t.phase === "load") {
    if (elapsed > LOAD_TIMEOUT_SEC) {
      failLoad(
        `timeout ${LOAD_TIMEOUT_SEC}s (budget ${LOAD_BUDGET_SEC}s ×2 on 8GB)`,
        t.to,
      )
      return false
    }

    if (s === "failed") {
      failLoad("unit failed", t.to)
      return false
    }

    if (s === "running" || s === "starting") {
      const ready = probeApiReady()
      setApiReady(ready)
      if (ready) {
        setLiveModel(t.to ?? readSelected())
        setLastFail("")
        setTx(IDLE)
        return false
      }
      return true
    }

    return true
  }

  return false
}

function onPickModel(id: string) {
  if (tx.peek().phase !== "idle") return

  const s = probeSvc()
  setSvcSnap(s)
  const ready = s === "running" && probeApiReady()
  setApiReady(ready)
  const live =
    liveModel.peek() || (ready ? readSelected() : "")

  if (ready && live === id) return

  writeSelected(id)
  setLastFail("")

  if (s === "running" || s === "starting" || s === "stopping") {
    enterPhase("unload", live || readSelected(), id)
    if (s !== "stopping" && s !== "stopped") ctl("stop")
    ensureTick()
    return
  }

  enterPhase("load", null, id)
  ctl("start")
  ensureTick()
}

function onPowerOff() {
  if (tx.peek().phase !== "idle") return

  const s = probeSvc()
  setSvcSnap(s)
  if (s === "stopped" || s === "failed") {
    setLiveModel("")
    setApiReady(false)
    return
  }

  const live = liveModel.peek() || readSelected()
  enterPhase("unload", live || null, null)
  ctl("stop")
  ensureTick()
}

function rowTone(
  id: string,
): "unload" | "load" | "on" | "failed" | "idle" {
  const t = tx()
  if (t.phase === "unload" && t.from === id) return "unload"
  if ((t.phase === "unload" || t.phase === "load") && t.to === id) return "load"
  if (t.phase === "idle" && lastFail() && selectedSnap() === id) return "failed"
  if (t.phase === "idle" && svcSnap() === "failed" && selectedSnap() === id)
    return "failed"
  if (
    t.phase === "idle" &&
    apiReady() &&
    svcSnap() === "running" &&
    liveModel() === id
  )
    return "on"
  if (
    t.phase === "idle" &&
    (svcSnap() === "starting" || svcSnap() === "running") &&
    selectedSnap() === id &&
    !apiReady()
  )
    return "load"
  return "idle"
}

type UiPhase =
  | "off"
  | "ready"
  | "shutting_down"
  | "switching"
  | "loading"
  | "failed"

function uiPhase(): UiPhase {
  const t = tx()
  if (t.phase === "unload" && t.to) return "switching"
  if (t.phase === "unload") return "shutting_down"
  if (t.phase === "load") return "loading"
  if (lastFail()) return "failed"
  const s = svcSnap()
  if (s === "failed") return "failed"
  if (s === "running" && apiReady()) return "ready"
  if (s === "running" || s === "starting" || s === "stopping") {
    if (s === "stopping") return "shutting_down"
    return "loading"
  }
  return "off"
}

function statusLine(): string {
  const t = tx()
  const phase = uiPhase()

  if (phase === "switching") {
    return `Switching · shut down ${shortLabel(t.from ?? "")} → ${shortLabel(t.to ?? "")}`
  }
  if (phase === "shutting_down") {
    const who = t.from || liveModel() || selectedSnap()
    return who ? `Shutting down · ${shortLabel(who)}…` : "Shutting down…"
  }
  if (phase === "loading") {
    const who = t.to || selectedSnap()
    const left =
      t.phase === "load"
        ? Math.max(0, Math.ceil(LOAD_TIMEOUT_SEC - (nowSec() - t.since)))
        : null
    const hybrid = who && isHybridMoE(who) ? " · hybrid/RAM" : ""
    const timer = left !== null ? ` · ${left}s left` : ""
    return `Loading · ${shortLabel(who)}${hybrid}${timer}`
  }
  if (phase === "failed") {
    const why = lastFail() || "unit failed"
    return `Failed · ${why} — ${shortLabel(selectedSnap())}`
  }
  if (phase === "ready") {
    const v = formatVram(vramUsedMib())
    const room = vramHeadroomYellow() ? " · <7 GiB" : " · tight"
    return `Ready · ${shortLabel(liveModel() || selectedSnap())} · ${v}${room}`
  }
  return "Off"
}

function statusClass(): string {
  const p = uiPhase()
  if (p === "ready")
    return vramHeadroomYellow()
      ? "LocalLlm-status loading"
      : "LocalLlm-status ready"
  if (p === "loading" || p === "switching") return "LocalLlm-status loading"
  if (p === "shutting_down") return "LocalLlm-status shutting"
  if (p === "failed") return "LocalLlm-status failed"
  return "LocalLlm-status off"
}

ensureTick()
setVramUsedMib(probeVramUsedMib())

function LocalLlmClickaway(gdkmonitor: Gdk.Monitor) {
  const { TOP, RIGHT, LEFT, BOTTOM } = Astal.WindowAnchor
  const visible = createComputed(() => menuOpen() && barVisible())

  return (
    <window
      visible={visible}
      name="local-llm-clickaway"
      namespace="ags-local-llm-clickaway"
      class="LocalLlmClickaway"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.IGNORE}
      anchor={TOP | RIGHT | LEFT | BOTTOM}
      layer={Astal.Layer.TOP}
      keymode={Astal.Keymode.NONE}
      application={app}
      $={(self: Gtk.Window) => {
        const click = new Gtk.GestureClick()
        click.set_button(0)
        click.connect("pressed", () => setMenuOpen(false))
        self.add_controller(click)
      }}
    >
      <box hexpand vexpand />
    </window>
  )
}

function LocalLlmPanel(gdkmonitor: Gdk.Monitor) {
  const { TOP, RIGHT } = Astal.WindowAnchor
  const panelVisible = createComputed(() => menuOpen() && barVisible())

  LocalLlmClickaway(gdkmonitor)

  const modelsFp = createPoll(listChatModels().join("\n"), 5000, () =>
    listChatModels().join("\n"),
  )
  const models = createComputed(() =>
    modelsFp()
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  )

  const clock = createPoll(0, 1000, () => Math.floor(nowSec()))

  const status = createComputed(() => {
    void tx()
    void svcSnap()
    void liveModel()
    void selectedSnap()
    void apiReady()
    void lastFail()
    void vramUsedMib()
    void clock()
    return statusLine()
  })

  const statusCls = createComputed(() => {
    void tx()
    void svcSnap()
    void liveModel()
    void selectedSnap()
    void apiReady()
    void lastFail()
    void vramUsedMib()
    void clock()
    return statusClass()
  })

  const offClass = createComputed(() => {
    void tx()
    void svcSnap()
    void apiReady()
    const t = tx()
    const off =
      t.phase === "idle" &&
      (svcSnap() === "stopped" || svcSnap() === "failed") &&
      !liveModel()
    return off ? "LocalLlm-off armed" : "LocalLlm-off"
  })

  return (
    <window
      visible={panelVisible}
      name="local-llm"
      namespace="ags-local-llm"
      class="LocalLlmPanel"
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
            setMenuOpen(false)
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
        $={(self) =>
          attachMotion(
            self,
            () => setOverBar(true),
            () => setOverBar(false),
          )
        }
      >
        <label
          class={statusCls}
          label={status}
          xalign={0}
          tooltipText={`timeout ${LOAD_TIMEOUT_SEC}s (2×${LOAD_BUDGET_SEC}s densenet budget @ 8GB) · ready=/v1/models · click outside or Esc to close`}
        />

        <box class="LocalLlm-sep" heightRequest={1} hexpand />

        <For each={models}>
          {(id) => {
            const rowClass = createComputed(() => {
              void tx()
              void svcSnap()
              void liveModel()
              void selectedSnap()
              void apiReady()
              void lastFail()
              const tone = rowTone(id)
              if (tone === "unload") return "LocalLlm-model unload"
              if (tone === "load") return "LocalLlm-model load"
              if (tone === "failed") return "LocalLlm-model failed"
              if (tone === "on") return "LocalLlm-model on"
              return "LocalLlm-model"
            })
            const mark = createComputed(() => {
              void tx()
              void svcSnap()
              void liveModel()
              void apiReady()
              void lastFail()
              const tone = rowTone(id)
              if (tone === "unload") return "↓"
              if (tone === "load") return "…"
              if (tone === "failed") return "✗"
              if (tone === "on") return "●"
              return " "
            })
            const rowTip = createComputed(() => {
              void tx()
              void svcSnap()
              void liveModel()
              void apiReady()
              void lastFail()
              const tone = rowTone(id)
              const base = isHybridMoE(id)
                ? `${id}\nHybrid MoE (~21 GB disk) — thrash risk on 8 GB. Timeout ${LOAD_TIMEOUT_SEC}s.`
                : id
              if (tone === "unload") return `${base}\nShutting down this model…`
              if (tone === "load") return `${base}\nLoading weights / waiting for API…`
              if (tone === "on") return `${base}\nReady (API up)`
              if (tone === "failed") return `${base}\nLast load failed`
              return base
            })
            return (
              <button
                class={rowClass}
                tooltipText={rowTip}
                onClicked={() => onPickModel(id)}
              >
                <box spacing={8} valign={Gtk.Align.CENTER} hexpand>
                  <label class="LocalLlm-mark" label={mark} xalign={0.5} />
                  <label
                    class="LocalLlm-label"
                    label={shortLabel(id)}
                    xalign={0}
                    hexpand
                  />
                </box>
              </button>
            )
          }}
        </For>

        <box class="LocalLlm-sep" heightRequest={1} hexpand />

        <button
          class={offClass}
          tooltipText="Shut down · stop local-llm.service · free VRAM"
          onClicked={() => onPowerOff()}
        >
          <label class="LocalLlm-label" label="OFF" xalign={0.5} hexpand />
        </button>
      </box>
    </window>
  )
}

export default function LocalLlm({
  gdkmonitor,
}: {
  gdkmonitor: Gdk.Monitor
}) {
  LocalLlmPanel(gdkmonitor)

  // Client color SSOT (v1 busy + feedback). Poll 200 ms for snappier orange.
  // Priority: busy>0 → orange · feedback unknown (timed, idle) → red · else readiness.
  type BrainTone = "off" | "ready" | "thinking" | "red"
  type Overlay = { kind: "busy" | "unknown" | null }
  const overlay = createPoll({ kind: null } as Overlay, 200, () => {
    try {
      const f = Gio.File.new_for_path(COLOR_FILE)
      if (f.query_exists(null)) {
        const [ok, bytes] = f.load_contents(null)
        if (ok) {
          const d = JSON.parse(new TextDecoder().decode(bytes)) as {
            v?: number
            busy?: number
            feedback?: string | null
            feedback_until?: number | null
            tone?: string
            until?: number | null
          }
          const busy = Number(d.busy ?? 0)
          if (busy > 0) return { kind: "busy" as const }
          // v1 feedback
          if (
            d.feedback === "unknown" &&
            d.feedback_until != null &&
            Date.now() / 1000 < Number(d.feedback_until)
          )
            return { kind: "unknown" as const }
          // compat tone/until (older writers)
          if (d.tone === "orange") return { kind: "busy" as const }
          if (
            d.tone === "red" &&
            (d.until == null || Date.now() / 1000 < Number(d.until))
          )
            return { kind: "unknown" as const }
        }
      }
      // legacy thinking file = busy
      if (Gio.File.new_for_path(THINKING_FILE).query_exists(null))
        return { kind: "busy" as const }
      return { kind: null as const }
    } catch {
      if (Gio.File.new_for_path(THINKING_FILE).query_exists(null))
        return { kind: "busy" as const }
      return { kind: null as const }
    }
  })

  const tone = createComputed((): BrainTone => {
    void tx()
    void svcSnap()
    void apiReady()
    void overlay()
    const o = overlay()
    if (o.kind === "busy") return "thinking"
    if (o.kind === "unknown") return "red"
    if (svcSnap() === "running" && apiReady()) return "ready"
    return "off"
  })

  const cls = createComputed(() => {
    void tone()
    void menuOpen()
    const parts = ["LocalLlm", tone()]
    if (menuOpen()) parts.push("open")
    return parts.join(" ")
  })

  // Baked-color icon variants: GTK does not tint file SVGs via CSS `color`
  // (currentColor resolves to black), so the state is carried by the file.
  const iconFile = createComputed(() => {
    void tone()
    const t = tone()
    if (t === "red") return `${ICON_DIR}/brain-red.svg`
    if (t === "thinking") return `${ICON_DIR}/brain-orange.svg`
    if (t === "ready") return `${ICON_DIR}/brain-gray.svg`
    return `${ICON_DIR}/brain-dark.svg`
  })

  const tipClock = createPoll(0, 1000, () => Math.floor(nowSec()))
  const tip = createComputed(() => {
    void tx()
    void svcSnap()
    void liveModel()
    void selectedSnap()
    void apiReady()
    void lastFail()
    void vramUsedMib()
    void overlay()
    void tipClock()
    const base = statusLine()
    const o = overlay()
    const extra =
      o.kind === "unknown"
        ? " · UNKNOWN (red)"
        : o.kind === "busy"
          ? " · BUSY (orange)"
          : ""
    return `${base}${extra} — click for menu · outside/Esc closes`
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

export function getLocalLlmMenuOpen(): boolean {
  return menuOpen.peek()
}

export function toggleLocalLlmMenu(): string {
  setMenuOpen(!menuOpen.peek())
  return menuOpen.peek() ? "local-llm-open" : "local-llm-closed"
}
