# Install with Claude

Let Claude Code set this up for you. Open Claude Code and paste:

> Install the Claude usage gauge for me: https://github.com/JESeltz/claude-usage-gauge — follow its INSTALL-WITH-CLAUDE.md.

The rest of this file is written for Claude.

---

## Instructions for Claude

You're installing **claude-usage-gauge** for the person you're working with: a battery gauge for their Claude Pro/Max plan limits (from Claude Code's status line) and, optionally, their Anthropic API credit. Work through the steps in order. After each one, check it worked the way the step says, and tell the person what you did in a sentence.

### Ground rules

- **Never ask for, accept or handle an API key.** If the person wants the API credit gauge, they run `claude-gauge setup` themselves in their own terminal window (it stores the key in the macOS Keychain). If they paste a key into the chat anyway, tell them to delete that key in the Anthropic Console and make a new one.
- **Ask before changing their Claude Code settings** (`~/.claude/settings.json`) and before installing any app (SwiftBar). `claude-gauge install` backs up the settings file and never replaces an existing status line; if they already have one, tell them and let them decide.
- **Don't use `sudo`.** If a step fails on permissions, use the fallback the step gives.
- Steps 5–6 are optional and Mac/iPhone only. Offer them; don't push.

### 1. Check Node.js

```bash
node -v
```

Needs v18 or newer. If it's missing or older, tell the person and suggest `brew install node` (Mac, with Homebrew) or the installer from https://nodejs.org. Don't continue without it.

### 2. Get the code

Ask where they keep code; default to `~/claude-usage-gauge`.

```bash
git clone https://github.com/JESeltz/claude-usage-gauge.git ~/claude-usage-gauge
cd ~/claude-usage-gauge
npm test
```

✅ The tests pass (`fail 0`). If `git` is missing, download https://github.com/JESeltz/claude-usage-gauge/archive/refs/heads/main.zip and unzip it instead.

### 3. Install the command

```bash
npm link
claude-gauge --demo
```

✅ The demo prints a "Claude plan" card and a "Claude API" card (sample numbers).

If `npm link` fails (permissions), skip it: everywhere below, use `node ~/claude-usage-gauge/bin/claude-gauge.mjs` in place of `claude-gauge`. The installer handles this for the status line by itself.

### 4. See what the installer will do, then do it

```bash
claude-gauge install --check
```

This changes nothing. Show the person the "Would do" and "Needs you" lists, and ask whether to go ahead. When they say yes:

```bash
claude-gauge install --yes
```

✅ "Status line: added …" (or "already set"). The menu-bar and widget steps may say they need something first; that's steps 5 and 6.

Then verify the status line with a sample of what Claude Code sends it:

```bash
echo '{"rate_limits":{"five_hour":{"used_percentage":25,"resets_at":'$(( $(date +%s) + 7200 ))'},"seven_day":{"used_percentage":19,"resets_at":'$(( $(date +%s) + 300000 ))'}},"cost":{"total_cost_usd":0.5}}' | claude-gauge line
```

✅ A line starting `🔋 5h 75% …`. Then run `rm ~/.cache/claude-usage-gauge/plan.json` so that sample isn't shown as their real usage. Their real numbers appear after Claude's next reply in a new session: tell them to start one and look under the prompt.

### 5. Optional: Mac menu bar

Ask first. Then:

```bash
brew install --cask swiftbar
claude-gauge install --yes
open -a SwiftBar
```

✅ "Menu bar: plugin in …". If SwiftBar opens a window asking for a plugin folder, the person chooses the folder the installer named (in the file picker: ⇧⌘G, type the path, Return, Open). Then "Claude NN%" appears in the menu bar.

### 6. Optional: iPhone or iPad widget

These parts need the person's phone:

1. Install **Scriptable** from the App Store.
2. In iPhone Settings → [their name] → iCloud, make sure Scriptable may use iCloud Drive.
3. Open Scriptable, tap **+**, type anything, tap **Done**. Saving a script creates its iCloud folder.

When they've done that, run `claude-gauge install --yes` again. If it still says it needs Scriptable's folder, wait a minute for iCloud and retry. ✅ "iPhone widget: "Claude Gauge" is in Scriptable."

Then they place it: long-press the home screen → **Edit** → **Add Widget** → **Scriptable** → small → **Add Widget**; long-press the widget → **Edit Widget** → **Script: Claude Gauge**.

### 7. Optional: API credit

Only if they pay for the Anthropic API. They need an Admin API key from https://platform.claude.com/settings/admin-keys (Console organizations only; admins only). Tell them to run this **in their own terminal window, not in the chat**:

```bash
claude-gauge setup
```

### 8. Wrap up

Tell the person, briefly:

- What's set up, and what still needs them (from the installer's "Needs you" list).
- What the numbers mean: `5h 75%` = 75% of the plan's 5-hour limit left; `wk` = the weekly limit; ↻ = when it resets; the menu bar shows the lower of the two.
- Plan numbers refresh as they use Claude Code; the gauge always says how old they are.
- The full guide: https://github.com/JESeltz/claude-usage-gauge/blob/main/docs/GUIDE.md
