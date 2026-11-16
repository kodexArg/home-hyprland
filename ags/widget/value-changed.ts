import GLib from "gi://GLib"
import { Accessor, createEffect, createState, onCleanup } from "ags"

/** True for holdMs after `text` changes. The value on screen at mount is ignored. */
export function valueChanged(text: Accessor<string>, holdMs = 5000): Accessor<boolean> {
  const [on, setOn] = createState(false)
  let last: string | undefined
  let timer: number | null = null

  function clearTimer() {
    if (timer !== null) {
      GLib.source_remove(timer)
      timer = null
    }
  }

  createEffect(() => {
    const next = text()
    if (last === undefined) {
      last = next
      return
    }
    if (next === last) return
    last = next
    setOn(true)
    clearTimer()
    timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, holdMs, () => {
      setOn(false)
      timer = null
      return GLib.SOURCE_REMOVE
    })
  })

  onCleanup(clearTimer)
  return on
}
