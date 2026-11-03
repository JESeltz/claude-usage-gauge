// Run with: npm test
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { withStatusLine } from "../src/install.mjs"

describe("status line setting", () => {
  it("adds the gauge and keeps the other settings", () => {
    const r = withStatusLine({ enabledPlugins: { x: true } }, "claude-gauge line")
    assert.equal(r.action, "added")
    assert.deepEqual(r.settings, { enabledPlugins: { x: true }, statusLine: { type: "command", command: "claude-gauge line" } })
  })
  it("works from no settings at all", () => {
    assert.equal(withStatusLine(null, "claude-gauge line").action, "added")
  })
  it("recognizes the gauge, by name or by path", () => {
    assert.equal(withStatusLine({ statusLine: { type: "command", command: "claude-gauge line" } }, "x").action, "already")
    assert.equal(withStatusLine({ statusLine: { type: "command", command: '"/usr/bin/node" "/a/bin/claude-gauge.mjs" line' } }, "x").action, "already")
  })
  it("never replaces someone else's status line", () => {
    const r = withStatusLine({ statusLine: { type: "command", command: "~/.claude/statusline.sh" } }, "claude-gauge line")
    assert.equal(r.action, "other")
    assert.equal(r.existing, "~/.claude/statusline.sh")
    assert.equal(r.settings.statusLine.command, "~/.claude/statusline.sh")
  })
})
