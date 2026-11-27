--[[
  Zen Sync for darktable
  Adds "Zen Sync" as an export destination: the exported JPEGs are saved in a new folder
  (under the folder set in preferences > lua options) and Zen Sync opens to sort them.
  Installed by Zen Sync (Settings > Editors > darktable). Licence: MIT.
]]
local dt = require "darktable"

local ZEN_SYNC = "__ZEN_SYNC_APP__"
local sep = package.config:sub(1, 1)
local home = os.getenv("HOME") or os.getenv("USERPROFILE") or "."

dt.preferences.register("zen_sync", "folder", "directory", "Zen Sync: export folder",
  "Photos exported to Zen Sync are saved here, one folder per export", home .. sep .. "Pictures" .. sep .. "Zen Sync")

local function q(s) -- quote for the shell
  if sep == "\\" then return '"' .. s .. '"' end
  return "'" .. string.gsub(s, "'", "'\\''") .. "'"
end

local function initialize(storage, format, images, high_quality, extra)
  extra.files = {}
  local base = dt.preferences.read("zen_sync", "folder", "directory")
  if base == nil or base == "" then base = home .. sep .. "Pictures" .. sep .. "Zen Sync" end
  local roll = "export"
  if images[1] and images[1].film and images[1].film.path then
    roll = images[1].film.path:match("[^/\\]+$") or roll
  end
  extra.dir = base .. sep .. roll .. " " .. os.date("%Y-%m-%d %H.%M.%S")
  return nil
end

local function store(storage, image, format, filename, number, total, high_quality, extra)
  table.insert(extra.files, filename)
end

local function finalize(storage, image_table, extra)
  if #extra.files == 0 then return end
  if sep == "\\" then
    dt.control.execute('mkdir ' .. q(extra.dir))
    for _, f in ipairs(extra.files) do dt.control.execute('move /Y ' .. q(f) .. ' ' .. q(extra.dir)) end
    dt.control.execute('start "" ' .. q(ZEN_SYNC) .. ' ' .. q(extra.dir))
  else
    dt.control.execute("mkdir -p " .. q(extra.dir))
    for _, f in ipairs(extra.files) do dt.control.execute("mv " .. q(f) .. " " .. q(extra.dir .. "/")) end
    if ZEN_SYNC:match("%.app$") then
      dt.control.execute("open -a " .. q(ZEN_SYNC) .. " " .. q(extra.dir))
    else
      dt.control.execute(q(ZEN_SYNC) .. " " .. q(extra.dir) .. " >/dev/null 2>&1 &")
    end
  end
  dt.print("Sent " .. #extra.files .. " photos to Zen Sync")
end

-- Zen Sync sorts JPEGs, so only offer it when the export format is JPEG.
local function supported(storage, format)
  return format.extension == "jpg"
end

dt.register_storage("zen_sync", "Zen Sync", store, finalize, supported, initialize)
