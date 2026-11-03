// Where the gauge keeps its settings, its cache, and your Admin API key.
//
//   settings  ~/.config/claude-usage-gauge/config.json   (balance, budget, thresholds; no secrets)
//   cache     ~/.cache/claude-usage-gauge/daily.json     (last Cost API answer, so status lines stay fast)
//   plan      ~/.cache/claude-usage-gauge/plan.json      (last Pro/Max usage reading from Claude Code)
//   key       macOS Keychain (service "claude-usage-gauge", account "admin-key"),
//             or the CLAUDE_GAUGE_ADMIN_KEY environment variable on any system

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs"
import { homedir, platform } from "node:os"
import { dirname, join } from "node:path"

const HOME = homedir()
export const CONFIG_PATH = join(process.env.XDG_CONFIG_HOME ?? join(HOME, ".config"), "claude-usage-gauge", "config.json")
export const CACHE_PATH = join(process.env.XDG_CACHE_HOME ?? join(HOME, ".cache"), "claude-usage-gauge", "daily.json")
// The last Pro/Max plan reading Claude Code passed to the status line.
export const PLAN_PATH = join(process.env.XDG_CACHE_HOME ?? join(HOME, ".cache"), "claude-usage-gauge", "plan.json")
// Scriptable's iCloud folder: the iPhone widget reads the summary from here, so the key never leaves your Mac.
export const ICLOUD_PATH = join(HOME, "Library", "Mobile Documents", "iCloud~dk~simonbs~Scriptable", "Documents", "claude-gauge.json")

export const KEYCHAIN = { service: "claude-usage-gauge", account: "admin-key" }

// menu_label: the word before the percentage in the menu bar ("" for just the number).
export const DEFAULTS = { warn_pct: 25, critical_pct: 10, refresh_minutes: 5, credit: null, monthly_budget_usd: null, menu_label: "Claude" }

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return null
  }
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n")
  try {
    chmodSync(path, 0o600)
  } catch {}
}

export const loadConfig = () => ({ ...DEFAULTS, ...(readJson(CONFIG_PATH) ?? {}) })
export const saveConfig = (c) => writeJson(CONFIG_PATH, c)
export const loadCache = () => readJson(CACHE_PATH)
export const saveCache = (c) => writeJson(CACHE_PATH, c)
export const loadPlan = () => readJson(PLAN_PATH)
export const savePlan = (p) => writeJson(PLAN_PATH, p)

export function writeICloud(view) {
  if (!existsSync(dirname(ICLOUD_PATH))) return false
  writeFileSync(ICLOUD_PATH, JSON.stringify({ ...view, written_at: new Date().toISOString() }, null, 2))
  return true
}

/** The Admin API key: environment first, then the macOS Keychain. */
export function readKey() {
  const env = process.env.CLAUDE_GAUGE_ADMIN_KEY ?? process.env.ANTHROPIC_ADMIN_KEY
  if (env?.trim()) return env.trim()
  if (platform() !== "darwin") return null
  try {
    return execFileSync("security", ["find-generic-password", "-s", KEYCHAIN.service, "-a", KEYCHAIN.account, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null
  } catch {
    return null
  }
}

/**
 * Store the key in the macOS Keychain. `security` prompts for it itself (input hidden),
 * so the key never appears in your shell history or the process list.
 */
export function storeKeyInKeychain() {
  execFileSync("security", ["add-generic-password", "-U", "-s", KEYCHAIN.service, "-a", KEYCHAIN.account, "-w"], { stdio: "inherit" })
}
