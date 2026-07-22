import app from "ags/gtk4/app"
import style from "./style.scss"
import Bar, { toggleCapture, toggleCaffeine } from "./widget/Bar"
import {
  cycleBarMode,
  getBarMode,
  peekTemp,
  setBarMode,
  type BarMode,
} from "./widget/bar-mode"
import GLib from "gi://GLib"

/** Portrait ASUS (Hypr monitor 2 / transform 3). Bar never on HDMI-A-1. */
const BAR_CONNECTOR = "HDMI-A-2"

/** Avoid double-spawn on the same connector. */
let spawnedFor: string | null = null

function connectorOf(mon: { connector?: string | null }): string {
  return mon.connector ?? ""
}

function trySpawnBar(reason: string) {
  // Drop stale handle if the window is gone
  if (spawnedFor && !app.get_window("bar")) {
    spawnedFor = null
  }

  for (const mon of app.get_monitors()) {
    const c = connectorOf(mon)
    if (c !== BAR_CONNECTOR) continue
    if (spawnedFor === c && app.get_window("bar")) return
    Bar(mon)
    spawnedFor = c
    printerr(`ags: bar on ${c} (${reason})`)
    return
  }
  printerr(
    `ags: no ${BAR_CONNECTOR} yet (${reason}); monitors=` +
      app.get_monitors().map((m) => connectorOf(m) || "?").join(","),
  )
}

app.start({
  css: style,
  main() {
    trySpawnBar("main")

    // Hotplug / late enumerations — don't leave IPC-up / window-down
    app.connect("notify::monitors", () => trySpawnBar("notify::monitors"))

    // One delayed retry (race after ags-restart)
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
      trySpawnBar("retry-400ms")
      return GLib.SOURCE_REMOVE
    })
  },
  // Super+B → bar-cycle | Super_L/R (non-consuming) → bar-peek
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
    // ags request bar-set always|temp|hidden
    if (cmd === "bar-set" && argv[1]) {
      const m = argv[1] as BarMode
      if (m === "always" || m === "temp" || m === "hidden") {
        setBarMode(m)
        res(getBarMode())
        return
      }
    }
    if (cmd === "capture-toggle" || cmd === "capture") {
      res(toggleCapture())
      return
    }
    if (cmd === "caffeine-toggle" || cmd === "caffeine") {
      res(toggleCaffeine())
      return
    }
    res(`unknown request: ${argv.join(" ")}`)
  },
})
