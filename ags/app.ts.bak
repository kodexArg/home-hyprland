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
import {
  moneyVisible,
  setMoneyVisible,
  toggleMoneyVisible,
  toggleMoneyMenu,
  monitorsVisible,
  setMonitorsVisible,
  toggleMonitorsVisible,
  toggleMonitorsMenu,
  ramVisible,
  setRamVisible,
  toggleRamVisible,
  toggleRamMenu,
  lanMouseVisible,
  setLanMouseVisible,
  toggleLanMouseVisible,
} from "./widget/bar-visibility"
import GLib from "gi://GLib"


const BAR_MODEL = "VA27EHF"

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
  return model.includes(BAR_MODEL) || desc.includes(BAR_MODEL)
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
    if (cmd === "mic-menu" || cmd === "mic-toggle-menu") {
      res(toggleMicMenu())
      return
    }
    if (cmd === "dictator-menu" || cmd === "dictator-toggle-menu") {
      res(toggleDictatorMenu())
      return
    }
    if (cmd === "brain-menu" || cmd === "local-llm-menu") {
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
    if (cmd === "money" || cmd === "money-toggle" || cmd === "credits-toggle") {
      res(toggleMoneyVisible())
      return
    }
    if (cmd === "money-status" || cmd === "credits-status") {
      res(moneyVisible.peek() ? "visible" : "hidden")
      return
    }
    if (cmd === "money-show") {
      setMoneyVisible(true)
      res("money-visible")
      return
    }
    if (cmd === "money-hide") {
      setMoneyVisible(false)
      res("money-hidden")
      return
    }
    if (cmd === "money-menu") {
      res(toggleMoneyMenu())
      return
    }
    if (cmd === "monitors" || cmd === "monitors-toggle" || cmd === "ws-toggle") {
      res(toggleMonitorsVisible())
      return
    }
    if (cmd === "monitors-status") {
      res(monitorsVisible.peek() ? "visible" : "hidden")
      return
    }
    if (cmd === "monitors-show") {
      setMonitorsVisible(true)
      res("monitors-visible")
      return
    }
    if (cmd === "monitors-hide") {
      setMonitorsVisible(false)
      res("monitors-hidden")
      return
    }
    if (cmd === "monitors-menu") {
      res(toggleMonitorsMenu())
      return
    }
    if (cmd === "ram-toggle" || cmd === "ram-track-toggle" || cmd === "cpu-ram-toggle") {
      res(toggleRamVisible())
      return
    }
    if (cmd === "ram-visibility" || cmd === "ram-track-status") {
      res(ramVisible.peek() ? "visible" : "hidden")
      return
    }
    if (cmd === "ram-show") {
      setRamVisible(true)
      res("ram-visible")
      return
    }
    if (cmd === "ram-hide") {
      setRamVisible(false)
      res("ram-hidden")
      return
    }
    if (cmd === "ram-menu") {
      res(toggleRamMenu())
      return
    }
    if (cmd === "lanmouse" || cmd === "lanmouse-toggle" || cmd === "lan-mouse-toggle") {
      res(toggleLanMouseVisible())
      return
    }
    if (cmd === "lanmouse-status" || cmd === "lan-mouse-status") {
      res(lanMouseVisible.peek() ? "visible" : "hidden")
      return
    }
    if (cmd === "lanmouse-show") {
      setLanMouseVisible(true)
      res("lanmouse-visible")
      return
    }
    if (cmd === "lanmouse-hide") {
      setLanMouseVisible(false)
      res("lanmouse-hidden")
      return
    }
    res(`unknown request: ${argv.join(" ")}`)
  },
})
