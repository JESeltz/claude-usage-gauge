# Recording a short demo (60–90 seconds)

A shot list for a screen recording to post with the repo, aimed at Claude Pro/Max users. No editing software needed: record each shot separately and post them in order, or stitch them in iMovie or CapCut.

**Tools:** Mac screen recording with **⇧⌘5** (Record Selected Portion). iPhone: **Control Center → Screen Recording**.

**Before you record:**
- Terminal font at 16–18 pt, desktop tidied, Do Not Disturb on.
- A plain iPhone wallpaper, so the widget is the only thing to look at.
- Use Claude Code for a few minutes first, so the plan numbers are fresh ("just now").
- Any shot where you'd rather not show real numbers: `claude-gauge --demo`.

| # | Shot | Length | What's on screen | Say / caption |
|---|---|---|---|---|
| 1 | The problem | 6 s | Claude Code mid-task, or the "you've reached your limit" message | "You're deep in a Claude session, and then you hit your limit." |
| 2 | The idea | 4 s | The hero image (`docs/img/hero.png`) | "So I built a battery icon for my Claude Max plan." |
| 3 | Claude Code | 12 s | A Claude Code session; zoom on the status line | "Right under the prompt: 75% of my 5-hour limit left, resetting at 4:50. 81% of my weekly limit left." |
| 4 | Menu bar | 10 s | Click **Claude 75%** in the menu bar; the dropdown opens | "In the menu bar, it shows the lower of the two, because that's the one that stops me first." |
| 5 | iPhone | 10 s | Swipe to the home-screen widget | "And on my phone, so I can check before I sit down to work." |
| 6 | Terminal | 8 s | Type `claude-gauge`; the card appears | "One command for the full picture." |
| 7 | Setup | 12 s | `npm link`, then the `statusLine` line in `settings.json` | "If you're on Pro or Max and use Claude Code: one install command, one settings line. No API key." |
| 8 | Optional: API | 8 s | The Claude API card | "Pay for the API too? It estimates your credit and how many days it'll last." |
| 9 | Close | 5 s | The GitHub page | "Free and open source. Link below." |

**Captions to keep it honest** (on screen or in the post):
- Plan numbers come from Claude Code and refresh as you use it. The gauge shows how old they are.
- API credit is an estimate: Anthropic doesn't publish your balance, so it's the balance you enter minus spend since.

**Thumbnail:** `docs/img/hero.png` (1200 × 675, the size LinkedIn uses).
