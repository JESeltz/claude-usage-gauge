// Claude usage battery: an iPhone/iPad home-screen widget for the free Scriptable app.
//
// It reads claude-gauge.json, which claude-gauge on your Mac writes to Scriptable's iCloud
// folder every time it runs (your Claude Code status line, or the menu-bar plugin every
// 5 minutes). It shows your Claude Pro/Max plan usage, your API credit, or both. Keys stay
// on your Mac; the phone only ever sees the summary numbers.
//
// Install: Scriptable > + > paste this file > name it "Claude Gauge". Then long-press the
// home screen > + > Scriptable > small widget > Edit Widget > Script: Claude Gauge.

const FILE = "claude-gauge.json"
// Optional: your wallpaper behind the widget, made on your Mac with `claude-gauge widget-background`.
const BACKGROUND = "claude-gauge-background.png"
const COLORS = { ok: "#34C759", warn: "#FF9F0A", critical: "#FF3B30" }
// (The "Claude" title uses Claude's orange, #D97757.)
let GRAY = new Color("#8E8E93")
let SEE_THROUGH = false

async function load() {
  const fm = FileManager.iCloud()
  const path = fm.joinPath(fm.documentsDirectory(), FILE)
  if (!fm.fileExists(path)) return null
  await fm.downloadFileFromiCloud(path)
  return JSON.parse(fm.readString(path))
}

async function loadBackground() {
  const fm = FileManager.iCloud()
  const path = fm.joinPath(fm.documentsDirectory(), BACKGROUND)
  if (!fm.fileExists(path)) return null
  await fm.downloadFileFromiCloud(path)
  return fm.readImage(path)
}

const money = (n) => (typeof n === "number" ? `$${n.toFixed(2)}` : "—")

function text(stack, s, font, color) {
  const t = stack.addText(s)
  t.font = font
  t.textColor = color
  if (SEE_THROUGH) {
    // A soft shadow keeps text readable over bright parts of the wallpaper.
    t.shadowColor = new Color("#000000", 0.7)
    t.shadowRadius = 3
    t.shadowOffset = new Point(0, 1)
  }
  return t
}

/** A horizontal battery: shell, nub, and the charge in the level's color. */
function battery(pct, color, w = 110, h = 30) {
  const dc = new DrawContext()
  dc.size = new Size(w + 8, h + 4)
  dc.opaque = false
  dc.respectScreenScale = true
  const shell = new Path()
  shell.addRoundedRect(new Rect(2, 2, w, h), h / 4, h / 4)
  dc.addPath(shell)
  dc.setStrokeColor(GRAY)
  dc.setLineWidth(2.5)
  dc.strokePath()
  const nub = new Path()
  nub.addRoundedRect(new Rect(w + 3, h / 2 - 4, 4, 10), 2, 2)
  dc.addPath(nub)
  dc.setFillColor(GRAY)
  dc.fillPath()
  const fill = Math.max(0, Math.round(((w - 8) * (pct ?? 0)) / 100))
  if (fill > 0) {
    const p = new Path()
    p.addRoundedRect(new Rect(6, 6, fill, h - 8), h / 6, h / 6)
    dc.addPath(p)
    dc.setFillColor(new Color(color))
    dc.fillPath()
  }
  return dc.getImage()
}

function planRows(w, plan) {
  for (const win of plan.windows) {
    const row = w.addStack()
    row.centerAlignContent()
    text(row, `${win.short} `, Font.semiboldSystemFont(11), GRAY)
    row.addImage(battery(win.left, COLORS[win.level] ?? COLORS.ok, 62, 16)).imageSize = new Size(70, 20)
    row.addSpacer(4)
    text(row, `${win.left}%`, Font.boldSystemFont(14), new Color(COLORS[win.level] ?? COLORS.ok))
    w.addSpacer(4)
  }
}

function widget(v, bg) {
  const w = new ListWidget()
  if (bg) {
    SEE_THROUGH = true
    GRAY = new Color("#FFFFFF", 0.9)
    w.backgroundImage = bg
  } else w.backgroundColor = new Color("#1C1C1E")
  w.setPadding(14, 14, 14, 14)
  text(w, "Claude", Font.semiboldSystemFont(12), new Color("#D97757")) // Claude's orange
  w.addSpacer(6)

  const plan = v?.plan
  const api = v?.api
  if (!plan && !api) {
    text(w, "Run claude-gauge on your Mac (with iCloud Drive on).", Font.systemFont(12), Color.white())
    return w
  }

  // Tapping the widget runs this script in Scriptable, which reloads the widget with the latest numbers.
  w.url = `scriptable:///run/${encodeURIComponent(Script.name())}`
  if (plan) {
    planRows(w, plan)
    // Room for one more line under two bars.
    if (plan.windows.length <= 2 && api && api.mode === "credit") text(w, `API ≈ ${money(api.remaining)} left`, Font.systemFont(11), Color.white())
  } else {
    const color = COLORS[api.level] ?? COLORS.ok
    if (api.pct !== null && api.pct !== undefined) {
      w.addImage(battery(api.pct, color)).imageSize = new Size(118, 34)
      w.addSpacer(6)
      text(w, `${api.pct}%`, Font.boldSystemFont(22), new Color(color))
      text(w, api.mode === "credit" ? `≈ ${money(api.remaining)} left` : `${money(api.remaining)} of budget`, Font.systemFont(12), Color.white())
    } else {
      text(w, money(api.month), Font.boldSystemFont(22), Color.white())
      text(w, "this month", Font.systemFont(12), Color.white())
    }
  }

  w.addSpacer()
  // How old the numbers are: the plan reading's age, or when the Mac last wrote the file.
  const ageMin = plan ? plan.age_min + Math.round((Date.now() - Date.parse(v.written_at)) / 60000) : v.written_at ? Math.round((Date.now() - Date.parse(v.written_at)) / 60000) : null
  const age = ageMin === null ? "" : ageMin < 2 ? "just now" : ageMin < 90 ? `${ageMin}m ago` : `${Math.round(ageMin / 60)}h ago`
  text(w, `${plan ? `as of ${age}` : `today ${money(api.today)} · ${age}`} · tap to refresh`, Font.systemFont(10), GRAY)

  // Ask iOS to refresh in 5 minutes. iOS decides the real schedule (often every 15–30 minutes).
  w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000)
  return w
}

const w = widget(await load(), await loadBackground())
if (config.runsInWidget) Script.setWidget(w)
// Run in the app (including from a tap on the widget): show a preview. Running the script also
// makes Scriptable reload its home-screen widgets with the fresh numbers.
else await w.presentSmall()
Script.complete()
