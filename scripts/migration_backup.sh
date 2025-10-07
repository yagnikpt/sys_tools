#!/bin/bash

REMOTE="yagnikpt"
REMOTE_PATH="Migration Backup"

declare -A SOURCE_PATHS=(
    ["$HOME/Documents"]="Documents"
    ["$HOME/Pictures"]="Pictures"
    ["$HOME/.zshrc"]="dotfiles"
    ["$HOME/.wakatime.cfg"]="dotfiles"
    ["$HOME/.config/zed"]=".config/zed"
    ["$HOME/.config/ghostty"]=".config/ghostty"
    ["$HOME/.config/fastfetch"]=".config/fastfetch"
    ["$HOME/.config/mods"]=".config/mods"
    ["$HOME/.config/rofi"]=".config/rofi"
    ["$HOME/.config/mako"]=".config/mako"
    ["$HOME/.config/matugen"]=".config/matugen"
    ["$HOME/.config/niri"]=".config/niri"
    ["$HOME/.config/rclone"]=".config/rclone"
    ["$HOME/.config/gammastep"]=".config/gammastep"
    ["$HOME/codes/dsa"]="codes/dsa"
)

# Flags:
# --update   : skip files that are newer on the remote
# --delete-excluded : remove files deleted locally
# --progress : show progress
# --copy-links : copy symlink targets
RCLONE_FLAGS="--update --copy-links --delete-excluded"

for SRC in "${!SOURCE_PATHS[@]}"; do
    if [ -d "$SRC" ] || [ -f "$SRC" ]; then
        rclone sync "$SRC" "$REMOTE:$REMOTE_PATH/${SOURCE_PATHS[$SRC]}" $RCLONE_FLAGS
    fi
done

notify-send "Files are synced :)" -a "Backup" -e

