-- Bind by panel description, not DRM connector name.
-- After kernel 7.1.8 the AMD card is card0; NVIDIA may be absent until DKMS
-- builds. Connector names then move (ASUS became HDMI-A-1). desc: stays stable.
local asus = "desc:ASUSTek COMPUTER INC VA27EHF"
local aoc  = "desc:AOC G2790G4"

-- Both landscape, ASUS left of AOC. Mixed portrait/landscape saved as
-- git 1c209aa — restore transform 1 / -1080x0 / 0x420 when going back.
hl.monitor({ output = asus, mode = "preferred", position = "-1920x0", scale = 1, transform = 0 })
hl.monitor({ output = aoc,  mode = "preferred", position = "0x0",     scale = 1, transform = 0 })

-- Workspaces pinned to panels (portrait left / landscape right).
-- Defaults shown at login: 1 on ASUS, 4 on AOC.
hl.workspace_rule({ workspace = "1", monitor = asus, default = true,  persistent = true })
hl.workspace_rule({ workspace = "2", monitor = asus, persistent = true })
hl.workspace_rule({ workspace = "3", monitor = asus, persistent = true })
hl.workspace_rule({ workspace = "4", monitor = aoc,  default = true,  persistent = true })
hl.workspace_rule({ workspace = "5", monitor = aoc,  persistent = true })
hl.workspace_rule({ workspace = "6", monitor = aoc,  persistent = true })

hl.env("XCURSOR_SIZE", "24")
hl.env("HYPRCURSOR_SIZE", "24")
hl.env("LIBVA_DRIVER_NAME", "nvidia")
hl.env("__GLX_VENDOR_LIBRARY_NAME", "nvidia")
hl.env("NVD_BACKEND", "direct")
-- NVIDIA (01:00.0) primary render + amdgpu Renoir (08:00.0) portrait scanout.
-- Aquamarine splits AQ_DRM_DEVICES on ':'. PCI by-path names contain ':'
-- (pci-0000:01:00.0) so they abort the compositor (login flash / GDM loop).
-- Resolve by-path → /dev/dri/cardN here. Fallback is the 2026-08-18 map
-- (NVIDIA=card1, amdgpu=card0) after kernel 7.1.8.
-- Without linear blit, Aquamarine fails dmabuf import into the secondary
-- renderer (EGL_BAD_MATCH) and the panel stays powered with no usable frame.
local function drm_card(pci, fallback)
    local link = "/dev/dri/by-path/pci-" .. pci .. "-card"
    if io and io.popen then
        local handle = io.popen("readlink -f -- " .. link)
        if handle then
            local path = handle:read("*l")
            handle:close()
            if path and path:match("^/dev/dri/card%d+$") then
                return path
            end
        end
    end
    return fallback
end
hl.env("AQ_DRM_DEVICES", drm_card("0000:01:00.0", "/dev/dri/card1") .. ":" .. drm_card("0000:08:00.0", "/dev/dri/card0"))
hl.env("AQ_FORCE_LINEAR_BLIT", "1")

local terminal    = "kitty"
local fileManager = "nautilus"
local browser     = "brave-browser"
-- Brave PWA: WhatsApp Web (desktop: brave-hnpfjngllnobngcgfapefoaidbinmjnm-Default)
local whatsapp    = "brave-browser --profile-directory=Default --app-id=hnpfjngllnobngcgfapefoaidbinmjnm"
-- Brave PWA: YouTube (desktop/app: brave-agimnkijcaahngcdmfeangaknmldooml-Default)
local youtube     = "brave-browser --profile-directory=Default --app-id=agimnkijcaahngcdmfeangaknmldooml"
-- Brave PWA: Grok Web (desktop: brave-ggjocahimgaohmigbfhghnlfcnjemagj-Default · grok.com)
local grokWeb     = "brave-browser --profile-directory=Default --app-id=ggjocahimgaohmigbfhghnlfcnjemagj"
local dshWeb      = "/home/kodex/.local/bin/dsh-web-session"
local menu        = "hyprlauncher"
local anyrun      = "/home/kodex/.local/bin/anyrun-launch"
local shot        = "/home/kodex/.local/bin/hypr-screenshot"
local rec         = "/home/kodex/.local/bin/hypr-record"
-- PAUSED 2026-07-28: voice stack under work — Super+D / Super+L disabled.
-- local dictate     = "/home/kodex/.local/bin/dictate"
-- local voiceLive   = "/home/kodex/.local/bin/voice-live"
local recMode     = "/home/kodex/.local/bin/kdx-rec-mode"
local liveMode    = "/home/kodex/.local/bin/kdx-live-mode"
local zoomToggle  = "/bin/bash /home/kodex/.local/bin/hypr-zoom-toggle"
local kdxShare    = "/home/kodex/.local/bin/kdx-share"
local agsBin      = "PATH=/home/kodex/.local/bin:/usr/local/bin:/usr/bin /usr/local/bin/ags"
local grokCli     = "kitty --class grok-cli --title Grok -c /home/kodex/.config/kitty/grok.conf /home/kodex/.local/bin/grok --fullscreen"
local agyCli      = "kitty --class agy-cli --title AGY -c /home/kodex/.config/kitty/agy.conf /home/kodex/.local/bin/agy --dangerously-skip-permissions"
local mainMod     = "SUPER"
local resizeStep  = 40

local pointerSpeed80Percent     = -0.2
local hyprlandWallpaperDisabled = 0
-- Cursor policy (dual-GPU NVIDIA card0 + amdgpu card1):
-- Software-only (no_hardware_cursors=1) left a stuck KMS HW cursor plane on
-- HDMI-A-1 (AOC) bottom-right identical to the real cursor — grim cannot see it.
-- Use HW cursors again + CPU buffer (multi-GPU safe path) so one plane is owned
-- and updated. AQ_FORCE_LINEAR_BLIT already covers secondary-scanout import.
local hardwareCursorsDisabled   = false
local cursorUseCpuBuffer        = true
local cursorDefaultMonitor      = aoc
local duckyPhantomPointer       = "ducky-ducky-one2-sf-rgb-1"
local wirelessPhantomPointer    = "logitech-wireless-mouse-1"

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
        force_default_wallpaper  = hyprlandWallpaperDisabled,
        disable_hyprland_logo    = true,
        disable_splash_rendering = true,
        mouse_move_enables_dpms  = true,
        key_press_enables_dpms   = true,
    },

    input = {
        kb_layout     = "us",
        kb_variant    = "altgr-intl",
        follow_mouse  = 1,
        sensitivity   = pointerSpeed80Percent,
        accel_profile = "flat",
        touchpad      = { natural_scroll = false },
    },

    cursor = {
        -- map: 0=allow HW, 1=force software, 2=auto
        no_hardware_cursors = hardwareCursorsDisabled,
        use_cpu_buffer      = cursorUseCpuBuffer,
        default_monitor     = cursorDefaultMonitor,
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

hl.device({ name = duckyPhantomPointer, enabled = false })
-- Unifying receiver still enumerates a pointer even without a live mouse.
hl.device({ name = wirelessPhantomPointer, enabled = false })

local function windowHasTag(w, tag)
    if w == nil or w.tags == nil then
        return false
    end
    for _, t in ipairs(w.tags) do
        if t == tag or t == tag .. "*" then
            return true
        end
    end
    return false
end

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
    if windowHasTag(w, "true-fs") then
        return
    end
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
    monitor = aoc,
})

hl.window_rule({
    name    = "agy-cli-screen-2",
    match   = { class = "agy-cli" },
    monitor = aoc,
})

-- OBS control surface on right landscape (AOC / ws 6).
-- no_screen_share: PipeWire output capture of AOC must not recurse OBS UI
-- into source "right horizontal" (black rect instead of hall-of-mirrors).
-- Content for that source: workspaces 4–5 while OBS stays on 6.
hl.window_rule({
    name             = "obs-control-right",
    match            = { class = "com.obsproject.Studio" },
    monitor          = aoc,
    workspace        = "6 silent",
    no_screen_share  = true,
})

-- Project Zomboid: game surface lives on right landscape ws 6.
hl.window_rule({
    name      = "project-zomboid-right",
    match     = { class = "Project Zomboid" },
    monitor   = aoc,
    workspace = "6 silent",
})

-- Super+K tags the active window; this rule confines the pointer while tagged.
local pointerConfineTag = "pointer-confine"
hl.window_rule({
    name             = "tag-confine-pointer",
    match            = { tag = ".*" .. pointerConfineTag .. ".*" },
    confine_pointer  = true,
})

-- kdx-share: menu floats; composite on headless kdxShare (class = app-id)
hl.window_rule({
    name   = "kdx-share-menu-float",
    match  = { title = "^kdx-share$" },
    float  = true,
    center = true,
})
hl.window_rule({
    name    = "kdx-share-both-headless",
    match   = { class = "com.kodexarg.kdx-share.both" },
    monitor = "kdxShare",
})
hl.window_rule({
    name  = "kdx-share-mirror-float",
    match = { class = "at.yrlf.wl_mirror", title = "kdx-share.*" },
    float = true,
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

local function togglePointerConfine()
    local w = hl.get_active_window()
    if w == nil then
        return
    end
    local on = windowHasTag(w, pointerConfineTag)
    if on then
        hl.dispatch(hl.dsp.window.tag({ tag = "-" .. pointerConfineTag, window = w }))
        pcall(function()
            hl.notification.create({ text = "mouse libre", timeout = 1500, icon = "ok" })
        end)
    else
        hl.dispatch(hl.dsp.window.tag({ tag = "+" .. pointerConfineTag, window = w }))
        pcall(function()
            hl.notification.create({ text = "mouse atrapado", timeout = 1500, icon = "ok" })
        end)
    end
end

local function toggleTrueFullscreen()
    local w = hl.get_active_window()
    if w == nil then
        return
    end
    local isTrueFs = (w.fullscreen == 2) or windowHasTag(w, "true-fs")
    if isTrueFs then
        hl.dispatch(hl.dsp.window.tag({ tag = "-true-fs", window = w }))
        hl.dispatch(hl.dsp.window.fullscreen_state({ internal = 0, client = 0, action = "set", window = w }))
        hl.dispatch(hl.dsp.window.fullscreen({ mode = "fullscreen", action = "unset", window = w }))
        pcall(function()
            hl.notification.create({ text = "Fullscreen desactivado", timeout = 1500, icon = "ok" })
        end)
    else
        hl.dispatch(hl.dsp.window.tag({ tag = "+true-fs", window = w }))
        hl.dispatch(hl.dsp.window.fullscreen({ mode = "fullscreen", action = "set", window = w }))
        pcall(function()
            hl.notification.create({ text = "True Fullscreen", timeout = 1500, icon = "ok" })
        end)
    end
end

hl.bind(mainMod .. " + T", hl.dsp.exec_cmd(terminal))
hl.bind(mainMod .. " + G", hl.dsp.exec_cmd(grokCli))
hl.bind(mainMod .. " + SHIFT + G", hl.dsp.exec_cmd(grokWeb))
hl.bind(mainMod .. " + N", hl.dsp.exec_cmd(agyCli))
hl.bind(mainMod .. " + X", hl.dsp.exec_cmd(browser))
hl.bind(mainMod .. " + H", hl.dsp.exec_cmd(dshWeb))
hl.bind(mainMod .. " + W", hl.dsp.exec_cmd(whatsapp))
hl.bind(mainMod .. " + Y", hl.dsp.exec_cmd(youtube))
hl.bind(mainMod .. " + E", hl.dsp.exec_cmd(fileManager))
hl.bind(mainMod .. " + R", hl.dsp.exec_cmd(menu))
hl.bind(mainMod .. " + SPACE", hl.dsp.exec_cmd(anyrun))
-- Exit = Super+Shift+E (deliberate chord). Super+M = REC mode UI toggle (WIP).
hl.bind(mainMod .. " + SHIFT + E", hl.dsp.exec_cmd("command -v hyprshutdown >/dev/null 2>&1 && hyprshutdown || hyprctl dispatch 'hl.dsp.exit()'"))
hl.bind(mainMod .. " + M", hl.dsp.exec_cmd(recMode .. " toggle"))

-- FREE 2026-08-01: Super+L liberada — reservada para una futura versión de kodexBot.
-- (era: hl.bind(mainMod .. " + L", hl.dsp.exec_cmd(liveMode .. " toggle")))
local dictator = "/home/kodex/.local/bin/kdx-dictator"
hl.bind(mainMod .. " + D", hl.dsp.exec_cmd(dictator .. " toggle"))

-- Close vs kill (same key family): Super+C polite close · Super+Ctrl+C force kill.
-- Super+Ctrl+X kept as alias for muscle memory.
hl.bind(mainMod .. " + C", hl.dsp.window.close())
hl.bind(mainMod .. " + CTRL + C", hl.dsp.window.kill())
hl.bind(mainMod .. " + CTRL + X", hl.dsp.window.kill())
hl.bind(mainMod .. " + V", hl.dsp.window.float({ action = "toggle" }))
hl.bind(mainMod .. " + P", hl.dsp.window.pseudo())
hl.bind(mainMod .. " + Q", hl.dsp.layout("togglesplit"))
hl.bind(mainMod .. " + A", revealAllWindows)
hl.bind(mainMod .. " + F", hl.dsp.window.fullscreen({ mode = "maximized", action = "toggle" }))
hl.bind(mainMod .. " + SHIFT + F", toggleTrueFullscreen)
hl.bind(mainMod .. " + K", togglePointerConfine)
hl.bind(mainMod .. " + CTRL + Z", hl.dsp.exec_cmd(zoomToggle))
-- Super+R = hyprlauncher (keep). Super+Ctrl+R = kdx-share transmit picker.
hl.bind(mainMod .. " + CTRL + R", hl.dsp.exec_cmd(kdxShare .. " menu"))

hl.bind(mainMod .. " + B", hl.dsp.exec_cmd(agsBin .. " request bar-cycle"))
hl.bind("Super_L", hl.dsp.exec_cmd(agsBin .. " request bar-peek"), { non_consuming = true })
hl.bind("Super_R", hl.dsp.exec_cmd(agsBin .. " request bar-peek"), { non_consuming = true })

hl.bind("Print",               hl.dsp.exec_cmd(shot .. " window"))
hl.bind("CTRL + Print",        hl.dsp.exec_cmd(shot .. " region"))
hl.bind("ALT + Print",         hl.dsp.exec_cmd(shot .. " full"))
hl.bind(mainMod .. " + Print", hl.dsp.exec_cmd(shot .. " monitor active"))

-- Disk screencast (mp4). Super+Ctrl+R is kdx-share transmit — do not collide.
-- ADR 20260806-hypr-record-disk-screencast · skill references/record.md
hl.bind(mainMod .. " + SHIFT + R",     hl.dsp.exec_cmd(rec .. " toggle region"))
hl.bind(mainMod .. " + SHIFT + ALT + R", hl.dsp.exec_cmd(rec .. " toggle window"))

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
-- MMB (274): plain click passes through; Super+MMB drags (frees middle-click)
hl.bind(mainMod .. " + mouse:274", hl.dsp.window.drag(),   { mouse = true })

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
    hl.exec_cmd("systemctl --user start hypridle.service")
    -- Supervised AGS (Restart=always). Bare `ags run` dies after monitor storms
    -- and never returns — bar lives only on portrait HDMI-A-2.
    hl.exec_cmd("systemctl --user import-environment WAYLAND_DISPLAY XDG_CURRENT_DESKTOP HYPRLAND_INSTANCE_SIGNATURE DISPLAY")
    hl.exec_cmd("systemctl --user start ags-hyprland.service")
    hl.exec_cmd(terminal)
    -- anyrun-launch sets PATH incl. /usr/games (Steam game .desktop Exec=steam …)
    hl.exec_cmd("/home/kodex/.local/bin/anyrun-launch daemon")
end)

-- Dual-GPU escape: wake + soft-hotplug portrait CRTC + re-layout + AGS
hl.bind(mainMod .. " + SHIFT + O", hl.dsp.exec_cmd("/bin/bash /home/kodex/.local/bin/hypr-monitor-heal manual"), { locked = true })
