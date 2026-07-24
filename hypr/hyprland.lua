-- Portrait HDMI-A-2 at 1.5 → logical 720×1280; center landscape Y ≈ (1280-1080)/2 = 100
hl.monitor({ output = "HDMI-A-1", mode = "preferred", position = "0x100", scale = 1, transform = 0 })
hl.monitor({ output = "HDMI-A-2", mode = "preferred", position = "1920x0", scale = 1.5, transform = 3 })

hl.env("XCURSOR_SIZE", "24")
hl.env("HYPRCURSOR_SIZE", "24")
hl.env("LIBVA_DRIVER_NAME", "nvidia")
hl.env("__GLX_VENDOR_LIBRARY_NAME", "nvidia")
hl.env("NVD_BACKEND", "direct")
hl.env("AQ_DRM_DEVICES", "/dev/dri/card0:/dev/dri/card1")

local terminal    = "kitty"
local fileManager = "nautilus"
local browser     = "brave-browser"
local menu        = "hyprlauncher"
local anyrun      = "/home/kodex/.local/bin/anyrun-launch"
local shot        = "/home/kodex/.local/bin/hypr-screenshot"
local rec         = "/home/kodex/.local/bin/hypr-record"
local agsBin      = "PATH=/home/kodex/.local/bin:/usr/local/bin:/usr/bin /usr/local/bin/ags"
-- Super+G: dedicated kitty (not gnome-terminal). Binary: ~/.local/bin/grok → ~/.grok/bin/grok
local grokCli     = "kitty --class grok-cli --title Grok -c /home/kodex/.config/kitty/grok.conf /home/kodex/.local/bin/grok --fullscreen"
local mainMod     = "SUPER"
local resizeStep  = 40

hl.config({
    general = {
        gaps_in          = 5,
        gaps_out         = 5,
        border_size      = 2,
        col              = {
            active_border   = { colors = { "rgba(ff8c4288)", "rgba(ffaa7077)" }, angle = 45 },
            inactive_border = "rgba(3a352faa)",
        },
        resize_on_border = false,
        allow_tearing    = false,
        layout           = "dwindle",
    },
    decoration = {
        rounding         = 10,
        rounding_power   = 2,
        active_opacity   = 1.0,
        inactive_opacity = 1.0,
        shadow           = {
            enabled      = true,
            range        = 4,
            render_power = 3,
            color        = 0xee0c0b09,
        },
        blur             = {
            enabled  = true,
            size     = 3,
            passes   = 1,
            vibrancy = 0.1696,
        },
    },
    animations = {
        enabled = true,
    },
    dwindle = {
        preserve_split = true,
    },
    master = {
        new_status = "master",
    },
    scrolling = {
        fullscreen_on_one_column = true,
    },
    misc = {
        force_default_wallpaper  = 0,
        disable_hyprland_logo    = true,
        disable_splash_rendering = true,
    },
    input = {
        kb_layout     = "us",
        kb_variant    = "altgr-intl",
        follow_mouse  = 1,
        -- ~0.8× baseline pointer speed (flat: factor ≈ 1 + sensitivity → -0.2)
        sensitivity   = -0.2,
        accel_profile = "flat",
        touchpad      = { natural_scroll = false },
    },
    cursor = {
        no_hardware_cursors = false,
    },
})

hl.curve("easeOutQuint",   { type = "bezier", points = { { 0.23, 1 },    { 0.32, 1 } } })
hl.curve("easeInOutCubic", { type = "bezier", points = { { 0.65, 0.05 }, { 0.36, 1 } } })
hl.curve("linear",         { type = "bezier", points = { { 0, 0 },       { 1, 1 }    } })
hl.curve("almostLinear",   { type = "bezier", points = { { 0.5, 0.5 },   { 0.75, 1 } } })
hl.curve("quick",          { type = "bezier", points = { { 0.15, 0 },    { 0.1, 1 }  } })
hl.curve("easy",           { type = "spring", mass = 1, stiffness = 71.2633, dampening = 15.8273644 })

hl.animation({ leaf = "global",        enabled = true, speed = 10,   bezier = "default" })
hl.animation({ leaf = "border",        enabled = true, speed = 5.39, bezier = "easeOutQuint" })
hl.animation({ leaf = "windows",       enabled = true, speed = 4.79, spring = "easy" })
hl.animation({ leaf = "windowsIn",     enabled = true, speed = 4.1,  spring = "easy",         style = "popin 87%" })
hl.animation({ leaf = "windowsOut",    enabled = true, speed = 1.49, bezier = "linear",       style = "popin 87%" })
hl.animation({ leaf = "fadeIn",        enabled = true, speed = 1.73, bezier = "almostLinear" })
hl.animation({ leaf = "fadeOut",       enabled = true, speed = 1.46, bezier = "almostLinear" })
hl.animation({ leaf = "fade",          enabled = true, speed = 3.03, bezier = "quick" })
hl.animation({ leaf = "layers",        enabled = true, speed = 3.81, bezier = "easeOutQuint" })
hl.animation({ leaf = "layersIn",      enabled = true, speed = 4,    bezier = "easeOutQuint", style = "fade" })
hl.animation({ leaf = "layersOut",     enabled = true, speed = 1.5,  bezier = "linear",       style = "fade" })
hl.animation({ leaf = "fadeLayersIn",  enabled = true, speed = 1.79, bezier = "almostLinear" })
hl.animation({ leaf = "fadeLayersOut", enabled = true, speed = 1.39, bezier = "almostLinear" })
hl.animation({ leaf = "workspaces",    enabled = true, speed = 1.94, bezier = "almostLinear", style = "fade" })
hl.animation({ leaf = "workspacesIn",  enabled = true, speed = 1.21, bezier = "almostLinear", style = "fade" })
hl.animation({ leaf = "workspacesOut", enabled = true, speed = 1.94, bezier = "almostLinear", style = "fade" })
hl.animation({ leaf = "zoomFactor",    enabled = true, speed = 7,    bezier = "quick" })

hl.gesture({ fingers = 3, direction = "horizontal", action = "workspace" })
hl.device({ name = "ducky-ducky-one2-sf-rgb-1", enabled = false })
-- G300s: ~0.8× current speed. flat accel → factor ≈ 1 + sensitivity → -0.2 ≈ 0.8×
-- (ratbag DPI steps are 250…; no 800 — keep 1000dpi HW, software scale here)
hl.device({
    name          = "logitech-g300s-optical-gaming-mouse",
    sensitivity   = -0.2,
    accel_profile = "flat",
})

-- No true monitor Full Screen. Client (YouTube F, F11, …) still gets client=2
-- so the app draws "fullscreen" *inside* its window; compositor keeps layout.
-- suppress_event is not enough for Chromium — it still takes the monitor.
-- Super+F maximize (internal=1) is left alone.
hl.window_rule({
    name            = "desync-fullscreen-states",
    match           = { class = ".*" },
    sync_fullscreen = false,
})

local confiningFs = false
hl.on("window.fullscreen", function(w)
    if confiningFs or w == nil then
        return
    end
    -- fullscreen = internal: 0 none, 1 max, 2 FS, 3 max+FS
    local internal = w.fullscreen or 0
    if internal ~= 2 and internal ~= 3 then
        return
    end
    confiningFs = true
    local keepInternal = (internal == 3) and 1 or 0
    hl.dispatch(hl.dsp.window.fullscreen_state({
        internal = keepInternal,
        client   = 2,
        action   = "set",
        window   = w,
    }))
    confiningFs = false
end)

hl.window_rule({
    name              = "brave-render-unfocused",
    match             = { class = "brave.*" },
    render_unfocused  = true,
})

hl.window_rule({
    name     = "fix-xwayland-drags",
    match    = {
        class      = "^$",
        title      = "^$",
        xwayland   = true,
        float      = true,
        fullscreen = false,
        pin        = false,
    },
    no_focus = true,
})

hl.window_rule({
    name  = "move-hyprland-run",
    match = { class = "hyprland-run" },
    move  = "20 monitor_h-120",
    float = true,
})

hl.window_rule({
    name    = "grok-cli-screen-2",
    match   = { class = "grok-cli" },
    monitor = "HDMI-A-2",
})

local function revealAllWindows()
    local targetWs = hl.get_active_workspace()
    if targetWs ~= nil and targetWs.name ~= nil and string.match(targetWs.name, "^special:") then
        targetWs = hl.get_workspace(1)
    end
    local targetId = targetWs and targetWs.id or 1

    for _, w in ipairs(hl.get_windows()) do
        local ws = w.workspace
        if ws == nil or ws.id ~= targetId then
            hl.dispatch(hl.dsp.window.move({ workspace = targetId, window = w }))
        end
        if w.fullscreen == 2 then
            hl.dispatch(hl.dsp.window.fullscreen_state({ internal = 0, client = 0, action = "set", window = w }))
        elseif w.fullscreen == 1 then
            hl.dispatch(hl.dsp.window.fullscreen({ mode = "maximized", action = "unset", window = w }))
        end
    end

    local activeSpecial = hl.get_active_special_workspace()
    if activeSpecial ~= nil then
        local specialName = string.match(activeSpecial.name, "^special:(.+)$") or "magic"
        hl.dispatch(hl.dsp.workspace.toggle_special(specialName))
    end

    hl.dispatch(hl.dsp.focus({ workspace = targetId }))
end

hl.bind(mainMod .. " + T", hl.dsp.exec_cmd(terminal))
hl.bind(mainMod .. " + G", hl.dsp.exec_cmd(grokCli))
hl.bind(mainMod .. " + X", hl.dsp.exec_cmd(browser))
hl.bind(mainMod .. " + E", hl.dsp.exec_cmd(fileManager))
hl.bind(mainMod .. " + R", hl.dsp.exec_cmd(menu))
hl.bind(mainMod .. " + SPACE", hl.dsp.exec_cmd(anyrun))
hl.bind(mainMod .. " + M", hl.dsp.exec_cmd("command -v hyprshutdown >/dev/null 2>&1 && hyprshutdown || hyprctl dispatch 'hl.dsp.exit()'"))

hl.bind(mainMod .. " + C", hl.dsp.window.close())
hl.bind(mainMod .. " + CTRL + X", hl.dsp.window.kill())
hl.bind(mainMod .. " + V", hl.dsp.window.float({ action = "toggle" }))
hl.bind(mainMod .. " + P", hl.dsp.window.pseudo())
hl.bind(mainMod .. " + Q", hl.dsp.layout("togglesplit"))
hl.bind(mainMod .. " + A", revealAllWindows)
-- Super+F: toggle full panel (maximize / restore). Not client true-FS.
hl.bind(mainMod .. " + F", hl.dsp.window.fullscreen({ mode = "maximized", action = "toggle" }))

hl.bind(mainMod .. " + B", hl.dsp.exec_cmd(agsBin .. " request bar-cycle"))
hl.bind("Super_L", hl.dsp.exec_cmd(agsBin .. " request bar-peek"), { non_consuming = true })
hl.bind("Super_R", hl.dsp.exec_cmd(agsBin .. " request bar-peek"), { non_consuming = true })

-- Screenshots (hypr-screenshot): toast labels + file + clipboard
hl.bind("Print",               hl.dsp.exec_cmd(shot .. " window"))           -- focused app window
hl.bind("CTRL + Print",        hl.dsp.exec_cmd(shot .. " region"))           -- area select
hl.bind("ALT + Print",         hl.dsp.exec_cmd(shot .. " full"))             -- full desktop
hl.bind(mainMod .. " + Print", hl.dsp.exec_cmd(shot .. " monitor active"))   -- focused monitor only

-- Screen record (hypr-record / wf-recorder): toggle stop if already recording
hl.bind(mainMod .. " + SHIFT + R",     hl.dsp.exec_cmd(rec .. " toggle region"))  -- area
hl.bind(mainMod .. " + SHIFT + ALT + R", hl.dsp.exec_cmd(rec .. " toggle window"))  -- focused app

hl.bind(mainMod .. " + left",  hl.dsp.focus({ direction = "left" }))
hl.bind(mainMod .. " + right", hl.dsp.focus({ direction = "right" }))
hl.bind(mainMod .. " + up",    hl.dsp.focus({ direction = "up" }))
hl.bind(mainMod .. " + down",  hl.dsp.focus({ direction = "down" }))

hl.bind(mainMod .. " + SHIFT + left",  hl.dsp.window.move({ direction = "left" }))
hl.bind(mainMod .. " + SHIFT + right", hl.dsp.window.move({ direction = "right" }))
hl.bind(mainMod .. " + SHIFT + up",    hl.dsp.window.move({ direction = "up" }))
hl.bind(mainMod .. " + SHIFT + down",  hl.dsp.window.move({ direction = "down" }))

hl.bind(mainMod .. " + CTRL + left",  hl.dsp.window.resize({ x = -resizeStep, y = 0, relative = true }), { repeating = true })
hl.bind(mainMod .. " + CTRL + right", hl.dsp.window.resize({ x =  resizeStep, y = 0, relative = true }), { repeating = true })
hl.bind(mainMod .. " + CTRL + up",    hl.dsp.window.resize({ x = 0, y = -resizeStep, relative = true }), { repeating = true })
hl.bind(mainMod .. " + CTRL + down",  hl.dsp.window.resize({ x = 0, y =  resizeStep, relative = true }), { repeating = true })

for i = 1, 10 do
    local key = i % 10
    hl.bind(mainMod .. " + " .. key,         hl.dsp.focus({ workspace = i }))
    hl.bind(mainMod .. " + SHIFT + " .. key, hl.dsp.window.move({ workspace = i }))
end

-- Super+S: show/hide special:magic. Super+Shift+S: send focused → special.
-- Super+Ctrl+S: toggle focused window membership of special:magic.
local function toggleWindowOnSpecialMagic()
    local w = hl.get_active_window()
    if w == nil then
        return
    end
    local ws = w.workspace
    if ws ~= nil and ws.name ~= nil and string.match(ws.name, "^special:") then
        local target = hl.get_last_workspace()
        if target == nil or (target.name ~= nil and string.match(target.name, "^special:")) then
            target = hl.get_workspace(1)
        end
        local targetId = target and target.id or 1
        hl.dispatch(hl.dsp.window.move({ workspace = targetId, window = w }))
    else
        hl.dispatch(hl.dsp.window.move({ workspace = "special:magic", window = w }))
    end
end

hl.bind(mainMod .. " + S",        hl.dsp.workspace.toggle_special("magic"))
hl.bind(mainMod .. " + SHIFT + S", hl.dsp.window.move({ workspace = "special:magic" }))
hl.bind(mainMod .. " + CTRL + S",  toggleWindowOnSpecialMagic)
hl.bind(mainMod .. " + mouse_down", hl.dsp.focus({ workspace = "e+1" }))
hl.bind(mainMod .. " + mouse_up",   hl.dsp.focus({ workspace = "e-1" }))
hl.bind(mainMod .. " + mouse:272",  hl.dsp.window.drag(),   { mouse = true })
hl.bind(mainMod .. " + mouse:273",  hl.dsp.window.resize(), { mouse = true })
-- MMB alone: drag/move window (no Super). Super+LMB still works.
hl.bind("mouse:274",                hl.dsp.window.drag(),   { mouse = true })

hl.bind("XF86AudioRaiseVolume",  hl.dsp.exec_cmd("wpctl set-volume -l 1 @DEFAULT_AUDIO_SINK@ 5%+"), { locked = true, repeating = true })
hl.bind("XF86AudioLowerVolume",  hl.dsp.exec_cmd("wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-"),      { locked = true, repeating = true })
hl.bind("XF86AudioMute",         hl.dsp.exec_cmd("wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle"),     { locked = true, repeating = true })
hl.bind("XF86AudioMicMute",      hl.dsp.exec_cmd("wpctl set-mute @DEFAULT_AUDIO_SOURCE@ toggle"),   { locked = true, repeating = true })
hl.bind("XF86MonBrightnessUp",   hl.dsp.exec_cmd("brightnessctl -e4 -n2 set 5%+"),                  { locked = true, repeating = true })
hl.bind("XF86MonBrightnessDown", hl.dsp.exec_cmd("brightnessctl -e4 -n2 set 5%-"),                  { locked = true, repeating = true })
hl.bind("XF86AudioNext",         hl.dsp.exec_cmd("playerctl next"),       { locked = true })
hl.bind("XF86AudioPause",        hl.dsp.exec_cmd("playerctl play-pause"), { locked = true })
hl.bind("XF86AudioPlay",         hl.dsp.exec_cmd("playerctl play-pause"), { locked = true })
hl.bind("XF86AudioPrev",         hl.dsp.exec_cmd("playerctl previous"),   { locked = true })

hl.on("hyprland.start", function()
    hl.exec_cmd("hyprpaper")
    hl.exec_cmd(terminal)
    hl.exec_cmd("GSK_RENDERER=gl /home/kodex/.cargo/bin/anyrun daemon")
    hl.exec_cmd("env PATH=/home/kodex/.local/bin:/usr/local/bin:/usr/bin GSK_RENDERER=gl /usr/local/bin/ags run /home/kodex/.config/ags")
end)
