/**
 * Índice de apps del panel. Primer match gana: lo específico va arriba.
 *   cls    regex sobre class/initialClass de Hyprland (minúsculas)
 *   title  regex sobre el título, solo para ventanas de navegador (PWA, sitios)
 *   bg     fondo del cuadro '#RRGGBB'
 *   brand  color de marca '#RRGGBB' (borde y tinte de íconos locales)
 *   icon   archivo en ~/.config/ags/icons (SVG currentColor → brand, o PNG)
 *          o nombre de ícono del tema (Icon= del .desktop, a todo color)
 * Lo que no está acá: .desktop por class → Icon=, color por hash + inicial,
 * y la clase queda registrada en ~/.local/state/ags-icons/unknown.tsv.
 */
export type AppEntry = {
  id: string
  cls?: RegExp
  title?: RegExp
  bg: string
  brand: string
  icon: string
}

export const APP_INDEX: AppEntry[] = [
  { id: "whatsapp", cls: /whatsapp|hnpfjngllnobngcgfapefoaidbinmjnm/, title: /whatsapp/i, bg: "#0b141a", brand: "#25d366", icon: "app-whatsapp.svg" },
  { id: "kick", cls: /^kick/, title: /\bkick\b/i, bg: "#0b0e0f", brand: "#53fc18", icon: "app-kick.svg" },
  { id: "youtube", cls: /youtube/, title: /youtube/i, bg: "#0f0f0f", brand: "#ff0000", icon: "app-youtube.svg" },
  { id: "meet", title: /google meet|meet\.google|^meet\b/i, bg: "#10241a", brand: "#00ac47", icon: "app-video.svg" },
  { id: "grok-bot", cls: /^grok-bot$|^grok$/, title: /grok/i, bg: "#000000", brand: "#f2f2f2", icon: "app-grok-bot.png" },
  { id: "claude", cls: /claude/, title: /\bclaude\b/i, bg: "#262624", brand: "#d97757", icon: "app-claude.svg" },
  { id: "spotify", cls: /spotify/, title: /spotify/i, bg: "#121212", brand: "#1db954", icon: "app-spotify.svg" },
  { id: "discord", cls: /discord|vesktop/, title: /discord/i, bg: "#313338", brand: "#5865f2", icon: "app-discord.svg" },

  { id: "cursor", cls: /^cursor/, bg: "#14120b", brand: "#edecec", icon: "app-cursor.svg" },
  { id: "codium", cls: /codium|^code(-|$)/, bg: "#1f1f1f", brand: "#2f80ed", icon: "app-codium.svg" },
  { id: "agy", cls: /^agy|antigravity/, bg: "#110b03", brand: "#f2b84b", icon: "app-agy.svg" },
  { id: "kitty", cls: /kitty/, bg: "#230f0a", brand: "#e8a598", icon: "app-kitty.svg" },
  { id: "terminal", cls: /gnome-terminal|org\.gnome\.terminal|org\.gnome\.console|xterm|foot|alacritty/, bg: "#241f31", brand: "#c0bfbc", icon: "org.gnome.Console" },
  { id: "telegram", cls: /telegram/, bg: "#17212b", brand: "#2aabee", icon: "app-telegram.svg" },
  { id: "steam-game", cls: /^steam_app_|^steam_proton/, bg: "#171a21", brand: "#c7d5e0", icon: "app-steam.svg" },
  { id: "steam", cls: /^steam$/, bg: "#1b2838", brand: "#66c0f4", icon: "app-steam.svg" },
  { id: "zoom", cls: /^zoom/, bg: "#0e1a2b", brand: "#2d8cff", icon: "app-video.svg" },
  { id: "obsidian", cls: /obsidian/, bg: "#1e1e1e", brand: "#9d7bff", icon: "app-obsidian.svg" },
  { id: "files", cls: /nautilus|thunar|dolphin|nemo|pcmanfm|org\.gnome\.files/, bg: "#242424", brand: "#62a0ea", icon: "app-folder.svg" },
  { id: "mpv", cls: /^mpv$/, bg: "#161616", brand: "#a64dba", icon: "app-mpv.svg" },
  { id: "vlc", cls: /^vlc$/, bg: "#1a1a1a", brand: "#ff8800", icon: "app-vlc.svg" },
  { id: "obs", cls: /^obs$|obsproject/, bg: "#1d1d26", brand: "#c4c4d4", icon: "com.obsproject.Studio" },
  { id: "audacity", cls: /audacity/, bg: "#1f1a2e", brand: "#f7a51c", icon: "audacity" },
  { id: "blender", cls: /blender/, bg: "#232323", brand: "#ea7600", icon: "/home/kodex/.local/opt/blender-5.2.0/blender.svg" },
  { id: "inkscape", cls: /inkscape/, bg: "#1b1b1b", brand: "#e6e6e6", icon: "org.inkscape.Inkscape" },
  { id: "wireshark", cls: /wireshark/, bg: "#0e2a47", brand: "#1679a7", icon: "org.wireshark.Wireshark" },
  { id: "easyeffects", cls: /easyeffects/, bg: "#1e1e2a", brand: "#62a0ea", icon: "com.github.wwmm.easyeffects" },
  { id: "pavucontrol", cls: /pavucontrol/, bg: "#1e2a1e", brand: "#8ff0a4", icon: "multimedia-volume-control" },
  { id: "qpwgraph", cls: /qpwgraph/, bg: "#1a1a24", brand: "#9a9ae0", icon: "org.rncbc.qpwgraph" },
  { id: "settings", cls: /org\.gnome\.settings|gnome-control-center|gnome-tweaks/, bg: "#2a2a2e", brand: "#9a9996", icon: "org.gnome.Settings" },
  { id: "papers", cls: /org\.gnome\.papers|evince/, bg: "#2a1f1f", brand: "#e01b24", icon: "org.gnome.Papers" },
  { id: "nsight", cls: /nsys|ncu|nsight/, bg: "#0f1a05", brand: "#76b900", icon: "/opt/nvidia/nsight-systems/2026.3.2/host-linux-x64/nsys-ui.png" },
  { id: "hermes", cls: /^hermes/, bg: "#1a1a1a", brand: "#d4af37", icon: "/home/kodex/.local/share/icons/hermes-pykodex.png" },
  { id: "warp", cls: /warp-taskbar|cloudflarewarp/, bg: "#2b1606", brand: "#f38020", icon: "zero-trust-orange" },

  { id: "firefox", cls: /firefox/, bg: "#1c1b22", brand: "#ff7139", icon: "app-firefox.svg" },
  { id: "chromium", cls: /^chromium/, bg: "#202124", brand: "#4c8bf5", icon: "app-chromium.svg" },
  { id: "brave", cls: /^brave-browser$/, bg: "#222326", brand: "#fb542b", icon: "app-brave.svg" },
]

export const BROWSER_RE = /^(brave|chromium|firefox|google-chrome|org\.mozilla\.firefox|zen)/

export function findApp(appClass: string, title: string): AppEntry | null {
  const c = appClass.toLowerCase()
  const isBrowser = BROWSER_RE.test(c)
  for (const a of APP_INDEX) {
    if (a.cls?.test(c)) return a
    if (a.title && isBrowser && a.title.test(title)) return a
  }
  return null
}
