import type { Font } from 'opentype.js'
import {
  type Polyline,
  type PathCommand,
  boundsOf,
  degToRad,
  flattenCommands,
  rotatePolys,
  translatePolys,
} from './geometry'
import type { Slot } from './template'

export type LayoutResult = {
  contours: Polyline[]
  /** Final cap height after any auto-shrink, mm */
  capHeight: number
  shrunk: boolean
  overflow: boolean
}

function capHeightUnits(font: Font): number {
  const os2 = (font.tables as Record<string, any>).os2
  const cap = os2?.sCapHeight
  if (cap && cap > 0) return cap
  const glyph = font.charToGlyph('H')
  return glyph.yMax ?? font.ascender * 0.7
}

/** Font size (em in mm) that gives the requested cap height in mm. */
export const emForCapHeight = (font: Font, capHeight: number) =>
  (capHeight * font.unitsPerEm) / capHeightUnits(font)

function lineWidth(font: Font, text: string, em: number, letterSpacing: number) {
  const chars = [...text].length
  return font.getAdvanceWidth(text, em, { kerning: true }) + Math.max(0, chars - 1) * letterSpacing
}

function lineCommands(font: Font, text: string, x: number, baseline: number, em: number, letterSpacing: number) {
  if (!letterSpacing) return font.getPath(text, x, baseline, em, { kerning: true }).commands as PathCommand[]
  const commands: PathCommand[] = []
  let cursor = x
  const glyphs = font.stringToGlyphs(text)
  glyphs.forEach((g, i) => {
    commands.push(...(g.getPath(cursor, baseline, em).commands as PathCommand[]))
    const kern = i < glyphs.length - 1 ? font.getKerningValue(g, glyphs[i + 1]) : 0
    cursor += ((g.advanceWidth ?? 0) + kern) * (em / font.unitsPerEm) + letterSpacing
  })
  return commands
}

/**
 * Lay out (possibly multi-line) text inside a slot. Returns closed contours in
 * slot-local mm, with the slot's top-left corner at (slot.x, slot.y).
 */
export function layoutTextInSlot(font: Font, text: string, slot: Slot): LayoutResult {
  const maxLines = slot.maxLines ?? 1
  let lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '')
  if (lines.length === 0) return { contours: [], capHeight: slot.size, shrunk: false, overflow: false }
  let overflow = false
  if (lines.length > maxLines) {
    // Join the extra lines onto the last allowed line rather than dropping text.
    lines = [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(' ')]
  }

  const letterSpacing = slot.letterSpacing ?? 0
  const lineHeightFactor = slot.lineHeight ?? 1.6
  const autoShrink = slot.autoShrink ?? true

  let cap = slot.size
  const fits = (c: number) => {
    const em = emForCapHeight(font, c)
    const widest = Math.max(...lines.map((l) => lineWidth(font, l, em, letterSpacing)))
    const height = c + (lines.length - 1) * c * lineHeightFactor
    return widest <= slot.w + 1e-9 && height <= slot.h + 1e-9
  }
  let shrunk = false
  if (!fits(cap)) {
    if (autoShrink) {
      // Binary search the largest cap height that fits.
      let lo = 0
      let hi = cap
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2
        if (fits(mid)) lo = mid
        else hi = mid
      }
      cap = lo
      shrunk = true
    } else {
      overflow = true
    }
  }

  const em = emForCapHeight(font, cap)
  const pitch = cap * lineHeightFactor
  const blockHeight = cap + (lines.length - 1) * pitch
  const valign = slot.valign ?? 'middle'
  const top =
    valign === 'top' ? slot.y : valign === 'bottom' ? slot.y + slot.h - blockHeight : slot.y + (slot.h - blockHeight) / 2

  const contours: Polyline[] = []
  lines.forEach((line, i) => {
    const width = lineWidth(font, line, em, letterSpacing)
    const x =
      slot.align === 'left' ? slot.x : slot.align === 'right' ? slot.x + slot.w - width : slot.x + (slot.w - width) / 2
    const baseline = top + cap + i * pitch
    contours.push(...flattenCommands(lineCommands(font, line, x, baseline, em, letterSpacing)))
  })

  return { contours, capHeight: cap, shrunk, overflow }
}

/** Move slot-local contours into field space using the jig origin and rotation. */
export function placeOnJig(contours: Polyline[], origin: [number, number], rotationDeg: number): Polyline[] {
  return translatePolys(rotatePolys(contours, degToRad(rotationDeg)), origin[0], origin[1])
}

export { boundsOf }
