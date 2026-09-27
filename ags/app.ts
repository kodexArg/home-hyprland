import app from "ags/gtk4/app"
import style from "./style.scss"
import Bar from "./widget/Bar"
import {
  cycleBarMode,
  getBarMode,
  peekTemp,
  setBarMode,
  type BarMode,
} from "./widget/bar-mode"
import { toggleRecMenu } from "./widget/RecMenu"
import {
  toggleBrainMenu,
  toggleMicMenu,
  toggleDictatorMenu,
} from "./widget/cluster-menu"
import { getRamStatus } from "./widget/ram"
import { getWarpActive, getWarpPhase, toggleWarp } from "./widget/warp"
import { refreshCredits, openRouterSnap } from "./widget/openrouter"
import { refreshCursorUsage, cursorUsageSnap } from "./widget/cursor"
import GLib from "gi://GLib"

// Desktop Sid: ASUS VA27EHF (default). Laptops (kdxsid, zensid): KDX_BAR_MODEL=EDP.
const BAR_MODEL = GLib.getenv("KDX_BAR_MODEL") || "VA27EHF"

let spawnedFor: string | null = null

function connectorOf(mon: { connector?: string | null }): string {
  return mon.connector ?? ""
}

function modelOf(mon: { model?: string | null }): string {
  return mon.model ?? ""
}

function isBarMonitor(mon: {
  connector?: string | null
  model?: string | null
  description?: string | null
}): boolean {
  const model = modelOf(mon).toUpperCase()
  const desc = (mon.description ?? "").toUpperCase()
  // HDMI-A-N flips on desktop; on laptops prefer eDP when BAR_MODEL is EDP/BUILTIN.
  const c = connectorOf(mon).toUpperCase()
  const want = BAR_MODEL.toUpperCase()
  if (want === "EDP" || want === "BUILTIN") {
    return c.includes("EDP") || model.includes("CMN") || desc.includes("BUILT-IN")
  }
  return model.includes(want) || desc.includes(want) || c.includes(want)
}

function trySpawnBar(reason: string) {
  // house default: only ASUS VA27EHF (left landscape). No bar on AOC.
  if (spawnedFor) return
  for (const mon of app.get_monitors()) {
    if (!isBarMonitor(mon)) continue
    Bar(mon)
    spawnedFor = connectorOf(mon) || BAR_MODEL
    printerr(`ags: bar on ${spawnedFor} model=${modelOf(mon)} (${reason})`)
    return
  }
  printerr(
    `ags: no bar monitor yet (${reason}); want model=${BAR_MODEL}; monitors=` +
      app.get_monitors().map((m) => `${connectorOf(m) || "?"}:${modelOf(m) || "?"}`).join(","),
  )
}

function sanitizeCss(input: unknown): string {
  const raw = typeof input === "string" ? input : (input as { default?: string })?.default ?? ""
  return raw.replace(/@charset[^;]*;/gi, "").replace(/@use[^;]*;/gi, "").trim()
}

app.start({
  css: sanitizeCss(style),
  main() {
    trySpawnBar("main")

    app.connect("notify::monitors", () => trySpawnBar("notify::monitors"))

    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
      trySpawnBar("retry-400ms")
      return GLib.SOURCE_REMOVE
    })
  },
  requestHandler(argv, res) {
    const cmd = argv[0]
    if (cmd === "bar-cycle" || cmd === "bar") {
      res(cycleBarMode())
      return
    }
    if (cmd === "bar-peek" || cmd === "peek") {
      res(peekTemp())
      return
    }
    if (cmd === "bar-mode") {
      res(getBarMode())
      return
    }
    if (cmd === "bar-set" && argv[1]) {
      const m = argv[1] as BarMode
      if (m === "always" || m === "temp" || m === "hidden") {
        setBarMode(m)
        res(getBarMode())
        return
      }
    }
    if (
      cmd === "caffeine-toggle" ||
      cmd === "caffeine" ||
      cmd === "caffeine-status" ||
      cmd === "caffeine-get" ||
      cmd === "caffeine-on" ||
      cmd === "caffeine-off"
    ) {
      res("caffeine: parked (UI/cluster commented in Bar.tsx)")
      return
    }
    if (cmd === "rec-menu" || cmd === "rec-toggle") {
      res(toggleRecMenu())
      return
    }
    if (cmd === "mic-menu" || cmd === "mic-toggle-menu" || cmd === "mic") {
      res(toggleMicMenu())
      return
    }
    if (cmd === "dictator-menu" || cmd === "dictator-toggle-menu" || cmd === "dictator") {
      res(toggleDictatorMenu())
      return
    }
    if (cmd === "brain-menu" || cmd === "local-llm-menu" || cmd === "brain") {
      res(toggleBrainMenu())
      return
    }
    if (cmd === "ram-status" || cmd === "ram") {
      res(getRamStatus())
      return
    }
    if (cmd === "warp-toggle" || cmd === "warp") {
      toggleWarp()
      res(`warp: phase=${getWarpPhase()} active=${getWarpActive()}`)
      return
    }
    if (cmd === "warp-status") {
      res(`warp: phase=${getWarpPhase()} active=${getWarpActive()}`)
      return
    }
    if (cmd === "openrouter" || cmd === "credits" || cmd === "openrouter-status") {
      const s = openRouterSnap()
      res(JSON.stringify(s))
      return
    }
    if (cmd === "openrouter-refresh" || cmd === "credits-refresh") {
      refreshCredits()
      res("refreshing openrouter credits...")
      return
    }
    if (cmd === "cursor" || cmd === "cursor-usage" || cmd === "cursor-status") {
      const s = cursorUsageSnap()
      res(JSON.stringify(s))
      return
    }
    if (cmd === "cursor-refresh") {
      refreshCursorUsage()
      res("refreshing cursor usage...")
      return
    }
    res(`unknown request: ${argv.join(" ")}`)
  },
})
