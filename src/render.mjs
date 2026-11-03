// The faces of the gauge. Each takes { api, plan } and returns text:
//   api   core.summarize() result, or null (no API credit configured)
//   plan  plan.summarizePlan() result, or null (no Pro/Max reading yet)

import { bar, usd } from "./core.mjs"
import { ageLabel, resetLabel } from "./plan.mjs"

const useColor = () => !process.env.NO_COLOR && process.env.CLAUDE_GAUGE_COLOR !== "0"
const ANSI = { ok: "\x1b[32m", warn: "\x1b[33m", critical: "\x1b[31m", dim: "\x1b[2m", bold: "\x1b[1m", reset: "\x1b[0m" }
const paint = (code, s) => (useColor() ? `${code}${s}${ANSI.reset}` : s)
const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, "")

const HEX = { ok: "#34C759", warn: "#FF9F0A", critical: "#FF3B30" }
const worst = (...levels) => (levels.includes("critical") ? "critical" : levels.includes("warn") ? "warn" : "ok")

function apiHeadline(s) {
  if (s.mode === "credit") return `${s.pct}%  ≈ ${usd(s.remaining)} left`
  if (s.mode === "budget") return `${s.pct}%  ${usd(s.remaining)} of ${usd(s.of)} budget left`
  return `${usd(s.month)} this month`
}

function runway(s) {
  if (s.days_left === null) return null
  const d = Math.floor(s.days_left)
  return s.days_left < 1 ? "less than a day at this pace" : `about ${d} day${d === 1 ? "" : "s"} at this pace`
}

function when(iso) {
  if (!iso) return "never"
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

const resets = (w) => (w.reset ? "reset" : w.resets_at ? `resets ${resetLabel(w.resets_at)}` : "")

function box(title, lines) {
  const width = Math.max(title.length + 4, ...lines.map((l) => plain(l).length)) + 2
  const top = `╭─ ${title} ${"─".repeat(Math.max(0, width - title.length - 3))}╮`
  const body = lines.map((l) => `│ ${l}${" ".repeat(width - 1 - plain(l).length)}│`)
  return [top, ...body, `╰${"─".repeat(width)}╯`].join("\n")
}

/** The terminal card(s). */
export function card({ api, plan }) {
  const out = []
  if (plan) {
    const lines = plan.windows.map((w) => `${w.label.padEnd(6)} ${paint(ANSI[w.level], bar(w.left, 20))}  ${paint(ANSI.bold, `${w.left}% left`)}  ${paint(ANSI.dim, resets(w))}`)
    lines.push(paint(ANSI.dim, `from Claude Code · ${ageLabel(plan.age_min)}`))
    out.push(box("Claude plan", lines))
  }
  if (api) {
    const lines = [
      api.pct === null ? apiHeadline(api) : `${paint(ANSI[api.level], bar(api.pct, 20))}  ${paint(ANSI.bold, apiHeadline(api))}`,
      `today ${usd(api.today)} · this month ${usd(api.month)}${api.burn !== null ? ` · ~${usd(api.burn)}/day` : ""}`,
    ]
    const r = runway(api)
    if (r) lines.push(r)
    if (api.mode === "credit") lines.push(paint(ANSI.dim, `estimate: balance ${usd(api.of)} entered ${when(api.credit_set_at)}, minus spend since`))
    if (api.mode === "spend") lines.push(paint(ANSI.dim, "tip: `claude-gauge balance <usd>` turns this into a battery"))
    lines.push(paint(ANSI.dim, `data: ${api.source ?? "—"}${api.data_through ? ` · through ${when(api.data_through)}` : ""}${api.stale ? " · OFFLINE, showing last known" : ""}`))
    out.push(box("Claude API", lines))
  }
  if (out.length === 0) return nothingYet()
  return out.join("\n")
}

export function nothingYet() {
  return [
    "Nothing to show yet.",
    "  Claude Pro/Max: add `claude-gauge line` as your Claude Code status line; your plan usage appears after the next reply.",
    "  API credit:     run `claude-gauge setup` with an Admin API key.",
  ].join("\n")
}

/** One line: Claude Code's status line, tmux, a shell prompt. */
export function line({ api, plan }, session) {
  const parts = []
  const levels = [plan?.tightest.level, api?.pct !== null && api?.pct !== undefined ? api.level : null].filter(Boolean)
  const icon = worst(...levels) === "ok" ? "🔋" : "🪫"
  if (plan) {
    parts.push(
      plan.windows
        .map((w) => paint(ANSI[w.level], `${w.short} ${w.left}% ${bar(w.left, 4)}`) + (w.reset ? "" : w.resets_at ? paint(ANSI.dim, ` ↻${resetLabel(w.resets_at)}`) : ""))
        .join(" · "),
    )
  }
  if (api) {
    if (api.mode === "credit") parts.push(paint(ANSI[api.level], `API ≈${usd(api.remaining)}${plan ? "" : ` (${api.pct}%)`}`))
    else if (api.mode === "budget") parts.push(paint(ANSI[api.level], `API ${usd(api.remaining)} of budget`))
    if (!plan) parts.push(`today ${usd(api.today)}`)
    if (api.stale) parts.push(paint(ANSI.dim, "offline"))
  }
  if (Number.isFinite(session)) parts.push(paint(ANSI.dim, `session ${usd(session)}`))
  if (parts.length === 0) return "claude-gauge: plan usage appears after Claude's first reply · API credit: run `claude-gauge setup`"
  return `${icon} ${parts.join(" · ")}`
}

const SF = (pct) => (pct >= 88 ? "battery.100" : pct >= 63 ? "battery.75" : pct >= 38 ? "battery.50" : pct >= 13 ? "battery.25" : "battery.0")

/** SwiftBar / xbar menu-bar plugin output: title line, then the dropdown. */
export function swiftbar({ api, plan }, label = "Claude") {
  // The menu-bar number is the plan's tighter window when there's a plan, else the API battery.
  const pct = plan ? plan.tightest.left : api?.pct ?? null
  const lvl = worst(plan?.tightest.level ?? "ok", api && api.pct !== null ? api.level : "ok")
  const value = pct !== null ? `${pct}%` : api ? usd(api.month) : "—"
  const title = label ? `${label} ${value}` : value
  const out = [`${title} | sfimage=${pct !== null ? SF(pct) : "dollarsign.circle"} color=${HEX[lvl]}`, "---"]
  if (plan) {
    out.push("Claude plan | size=11 color=gray")
    for (const w of plan.windows) out.push(`${w.label}: ${w.left}% left${w.reset ? " (reset)" : w.resets_at ? ` · resets ${resetLabel(w.resets_at)}` : ""} | color=${HEX[w.level]}`)
    out.push(`From Claude Code, ${ageLabel(plan.age_min)} | color=gray`)
  }
  if (api) {
    if (plan) out.push("---")
    out.push("Claude API | size=11 color=gray", apiHeadline(api), `Today ${usd(api.today)} · This month ${usd(api.month)}`)
    if (api.burn !== null) out.push(`About ${usd(api.burn)}/day${runway(api) ? ` · ${runway(api)}` : ""}`)
    if (api.mode === "credit") out.push(`Estimate: ${usd(api.of)} entered ${when(api.credit_set_at)}, minus spend since | color=gray`)
    out.push(`Data: ${api.source ?? "—"}${api.data_through ? ` · through ${when(api.data_through)}` : ""}${api.stale ? " (offline)" : ""} | color=gray`)
  }
  if (!plan && !api) out.push("Nothing yet: see the guide | color=gray")
  out.push("---", "Claude usage settings | href=https://claude.ai/settings/usage")
  if (api) out.push("Anthropic API billing | href=https://platform.claude.com/settings/billing")
  out.push("Refresh | refresh=true")
  return out.join("\n")
}
