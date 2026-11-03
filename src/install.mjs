// `claude-gauge install`: the mechanical setup, safe to run again.
//   1. Claude Code status line   (~/.claude/settings.json; backed up first, never overwrites another status line)
//   2. Mac menu bar              (copies the SwiftBar plugin into SwiftBar's plugin folder)
//   3. iPhone widget             (copies the Scriptable script into Scriptable's iCloud folder)
// Things only a person can do (install apps, place the widget, create an API key) are listed at the end.

import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs"
import { homedir, platform } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HOME = homedir()
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export const CLAUDE_SETTINGS = join(process.env.CLAUDE_CONFIG_DIR ?? join(HOME, ".claude"), "settings.json")
const SCRIPTABLE_DIR = join(HOME, "Library", "Mobile Documents", "iCloud~dk~simonbs~Scriptable", "Documents")
const SWIFTBAR_APP = "/Applications/SwiftBar.app"
const DEFAULT_PLUGIN_DIR = join(HOME, "SwiftBar")

/**
 * Pure: settings with the gauge as the status line.
 *   "added"    there was no status line; it's now the gauge
 *   "already"  the gauge is already the status line
 *   "other"    someone else's status line is there; left alone
 */
export function withStatusLine(settings, command) {
  const current = settings?.statusLine
  if (current && typeof current.command === "string" && /claude-gauge(\.mjs)?\b.*\bline\b/.test(current.command)) return { settings, action: "already" }
  if (current) return { settings, action: "other", existing: current.command ?? JSON.stringify(current) }
  return { settings: { ...(settings ?? {}), statusLine: { type: "command", command } }, action: "added" }
}

/** The command Claude Code should run: `claude-gauge line` if it's on PATH, else this checkout by absolute path. */
export function statusCommand() {
  try {
    execFileSync("/bin/sh", ["-c", "command -v claude-gauge"], { stdio: "ignore" })
    return "claude-gauge line"
  } catch {
    return `"${process.execPath}" "${join(REPO, "bin", "claude-gauge.mjs")}" line`
  }
}

function swiftbarPluginDir() {
  try {
    return execFileSync("defaults", ["read", "com.ameba.SwiftBar", "PluginDirectory"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null
  } catch {
    return null
  }
}

const same = (a, b) => existsSync(b) && readFileSync(a, "utf8") === readFileSync(b, "utf8")

/**
 * Run the steps. `ask(question)` returns true to go ahead (the CLI asks the person, or says yes for --yes).
 * Returns { done: [], skipped: [], todo: [] } lines for the summary.
 */
export async function install({ ask, dryRun = false, only = null }) {
  const out = { done: [], skipped: [], todo: [] }
  const want = (step) => !only || only.includes(step)
  const mac = platform() === "darwin"

  // 1. Claude Code status line
  if (want("statusline")) {
    let settings = {}
    let raw = null
    if (existsSync(CLAUDE_SETTINGS)) {
      raw = readFileSync(CLAUDE_SETTINGS, "utf8")
      try {
        settings = JSON.parse(raw)
      } catch {
        out.todo.push(`Status line: ${CLAUDE_SETTINGS} isn't valid JSON, so it was left alone. Fix it, then run install again.`)
        settings = null
      }
    }
    if (settings) {
      const command = statusCommand()
      const r = withStatusLine(settings, command)
      if (r.action === "already") out.skipped.push("Status line: already set to the gauge.")
      else if (r.action === "other")
        out.todo.push(`Status line: you already have one (${r.existing}), so it was left alone. To use the gauge instead, set "statusLine.command" to: ${command}`)
      else if (dryRun) out.done.push(`Status line: would add "${command}" to ${CLAUDE_SETTINGS}.`)
      else if (await ask(`Add the gauge as your Claude Code status line (${CLAUDE_SETTINGS})?`)) {
        mkdirSync(dirname(CLAUDE_SETTINGS), { recursive: true })
        if (raw !== null) writeFileSync(`${CLAUDE_SETTINGS}.bak-claude-gauge`, raw)
        writeFileSync(CLAUDE_SETTINGS, JSON.stringify(r.settings, null, 2) + "\n")
        out.done.push(`Status line: added "${command}"${raw !== null ? ` (backup: ${CLAUDE_SETTINGS}.bak-claude-gauge)` : ""}. Start a new Claude Code session and send a message.`)
      } else out.skipped.push("Status line: skipped.")
    }
  }

  // 2. Mac menu bar (SwiftBar)
  if (want("menubar")) {
    if (!mac) out.skipped.push("Menu bar: macOS only.")
    else if (!existsSync(SWIFTBAR_APP)) out.todo.push("Menu bar: install SwiftBar (`brew install --cask swiftbar`, or swiftbar.app), then run install again.")
    else {
      let dir = swiftbarPluginDir()
      const preset = !dir
      dir = dir ?? DEFAULT_PLUGIN_DIR
      const src = join(REPO, "widgets", "claude-gauge.5m.sh")
      const dest = join(dir, "claude-gauge.5m.sh")
      if (same(src, dest)) out.skipped.push(`Menu bar: plugin already in ${dir}.`)
      else if (dryRun) out.done.push(`Menu bar: would copy the plugin to ${dir}${preset ? " and set it as SwiftBar's plugin folder" : ""}.`)
      else if (await ask(`Put the menu-bar plugin in ${dir}${preset ? " (and make that SwiftBar's plugin folder)" : ""}?`)) {
        mkdirSync(dir, { recursive: true })
        copyFileSync(src, dest)
        chmodSync(dest, 0o755)
        if (preset) execFileSync("defaults", ["write", "com.ameba.SwiftBar", "PluginDirectory", dir])
        try {
          execFileSync("open", ["-g", "swiftbar://refreshallplugins"], { stdio: "ignore" })
        } catch {}
        out.done.push(`Menu bar: plugin in ${dir}.`)
        if (preset) out.todo.push(`Menu bar: open SwiftBar. If it asks for a plugin folder, choose ${dir} (⇧⌘G, then type it).`)
      } else out.skipped.push("Menu bar: skipped.")
    }
  }

  // 3. iPhone widget (Scriptable via iCloud)
  if (want("widget")) {
    if (!mac) out.skipped.push("iPhone widget: needs a Mac with iCloud Drive.")
    else if (!existsSync(SCRIPTABLE_DIR))
      out.todo.push("iPhone widget: install Scriptable on your iPhone, allow it iCloud Drive, open it, tap +, type anything, tap Done. Then run install again.")
    else {
      const dest = join(SCRIPTABLE_DIR, "Claude Gauge.js")
      const header = "// Variables used by Scriptable.\n// These must be at the very top of the file. Do not edit.\n// icon-color: green; icon-glyph: battery-half;\n"
      const body = header + readFileSync(join(REPO, "widgets", "claude-gauge-widget.js"), "utf8")
      if (existsSync(dest) && readFileSync(dest, "utf8") === body) out.skipped.push("iPhone widget: script already in Scriptable.")
      else if (dryRun) out.done.push("iPhone widget: would add the \"Claude Gauge\" script to Scriptable.")
      else if (await ask("Add the \"Claude Gauge\" script to Scriptable (via iCloud)?")) {
        writeFileSync(dest, body)
        out.done.push("iPhone widget: \"Claude Gauge\" is in Scriptable.")
        out.todo.push("iPhone widget: long-press your home screen > Edit > Add Widget > Scriptable (small) > then long-press it > Edit Widget > Script: Claude Gauge.")
      } else out.skipped.push("iPhone widget: skipped.")
    }
  }

  out.todo.push("API credit (optional): in your own terminal, run `claude-gauge setup`. Never paste an API key into a chat.")
  return out
}
