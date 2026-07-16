import app from "ags/gtk4/app"
import style from "./style.scss"
import Bar from "./widget/Bar"
import { cycleBarMode, getBarMode, peekTemp } from "./widget/bar-mode"

/** Portrait ASUS (Hypr monitor 2 / transform 3). Bar never on HDMI-A-1. */
const BAR_CONNECTOR = "HDMI-A-2"

app.start({
  css: style,
  main() {
    for (const mon of app.get_monitors()) {
      if (mon.connector === BAR_CONNECTOR) Bar(mon)
    }
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
    res(`unknown request: ${argv.join(" ")}`)
  },
})
