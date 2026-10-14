import GLib from "gi://GLib"

/** Settings propios de cada PC: ~/.config/kodex/local.env (KEY=valor, # comentarios). */
function readLocalEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    const [, bytes] = GLib.file_get_contents(`${GLib.get_user_config_dir()}/kodex/local.env`)
    for (const line of new TextDecoder().decode(bytes).split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2")
    }
  } catch {}
  return out
}

export const localEnv = readLocalEnv()

const hidden = new Set(
  (localEnv.KDX_BAR_HIDE ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
)

export const show = (item: string) => !hidden.has(item)
