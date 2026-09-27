-- zensid (Asus Zenbook i5-5200U · Intel HD 5500 · Debian 13 trixie)
-- Written from scratch for Hyprland 0.55.x (trixie-backports). Same idea as
-- Sid/TUF (AGS bar, Super chords, hypr-* helpers, kdx-hypr-control/HyprControl)
-- but only hl.* API present in 0.55.2 — do NOT paste 0.56-only calls here
-- (hl.dsp.release_input_capture, hl.workspace.change_id, hl.is_key_down, …).
-- Live: ~/.config/hypr/hyprland.lua = copy of (or symlink to) this file.

-- ── Monitors ────────────────────────────────────────────────────────────────
-- eDP-1: 13" panel, native 3200x1800 (QHD+, not 4K). Scale 2.5 → 1280x720
--        effective — Gabriel's max tolerated width on this panel.
-- TV:    Samsung 54" on HDMI-A-1. HD 5500 / HDMI 1.4 only does 4K@30, so cap at
--        1920x1080@60 (never above 1920 wide). Once `hyprctl monitors` shows the
--        exact description, switch `tv` to "desc:<Make Model Serial>" (EDID SAM
--        "SAMSUNG" 0x01000E00 per Mutter) so connector renames don't matter.
local panel = "eDP-1"
local tv    = "HDMI-A-1"

hl.monitor({ output = panel, mode = "3200x1800@60", position = "0x0",    scale = 2.5 })
hl.monitor({ output = tv,    mode = "1920x1080@60", position = "1280x0", scale = 1 })
-- Anything else plugged in: preferred mode, to the right, scale 1.
hl.monitor({ output = "",    mode = "preferred",    position = "auto",   scale = 1 })

-- Workspaces: 1–3 on the panel (left), 4–6 on the TV (right) — Sid convention.
hl.workspace_rule({ workspace = "1", monitor = panel, default = true, persistent = true })
hl.workspace_rule({ workspace = "2", monitor = panel, persistent = true })
hl.workspace_rule({ workspace = "3", monitor = panel, persistent = true })
hl.workspace_rule({ workspace = "4", monitor = tv,    default = true, persistent = true })
hl.workspace_rule({ workspace = "5", monitor = tv,    persistent = true })
hl.workspace_rule({ workspace = "6", monitor = tv,    persistent = true })

-- ── Environment (Intel iGPU only: no NVIDIA vars, no AQ_DRM_DEVICES) ──────────
hl.env("XCURSOR_SIZE", "24")
hl.env("HYPRCURSOR_SIZE", "24")
hl.env("LIBVA_DRIVER_NAME", "iHD")        -- intel-media-va-driver (Broadwell)
hl.env("KDX_BAR_MODEL", "EDP")            -- AGS: bar on the laptop panel
hl.env("KDX_NO_NVIDIA", "1")              -- AGS: no nvidia-smi, no VRAM row
hl.env("GSK_RENDERER", "gl")              -- GTK4 (AGS) on old Intel: GL, not Vulkan

-- ── Programs ────────────────────────────────────────────────────────────────
local home        = "/home/kodex"
local bin         = home .. "/.local/bin/"
local terminal    = "kitty"
local fileManager = "nautilus"
local browser     = "brave-browser"
local menu        = "hyprlauncher"
-- anyrun (cargo, optional on zensid) → fall back to fuzzel/wofi from trixie.
local launcher    = "sh -c 'if [ -x " .. bin .. "anyrun-launch ]; then exec " .. bin ..
                    "anyrun-launch; elif command -v fuzzel >/dev/null; then exec fuzzel; else exec wofi --show drun; fi'"
local shot        = bin .. "hypr-screenshot"
local rec         = bin .. "hypr-record"
local kdxShare    = bin .. "kdx-share"
local reveal      = bin .. "hypr-reveal-all"
local btToggle    = bin .. "hypr-bluetooth-toggle"
local agsBin      = "PATH=" .. bin .. ":/usr/local/bin:/usr/bin /usr/local/bin/ags"
local grokBot     = "grok-bot"                -- /usr/bin/grok-bot (deb grok-bot, class grok-bot)
local stremio     = "stremio-qt6"             -- deb stremio-qt6 (vejeta/stremio-debian, trixie build)
local mainMod     = "SUPER"
local resizeStep  = 40

-- ── Look & feel: light on purpose (HD 5500, 7.6 GiB RAM) ────────────────────
hl.config({
    general = {
        gaps_in          = 3,
        gaps_out         = 4,
        border_size      = 2,
        col              = {
            active_border   = "rgba(ff8c42ee)",
            inactive_border = "rgba(3a352faa)",
        },
        resize_on_border = false,
        allow_tearing    = false,
        layout           = "dwindle",
    },
    decoration = {
        rounding         = 6,
        active_opacity   = 1.0,
        inactive_opacity = 1.0,
        shadow           = { enabled = false },
        blur             = { enabled = false },
    },
    animations = { enabled = true },
    dwindle    = { preserve_split = true },
    misc = {
        force_default_wallpaper  = 0,
        disable_hyprland_logo    = true,
        disable_splash_rendering = true,
        mouse_move_enables_dpms  = true,
        key_press_enables_dpms   = true,
    },
    input = {
        kb_layout    = "us",
        kb_variant   = "altgr-intl",
        follow_mouse = 1,
        sensitivity  = 0,
        touchpad     = {
            natural_scroll          = false,
            ["tap-to-click"]        = true,
            disable_while_typing    = true,
        },
    },
    xwayland  = { force_zero_scaling = true },   -- no blurry XWayland at 2.5
    ecosystem = { no_update_news = true, no_donation_nag = true },
})

-- Few, short animations (no springs, no popin): cheap on the iGPU.
hl.curve("quick", { type = "bezier", points = { { 0.15, 0 }, { 0.1, 1 } } })
hl.animation({ leaf = "global",     enabled = true,  speed = 4, bezier = "quick" })
hl.animation({ leaf = "windows",    enabled = true,  speed = 3, bezier = "quick", style = "slide" })
hl.animation({ leaf = "fade",       enabled = true,  speed = 3, bezier = "quick" })
hl.animation({ leaf = "workspaces", enabled = true,  speed = 3, bezier = "quick", style = "fade" })
hl.animation({ leaf = "border",     enabled = false })

hl.gesture({ fingers = 3, direction = "horizontal", action = "workspace" })

-- ── Window rules ────────────────────────────────────────────────────────────
-- Grok Bot: autostarted at login, lands silently on the panel (ws 1).
hl.window_rule({
    name      = "grok-bot-panel",
    match     = { class = "grok-bot" },
    workspace = "1 silent",
})
-- zensid + Samsung = media box: Stremio / VLC / mpv go to the TV (ws 4),
-- fullscreen, and keep the screen awake while fullscreen.
hl.window_rule({
    name         = "media-on-tv",
    match        = { class = "(?i)^(.*stremio.*|vlc|mpv)$" },
    monitor      = tv,
    workspace    = "4",
    fullscreen   = true,
    idle_inhibit = "fullscreen",
})

local function openOrFocusGrokBot()
    for _, w in ipairs(hl.get_windows()) do
        if w.class and string.lower(w.class) == "grok-bot" then
            hl.dispatch(hl.dsp.focus({ window = w }))
            return
        end
    end
    hl.dispatch(hl.dsp.exec_cmd(grokBot))
end

-- ── Keybinds (parity with Sid/TUF where the tool exists on zensid) ──────────
hl.bind(mainMod .. " + T", hl.dsp.exec_cmd(terminal))
hl.bind(mainMod .. " + G", openOrFocusGrokBot)
hl.bind(mainMod .. " + Z", hl.dsp.exec_cmd(stremio))   -- Stremio on the TV
hl.bind(mainMod .. " + X", hl.dsp.exec_cmd(browser))
hl.bind(mainMod .. " + E", hl.dsp.exec_cmd(fileManager))
hl.bind(mainMod .. " + R", hl.dsp.exec_cmd(menu))
hl.bind(mainMod .. " + SPACE", hl.dsp.exec_cmd(launcher))
hl.bind(mainMod .. " + SHIFT + E", hl.dsp.exit())

hl.bind(mainMod .. " + C",        hl.dsp.window.close())
hl.bind(mainMod .. " + CTRL + C", hl.dsp.window.kill())
hl.bind(mainMod .. " + V",        hl.dsp.window.float({ action = "toggle" }))
hl.bind(mainMod .. " + P",        hl.dsp.window.pseudo())
hl.bind(mainMod .. " + Q",        hl.dsp.layout("togglesplit"))
hl.bind(mainMod .. " + A",        hl.dsp.exec_cmd(reveal))
hl.bind(mainMod .. " + F",        hl.dsp.window.fullscreen({ mode = "maximized", action = "toggle" }))
hl.bind(mainMod .. " + SHIFT + F", hl.dsp.window.fullscreen({ mode = "fullscreen", action = "toggle" }))
hl.bind(mainMod .. " + CTRL + R", hl.dsp.exec_cmd(kdxShare .. " menu"))
hl.bind(mainMod .. " + ALT + B",  hl.dsp.exec_cmd(btToggle))

-- AGS bar
hl.bind(mainMod .. " + B", hl.dsp.exec_cmd(agsBin .. " request bar-cycle"))
hl.bind("Super_L", hl.dsp.exec_cmd(agsBin .. " request bar-peek"), { non_consuming = true })
hl.bind("Super_R", hl.dsp.exec_cmd(agsBin .. " request bar-peek"), { non_consuming = true })

-- Screenshots / disk record
hl.bind("Print",                 hl.dsp.exec_cmd(shot .. " window"))
hl.bind("CTRL + Print",          hl.dsp.exec_cmd(shot .. " region"))
hl.bind("ALT + Print",           hl.dsp.exec_cmd(shot .. " full"))
hl.bind(mainMod .. " + Print",   hl.dsp.exec_cmd(shot .. " monitor active"))
hl.bind(mainMod .. " + SHIFT + R",       hl.dsp.exec_cmd(rec .. " toggle region"))
hl.bind(mainMod .. " + SHIFT + ALT + R", hl.dsp.exec_cmd(rec .. " toggle window"))

-- Focus / move / resize
for _, d in ipairs({ "left", "right", "up", "down" }) do
    hl.bind(mainMod .. " + " .. d,           hl.dsp.focus({ direction = d }))
    hl.bind(mainMod .. " + SHIFT + " .. d,   hl.dsp.window.move({ direction = d }))
end
hl.bind(mainMod .. " + CTRL + left",  hl.dsp.window.resize({ x = -resizeStep, y = 0, relative = true }), { repeating = true })
hl.bind(mainMod .. " + CTRL + right", hl.dsp.window.resize({ x =  resizeStep, y = 0, relative = true }), { repeating = true })
hl.bind(mainMod .. " + CTRL + up",    hl.dsp.window.resize({ x = 0, y = -resizeStep, relative = true }), { repeating = true })
hl.bind(mainMod .. " + CTRL + down",  hl.dsp.window.resize({ x = 0, y =  resizeStep, relative = true }), { repeating = true })

-- Workspaces 1..10 (Super+0 = 10)
for i = 1, 10 do
    local key = i % 10
    hl.bind(mainMod .. " + " .. key,         hl.dsp.focus({ workspace = i }))
    hl.bind(mainMod .. " + SHIFT + " .. key, hl.dsp.window.move({ workspace = i }))
end
hl.bind(mainMod .. " + S",         hl.dsp.workspace.toggle_special("magic"))
hl.bind(mainMod .. " + SHIFT + S", hl.dsp.window.move({ workspace = "special:magic" }))
hl.bind(mainMod .. " + mouse_down", hl.dsp.focus({ workspace = "e+1" }))
hl.bind(mainMod .. " + mouse_up",   hl.dsp.focus({ workspace = "e-1" }))
hl.bind(mainMod .. " + mouse:272",  hl.dsp.window.drag(),   { mouse = true })
hl.bind(mainMod .. " + mouse:273",  hl.dsp.window.resize(), { mouse = true })

-- Media / brightness (laptop keys)
hl.bind("XF86AudioRaiseVolume",  hl.dsp.exec_cmd("wpctl set-volume -l 1 @DEFAULT_AUDIO_SINK@ 5%+"), { locked = true, repeating = true })
hl.bind("XF86AudioLowerVolume",  hl.dsp.exec_cmd("wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-"),      { locked = true, repeating = true })
hl.bind("XF86AudioMute",         hl.dsp.exec_cmd("wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle"),     { locked = true })
hl.bind("XF86AudioMicMute",      hl.dsp.exec_cmd("wpctl set-mute @DEFAULT_AUDIO_SOURCE@ toggle"),   { locked = true })
hl.bind("XF86MonBrightnessUp",   hl.dsp.exec_cmd("brightnessctl -e4 -n2 set 5%+"),                  { locked = true, repeating = true })
hl.bind("XF86MonBrightnessDown", hl.dsp.exec_cmd("brightnessctl -e4 -n2 set 5%-"),                  { locked = true, repeating = true })
hl.bind("XF86AudioNext",         hl.dsp.exec_cmd("playerctl next"),       { locked = true })
hl.bind("XF86AudioPlay",         hl.dsp.exec_cmd("playerctl play-pause"), { locked = true })
hl.bind("XF86AudioPause",        hl.dsp.exec_cmd("playerctl play-pause"), { locked = true })
hl.bind("XF86AudioPrev",         hl.dsp.exec_cmd("playerctl previous"),   { locked = true })

-- ── Session start ───────────────────────────────────────────────────────────
hl.on("hyprland.start", function()
    -- Export compositor env to the user manager, then start supervised units.
    hl.exec_cmd("systemctl --user import-environment WAYLAND_DISPLAY XDG_CURRENT_DESKTOP HYPRLAND_INSTANCE_SIGNATURE DISPLAY KDX_BAR_MODEL KDX_NO_NVIDIA GSK_RENDERER")
    hl.exec_cmd("systemctl --user start hyprpaper.service hypridle.service hyprpolkitagent.service")
    hl.exec_cmd("systemctl --user start ags-hyprland.service")
    -- Grok Bot autostart (single instance), same idea as Sid
    hl.exec_cmd("pgrep -x grok-bot >/dev/null 2>&1 || " .. grokBot)
end)
