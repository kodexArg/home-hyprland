-- Paneles por monitor desde KDX_PANELS en ~/.config/kodex/local.env.
-- Formato: "<monitor>:<cantidad>,..." de izquierda a derecha; <monitor> es un
-- conector (eDP-1) o "desc:<descripción>". Los paneles se numeran 1..N en ese
-- orden y el primero de cada monitor es el que se muestra al iniciar.
-- AGS (WorkspacePeek) los lee en vivo de `hyprctl workspaces -j`.
local DEFAULT = "HDMI-A-2:3,HDMI-A-1:3"

local function localEnv(key)
    local f = io.open(os.getenv("HOME") .. "/.config/kodex/local.env")
    if not f then return nil end
    local value
    for line in f:lines() do
        local k, v = line:match("^%s*([%w_]+)%s*=%s*(.-)%s*$")
        if k == key then value = v:gsub('^["\'](.*)["\']$', "%1") end
    end
    f:close()
    return value
end

local spec = localEnv("KDX_PANELS")
if spec == nil or spec == "" then spec = DEFAULT end

local id = 0
for item in spec:gmatch("[^,]+") do
    local monitor, count = item:match("^%s*(.-):(%d+)%s*$")
    if monitor then
        for i = 1, tonumber(count) do
            id = id + 1
            hl.workspace_rule({ workspace = tostring(id), monitor = monitor, default = i == 1, persistent = true })
        end
    end
end
