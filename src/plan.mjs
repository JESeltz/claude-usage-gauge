// Claude Pro/Max plan usage. Pure functions (no files, no network).
//
// Claude Code passes subscription limits to status line commands on stdin:
//   rate_limits.five_hour.used_percentage   0–100, the 5-hour window
//   rate_limits.seven_day.used_percentage   0–100, the weekly window
//   rate_limits.*.resets_at                 Unix seconds when that window resets
// They appear for Pro, Max and Ultra subscribers after the first response in a session.
// There's no other documented way to read them, so the status line saves each reading
// and every other display (card, menu bar, phone) shows the last one, with its age.
// Docs: https://code.claude.com/docs/en/statusline

import { level } from "./core.mjs"

const WINDOWS = [
  { key: "five_hour", label: "5-hour", short: "5h" },
  { key: "seven_day", label: "Week", short: "wk" },
]

/** The plan reading from Claude Code's status line input, or null if it has none. */
export function planFromStatusLine(input, now = new Date()) {
  const rl = input?.rate_limits
  if (!rl || typeof rl !== "object") return null
  const snap = { captured_at: new Date(now).toISOString() }
  for (const w of WINDOWS) {
    const x = rl[w.key]
    if (x && Number.isFinite(x.used_percentage)) snap[w.key] = { used_percentage: x.used_percentage, resets_at: Number.isFinite(x.resets_at) ? x.resets_at : null }
  }
  return snap.five_hour || snap.seven_day ? snap : null
}

/**
 * What to show for each window, as a battery (percent LEFT). A window whose reset time has
 * passed since the reading is shown as reset (100% left), since that's what it is now.
 */
export function summarizePlan(snap, now = new Date(), warnPct = 25, criticalPct = 10) {
  if (!snap) return null
  const t = new Date(now).getTime()
  const windows = []
  for (const w of WINDOWS) {
    const x = snap[w.key]
    if (!x) continue
    const reset = x.resets_at !== null && x.resets_at * 1000 <= t
    const used = reset ? 0 : Math.max(0, Math.min(100, x.used_percentage))
    const left = Math.round(100 - used)
    windows.push({ key: w.key, label: w.label, short: w.short, used: Math.round(used), left, level: level(left, warnPct, criticalPct), resets_at: reset ? null : x.resets_at, reset })
  }
  if (windows.length === 0) return null
  const ageMin = Math.max(0, Math.round((t - Date.parse(snap.captured_at)) / 60000))
  // The battery is the tighter of the two windows: that's the one that stops you.
  const tightest = windows.reduce((a, b) => (b.left < a.left ? b : a))
  return { windows, tightest, captured_at: snap.captured_at, age_min: ageMin }
}

/** "3:40 PM" when it's within a day, else "Tue 9 AM". */
export function resetLabel(resetsAt, now = new Date()) {
  if (!resetsAt) return null
  const d = new Date(resetsAt * 1000)
  const soon = d.getTime() - new Date(now).getTime() < 86400000
  return soon ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : d.toLocaleString(undefined, { weekday: "short", hour: "numeric" })
}

/** "just now", "12 min ago", "3 h ago". */
export function ageLabel(min) {
  if (min < 2) return "just now"
  if (min < 90) return `${min} min ago`
  return `${Math.round(min / 60)} h ago`
}
