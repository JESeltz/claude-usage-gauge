#!/usr/bin/env node
// claude-gauge: a battery gauge for your Anthropic API credit.
//
// Two gauges, either or both:
//   Claude Pro/Max plan  read from Claude Code's status line (no key needed)
//   Claude API credit    read from Anthropic's Admin API (needs an Admin API key)
//
//   claude-gauge                 the card (terminal)
//   claude-gauge line            one line (Claude Code status line, tmux, prompts)
//   claude-gauge swiftbar        macOS menu bar (SwiftBar/xbar plugin output)
//   claude-gauge json            everything, as JSON
//   claude-gauge setup           store your Admin API key and starting balance
//   claude-gauge balance 42.50   set the credit balance you see in the Console (resets the estimate)
//   claude-gauge topup 25        add a top-up to the current estimate
//   claude-gauge budget 100      or: track spend against a monthly budget instead (budget off to clear)
//
// Flags: --refresh (skip the cache), --demo (sample data, no key needed), --no-color

import { createInterface } from "node:readline/promises"
import { platform } from "node:os"
import { fetchSpend, ApiError } from "../src/api.mjs"
import { loadCache, loadConfig, loadPlan, readKey, saveCache, saveConfig, savePlan, storeKeyInKeychain, writeICloud, CONFIG_PATH } from "../src/config.mjs"
import { dayKey, spendOn, startOfUtcDay, startOfUtcMonth, summarize, usd } from "../src/core.mjs"
import { planFromStatusLine, summarizePlan } from "../src/plan.mjs"
import { card, line, nothingYet, swiftbar } from "../src/render.mjs"

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith("--")))
const [cmd = "card", value] = args.filter((a) => !a.startsWith("--"))
if (flags.has("--no-color")) process.env.NO_COLOR = "1"
const DEMO = flags.has("--demo")

/** Sample data for screenshots and trying it out without a key. */
function demoDaily(now) {
  const daily = {}
  for (let i = 0; i < 40; i++) {
    const d = new Date(startOfUtcDay(now).getTime() - i * 86400000)
    daily[dayKey(d)] = i === 0 ? 3.41 : 2 + ((i * 37) % 50) / 10
  }
  return daily
}

/** A sample Pro/Max reading for --demo. */
function demoPlan(now) {
  const t = Math.floor(now.getTime() / 1000)
  return { captured_at: new Date(now.getTime() - 3 * 60000).toISOString(), five_hour: { used_percentage: 38, resets_at: t + 2 * 3600 + 1200 }, seven_day: { used_percentage: 61, resets_at: t + 3 * 86400 } }
}

/** The earliest day any display needs: this month, the last week (burn rate), and the balance date. */
function neededSince(config, now) {
  const dates = [startOfUtcMonth(now), new Date(startOfUtcDay(now).getTime() - 8 * 86400000)]
  if (config.credit?.as_of) dates.push(startOfUtcDay(config.credit.as_of))
  return new Date(Math.min(...dates.map((d) => d.getTime())))
}

/** Spend data, from the cache when it's fresh enough, else from the API. */
async function getSpend(config, now, { refresh = false } = {}) {
  if (DEMO) return { daily: demoDaily(now), source: "demo data", fetched_at: now.toISOString(), refreshedAt: now.toISOString(), todayKnown: true }
  const since = neededSince(config, now)
  const creditFrom = config.credit?.as_of ?? null
  const cache = loadCache()
  const fresh =
    cache &&
    Date.now() - Date.parse(cache.fetched_at) < config.refresh_minutes * 60000 &&
    cache.since <= since.toISOString() &&
    (cache.creditFrom ?? null) === creditFrom
  if (fresh && !refresh) return cache
  const key = readKey()
  if (!key) {
    if (cache) return { ...cache, stale: true }
    throw new Error("No Admin API key found. Run `claude-gauge setup`.")
  }
  try {
    const r = await fetchSpend(key, since, creditFrom, now)
    const next = { ...r, since: since.toISOString(), creditFrom, fetched_at: new Date().toISOString() }
    saveCache(next)
    return next
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403))
      throw new Error(`Anthropic rejected the key (${e.status}). It must be an Admin API key (sk-ant-admin01-...) from an organization; see the guide.`)
    if (cache) return { ...cache, stale: true }
    throw e
  }
}

/** Claude Code pipes session JSON to status line commands; read it if present (never wait long). */
async function readStdinJson() {
  if (process.stdin.isTTY) return null
  return new Promise((resolve) => {
    let buf = ""
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      process.stdin.destroy() // otherwise an open, silent stdin keeps the process alive
      try {
        resolve(JSON.parse(buf))
      } catch {
        resolve(null)
      }
    }
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (c) => (buf += c))
    process.stdin.on("end", done)
    setTimeout(done, 300).unref()
  })
}

async function setBalance(config, amount, now) {
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Give the balance in dollars, e.g. `claude-gauge balance 42.50`.")
  // What's already been spent today is part of the balance you're looking at, so don't count it again.
  // Used only if the gauge falls back to whole days (cost report): that day's spend so far.
  let baseline = 0
  try {
    const { daily, todayKnown } = await getSpend(config, now, { refresh: true })
    if (todayKnown) baseline = spendOn(daily, now)
  } catch (e) {
    console.error(`(Couldn't read today's spend: ${e.message})`)
  }
  config.credit = { balance_usd: amount, as_of: now.toISOString(), baseline_usd: baseline }
  saveConfig(config)
  return config
}

async function setup() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  console.log("\nclaude-gauge setup\n")
  console.log("You need an Admin API key (starts with sk-ant-admin01-) from https://platform.claude.com/settings/admin-keys")
  console.log("Only organization admins can create one, and individual accounts need to set up an organization first.\n")
  if (platform() === "darwin") {
    await rl.question("Press Enter, then paste the key twice when macOS asks (it's stored in your Keychain, not in a file). ")
    rl.pause()
    storeKeyInKeychain()
    rl.resume()
  } else {
    console.log("Set it in your shell profile:  export CLAUDE_GAUGE_ADMIN_KEY=sk-ant-admin01-...")
    await rl.question("Press Enter once it's set in this shell. ")
  }
  if (!readKey()) {
    rl.close()
    throw new Error("Still no key found; setup stopped.")
  }
  const config = loadConfig()
  const now = new Date()
  process.stdout.write("Checking the key with Anthropic... ")
  const { source } = await getSpend(config, now, { refresh: true })
  console.log(`ok (${source}).\n`)
  console.log("Anthropic doesn't publish your remaining credit through the API, so the gauge estimates it:")
  console.log("the balance you enter now, minus what the Cost API reports you spend from here on.\n")
  const bal = await rl.question("Your current credit balance from https://platform.claude.com/settings/billing (e.g. 42.50, or Enter to skip): ")
  if (bal.trim()) await setBalance(config, Number.parseFloat(bal.replace(/[$,]/g, "")), now)
  else {
    const budget = await rl.question("No prepaid balance? Enter a monthly budget to track instead (or Enter to skip): ")
    if (budget.trim()) {
      config.monthly_budget_usd = Number.parseFloat(budget.replace(/[$,]/g, ""))
      saveConfig(config)
    }
  }
  rl.close()
  console.log(`\nSaved to ${CONFIG_PATH}. Try: claude-gauge\n`)
}

async function main() {
  const now = new Date()
  let config = loadConfig()

  if (cmd === "setup") return setup()
  if (cmd === "balance") {
    config = await setBalance(config, Number.parseFloat(String(value).replace(/[$,]/g, "")), now)
    console.log(`Balance set to ${usd(config.credit.balance_usd)} as of now.`)
    return
  }
  if (cmd === "topup") {
    const add = Number.parseFloat(String(value).replace(/[$,]/g, ""))
    const data = await getSpend(config, now, { refresh: true })
    const s = summarize(data.daily, config, now, data)
    if (s.mode !== "credit") throw new Error("Set a balance first: `claude-gauge balance <usd>`.")
    config = await setBalance(config, s.remaining + add, now)
    console.log(`Added ${usd(add)}. New estimate: ${usd(config.credit.balance_usd)}.`)
    return
  }
  if (cmd === "budget") {
    config.monthly_budget_usd = value === "off" ? null : Number.parseFloat(String(value).replace(/[$,]/g, ""))
    saveConfig(config)
    console.log(config.monthly_budget_usd ? `Monthly budget: ${usd(config.monthly_budget_usd)}.` : "Monthly budget cleared.")
    return
  }

  // Claude Code hands the status line its session, including Pro/Max plan usage: keep the latest.
  const session = cmd === "line" ? await readStdinJson() : null
  const reading = planFromStatusLine(session, now)
  if (reading && !DEMO) savePlan(reading)
  const plan = summarizePlan(DEMO ? demoPlan(now) : reading ?? loadPlan(), now, config.warn_pct, config.critical_pct)

  // The API gauge only runs once it's set up (a key, a balance or a budget), so plan-only users never need a key.
  // Demo: a $50 balance entered six days ago, so the battery shows.
  if (DEMO) config = { ...config, monthly_budget_usd: null, credit: { balance_usd: 50, as_of: new Date(now.getTime() - 6 * 86400000).toISOString(), baseline_usd: 1.2 } }
  const apiWanted = DEMO || !!config.credit || !!config.monthly_budget_usd || !!readKey()
  let api = null
  let apiError = null
  if (apiWanted) {
    try {
      const data = await getSpend(config, now, { refresh: flags.has("--refresh") })
      api = summarize(data.daily, config, now, data)
    } catch (e) {
      apiError = e
    }
  }
  if (apiError && !plan) {
    // A status line goes blank on a non-zero exit, so say what's wrong instead.
    if (cmd === "line") return console.log(`claude-gauge: ${apiError.message}`)
    if (cmd === "swiftbar") return console.log(`⚠︎ | color=#FF9F0A\n---\n${apiError.message}`)
    throw apiError
  }

  const view = { api, plan }
  if (!DEMO && (api || plan)) writeICloud(view)

  if (cmd === "json") console.log(JSON.stringify(view, null, 2))
  else if (cmd === "line") console.log(line(view, session?.cost?.total_cost_usd))
  else if (cmd === "swiftbar") console.log(swiftbar(view, config.menu_label))
  else console.log(api || plan ? card(view) : nothingYet())
  if (apiError && cmd !== "line" && cmd !== "swiftbar") console.error(`(API credit unavailable: ${apiError.message})`)
}

main().catch((e) => {
  console.error(`claude-gauge: ${e.message}`)
  process.exit(1)
})
