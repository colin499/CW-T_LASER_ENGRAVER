import type { Font } from 'opentype.js'
import { type Polyline } from './geometry'
import { parseEngravingLines } from './engraving'
import { layoutTextInSlot, placeOnJig } from './layout'
import { type ProductTemplate, type TemplateMatch, matchTemplate, slotFor } from './template'
import type { Ticket } from './ticket'

/** One piece of artwork on a layer, already in field mm. */
export type SceneItem = {
  id: string
  layer: string
  /** Closed contours (text glyphs, imported shapes) */
  contours: Polyline[]
  /** Where it came from, for the UI */
  source: { kind: 'engraving'; key: string; text: string } | { kind: 'import'; name: string }
}

export type Scene = {
  ticketId?: string
  template: ProductTemplate
  items: SceneItem[]
  warnings: string[]
}

export type FontLoader = (name: string) => Font

/**
 * Turn a ticket into a scene: match the product template by SKU, then place
 * each engraving line in its slot on the jig.
 */
export function buildScene(ticket: Ticket, templates: ProductTemplate[], loadFont: FontLoader): Scene {
  const match: TemplateMatch | null = matchTemplate(templates, ticket.sku)
  if (!match) throw new Error(`No template matches SKU "${ticket.sku}" and there is no '*' fallback template`)
  const { template } = match
  const warnings: string[] = []
  if (match.kind === 'fallback') {
    warnings.push(`No template for SKU "${ticket.sku}" — using the fallback template. Check position before burning.`)
  }

  const items: SceneItem[] = []
  const lines = parseEngravingLines(ticket.engravingText)
  lines.forEach((line, i) => {
    if (!line.value.trim()) return
    const slot = slotFor(template, line.key)
    if (!slot) {
      warnings.push(`No slot for "${line.key || '(unkeyed)'}" in template ${template.name}`)
      return
    }
    const layout = layoutTextInSlot(loadFont(slot.font), line.value, slot)
    if (layout.shrunk) {
      warnings.push(
        `"${line.value}" shrunk from ${slot.size.toFixed(2)} to ${layout.capHeight.toFixed(2)} mm to fit`,
      )
    }
    if (layout.overflow) warnings.push(`"${line.value}" does not fit its slot`)
    items.push({
      id: `line-${i}`,
      layer: slot.layer,
      contours: placeOnJig(layout.contours, template.jig.origin, template.jig.rotation),
      source: { kind: 'engraving', key: line.key, text: line.value },
    })
  })

  return { ticketId: ticket.id, template, items, warnings }
}
