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
// Caffeine parked (UI off). Restore handlers + import with ClockCaffeine in Bar.tsx.
// import {
//   getCaffeineStatus,
//   getCaffeineToken,
//   requestCaffeineOff,
//   requestCaffeineOn,
//   toggleCaffeine,
// } from "./widget/caffeine"
import { toggleRecMenu } from "./widget/RecMenu"
import { getRamStatus } from "./widget/ram"
import { getWarpActive, getWarpPhase, toggleWarp } from "./widget/warp"
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
  // HDMI-A-N flips (kernel 7.1.8: ASUS is HDMI-A-1, AOC is HDMI-A-2).
  // Never treat a connector name as ASUS.
  return model.includes(BAR_MODEL) || desc.includes(BAR_MODEL)
}

function trySpawnBar(reason: string) {
  if (spawnedFor && !app.get_window("bar")) {
    spawnedFor = null
  }

  for (const mon of app.get_monitors()) {
    if (!isBarMonitor(mon)) continue
    const c = connectorOf(mon) || modelOf(mon) || "asus"
    if (spawnedFor === c && app.get_window("bar")) return
    Bar(mon)
    spawnedFor = c
    printerr(`ags: bar on ${c} model=${modelOf(mon)} (${reason})`)
    return
  }
  printerr(
    `ags: no ASUS ${BAR_MODEL} yet (${reason}); monitors=` +
      app.get_monitors().map((m) => `${connectorOf(m) || "?"}:${modelOf(m) || "?"}`).join(","),
  )
}

app.start({
  css: style,
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
    // parked caffeine requests — restore with widget/caffeine import above
    // if (cmd === "caffeine-toggle" || cmd === "caffeine") {
    //   const snap = toggleCaffeine()
    //   res(`${getCaffeineToken()} | ${snap}`)
    //   return
    // }
    // if (cmd === "caffeine-status" || cmd === "caffeine-get") {
    //   const snap = getCaffeineStatus()
    //   res(`${getCaffeineToken()} | ${snap}`)
    //   return
    // }
    // if (cmd === "caffeine-on") {
    //   const snap = requestCaffeineOn()
    //   res(`${getCaffeineToken()} | ${snap}`)
    //   return
    // }
    // if (cmd === "caffeine-off") {
    //   const snap = requestCaffeineOff()
    //   res(`${getCaffeineToken()} | ${snap}`)
    //   return
    // }
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
    res(`unknown request: ${argv.join(" ")}`)
  },
})
