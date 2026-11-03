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
const COLORS = { ok: "#34C759", warn: "#FF9F0A", critical: "#FF3B30" }
const GRAY = new Color("#8E8E93")

async function load() {
  const fm = FileManager.iCloud()
  const path = fm.joinPath(fm.documentsDirectory(), FILE)
  if (!fm.fileExists(path)) return null
  await fm.downloadFileFromiCloud(path)
  return JSON.parse(fm.readString(path))
}

const money = (n) => (typeof n === "number" ? `$${n.toFixed(2)}` : "—")

function text(stack, s, font, color) {
  const t = stack.addText(s)
  t.font = font
  t.textColor = color
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
    text(row, win.short === "5h" ? "5h " : "wk ", Font.semiboldSystemFont(11), GRAY)
    row.addImage(battery(win.left, COLORS[win.level] ?? COLORS.ok, 62, 16)).imageSize = new Size(70, 20)
    row.addSpacer(4)
    text(row, `${win.left}%`, Font.boldSystemFont(14), new Color(COLORS[win.level] ?? COLORS.ok))
    w.addSpacer(4)
  }
}

function widget(v) {
  const w = new ListWidget()
  w.backgroundColor = new Color("#1C1C1E")
  w.setPadding(14, 14, 14, 14)
  text(w, "Claude", Font.semiboldSystemFont(12), GRAY)
  w.addSpacer(6)

  const plan = v?.plan
  const api = v?.api
  if (!plan && !api) {
    text(w, "Run claude-gauge on your Mac (with iCloud Drive on).", Font.systemFont(12), Color.white())
    return w
  }

  if (plan) {
    w.url = "https://claude.ai/settings/usage"
    planRows(w, plan)
    if (api && api.mode === "credit") text(w, `API ≈ ${money(api.remaining)} left`, Font.systemFont(11), Color.white())
  } else {
    w.url = "https://platform.claude.com/settings/billing"
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
  text(w, plan ? `as of ${age}` : `today ${money(api.today)} · ${age}`, Font.systemFont(10), GRAY)

  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
  return w
}

const w = widget(await load())
if (config.runsInWidget) Script.setWidget(w)
else await w.presentSmall()
Script.complete()
