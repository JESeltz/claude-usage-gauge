#!/bin/bash
# <swiftbar.title>Claude usage battery</swiftbar.title>
# <swiftbar.desc>Claude Pro/Max plan limits and Anthropic API credit left.</swiftbar.desc>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideDisablePlugin>true</swiftbar.hideDisablePlugin>
#
# SwiftBar/xbar menu-bar plugin. The "5m" in the file name means it refreshes every 5 minutes.
# Copy (or symlink) this file into your SwiftBar plugins folder.

# Menu-bar apps don't load your shell profile, so add the usual places Node lives:
# Homebrew, Volta, fnm, and nvm (its newest installed version).
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$HOME/.local/share/fnm/aliases/default/bin:$PATH"
NVM_BIN_DIR=$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)
[ -n "$NVM_BIN_DIR" ] && export PATH="$NVM_BIN_DIR:$PATH"

if command -v claude-gauge >/dev/null 2>&1; then
  exec claude-gauge swiftbar
fi
echo "⚠︎ | color=#FF9F0A"
echo "---"
echo "claude-gauge isn't installed: run 'npm link' in the claude-usage-gauge folder"
