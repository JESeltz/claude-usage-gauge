// A "transparent" iPhone widget: its background is the exact piece of your wallpaper behind it.
//
//   claude-gauge widget-background <empty-page.png> <with-widget.png>
//
// empty-page.png  a screenshot of an empty home-screen page (long-press > swipe to an empty page)
// with-widget.png a screenshot of the page with the Claude Gauge widget on it, before the change
//                 (the widget's dark card shows exactly where it sits)
// The crop is saved next to the widget script in Scriptable's iCloud folder.

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { inflateSync } from "node:zlib"

/** Minimal PNG reader (8- or 16-bit RGB/RGBA, non-interlaced: what iPhone screenshots are). */
export function readPng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG")
  let off = 8
  let width, height, depth, colorType, interlace
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString("ascii", off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === "IHDR") {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      depth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === "IDAT") idat.push(data)
    else if (type === "IEND") break
    off += 12 + len
  }
  const channels = { 2: 3, 6: 4 }[colorType]
  if (!channels || (depth !== 8 && depth !== 16) || interlace) throw new Error("unsupported PNG (expected an iPhone screenshot)")
  const bpp = channels * (depth / 8)
  const stride = width * bpp
  const raw = inflateSync(Buffer.concat(idat))
  const out = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const cur = out.subarray(y * stride, (y + 1) * stride)
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0
      const b = prev ? prev[i] : 0
      const c = prev && i >= bpp ? prev[i - bpp] : 0
      let v = line[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      cur[i] = v & 0xff
    }
  }
  const step = depth / 8
  // RGB at (x, y), 0–255 (the high byte for 16-bit).
  const rgb = (x, y) => {
    const i = y * stride + x * bpp
    return [out[i], out[i + step], out[i + 2 * step]]
  }
  return { width, height, rgb }
}

/**
 * Pure: the widget's box in a screenshot, found from its solid dark card (#1C1C1E): the tallest
 * block of consecutive rows that each hold a long run of that color, at the same left edge.
 */
export function findWidgetBox(img, isCard = ([r, g, b]) => Math.abs(r - 28) <= 4 && Math.abs(g - 28) <= 4 && Math.abs(b - 30) <= 4) {
  const runs = []
  for (let y = 0; y < img.height; y++) {
    let best = null
    let start = -1
    for (let x = 0; x <= img.width; x++) {
      const on = x < img.width && isCard(img.rgb(x, y))
      if (on && start < 0) start = x
      if (!on && start >= 0) {
        if (!best || x - start > best[1] - best[0]) best = [start, x]
        start = -1
      }
    }
    runs.push(best && best[1] - best[0] >= img.width / 5 ? best : null)
  }
  let top = null
  let cur = null
  for (let y = 0; y <= runs.length; y++) {
    const r = runs[y]
    if (r && cur && Math.abs(r[0] - cur.x0) <= 12) {
      cur.y1 = y
      cur.x1 = Math.max(cur.x1, r[1])
      cur.x0 = Math.min(cur.x0, r[0])
    } else {
      if (cur && (!top || cur.y1 - cur.y0 > top.y1 - top.y0)) top = cur
      cur = r ? { x0: r[0], x1: r[1], y0: y, y1: y } : null
    }
  }
  if (!top || top.y1 - top.y0 < img.height / 40) return null
  // Text and bars inside the card break those rows, so grow the block up and down while the card's
  // own edges (just inside the left and right, or the middle) are still card-colored.
  const cols = [top.x0 + 20, Math.round((top.x0 + top.x1) / 2), top.x1 - 21]
  const onCard = (y) => y >= 0 && y < img.height && cols.some((x) => isCard(img.rgb(x, y)))
  let y0 = top.y0
  let y1 = top.y1
  while (onCard(y0 - 1)) y0--
  while (onCard(y1 + 1)) y1++
  return { x: top.x0, y: y0, w: top.x1 - top.x0, h: y1 - y0 + 1 }
}

/** Crop `src` to `box` and save as PNG at `dest` (macOS `sips`). */
export function cropTo(src, box, dest) {
  execFileSync("sips", ["-c", String(box.h), String(box.w), "--cropOffset", String(box.y), String(box.x), src, "--out", dest], { stdio: "ignore" })
}

/**
 * Pure: refine a box to the widget's exact footprint, including its softened edges: every pixel
 * near the box that differs from the empty wallpaper belongs to the widget.
 */
export function refineBox(withWidget, empty, box, margin = 8, threshold = 10) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
  for (let y = Math.max(0, box.y - margin); y < Math.min(withWidget.height, box.y + box.h + margin); y++)
    for (let x = Math.max(0, box.x - margin); x < Math.min(withWidget.width, box.x + box.w + margin); x++) {
      const a = withWidget.rgb(x, y)
      const b = empty.rgb(x, y)
      if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > threshold) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  return x1 < 0 ? box : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

/** The widget's exact box, from the two screenshots. */
export function widgetBox(emptyPath, withWidgetPath) {
  const withWidget = readPng(readFileSync(withWidgetPath))
  const empty = readPng(readFileSync(emptyPath))
  if (withWidget.width !== empty.width || withWidget.height !== empty.height) throw new Error("the two screenshots are different sizes: take both on the same phone")
  const rough = findWidgetBox(withWidget)
  return rough && refineBox(withWidget, empty, rough)
}
