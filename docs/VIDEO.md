# Recording a short demo (60–90 seconds)

A shot list for a screen recording you can post with the repo. No editing software needed: record each shot separately and post them in order, or stitch them in iMovie / CapCut.

**Tools:** Mac screen recording with **⇧⌘5** (Record Selected Portion). iPhone: **Control Center → Screen Recording**. Use `claude-gauge --demo` for any shot where you'd rather not show real numbers.

**Before you record:** set your terminal font to 16–18 pt, hide desktop clutter, turn on Do Not Disturb.

| # | Shot | Length | What's on screen | Say / caption |
|---|---|---|---|---|
| 1 | The problem | 5 s | A failed job: "credit balance is too low" | "My AI research run died halfway. Out of API credit, and I had no idea it was close." |
| 2 | The idea | 5 s | The hero image (`docs/img/hero.png`) | "So I built a battery icon for my Claude API credit." |
| 3 | Terminal | 10 s | Type `claude-gauge`, the card appears | "One command: what's left, what I spent today, and how many days that lasts." |
| 4 | Claude Code | 10 s | A Claude Code session with the status line at the bottom | "It lives in Claude Code's status line while I work." |
| 5 | Menu bar | 10 s | Click the menu-bar battery; the dropdown opens | "In the Mac menu bar, refreshed every five minutes." |
| 6 | iPhone | 10 s | Swipe to the home screen with the widget | "And on my phone. The key never leaves my Mac." |
| 7 | The honest bit | 10 s | Terminal: the "estimate:" line highlighted | "Anthropic's API reports spend but not your balance, so it estimates: the balance you enter, minus spend since." |
| 8 | Install | 10 s | `git clone …`, `npm link`, `claude-gauge setup` | "Free, about fifteen minutes to set up. Link and guide below." |

**Thumbnail:** `docs/img/hero.png` (1200 × 675, the size LinkedIn uses for link and image posts).
