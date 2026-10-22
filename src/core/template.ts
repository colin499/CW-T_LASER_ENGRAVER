/**
 * Product templates: where each engraving slot sits on a jig and which laser
 * settings each layer uses. Stored on engraving.cwandt.com (product_templates)
 * so every laser station shares them.
 */

export type HatchPass = {
  /** Hatch line angle in degrees (0 = horizontal) */
  angle: number
  /** Line spacing in mm */
  spacing: number
}

export type LayerSettings = {
  name?: string
  /** 'fill' hatches closed shapes; 'line' traces outlines */
  mode: 'fill' | 'line'
  /** Percent 0–100 */
  power: number
  /** Marking speed, mm/s */
  speed: number
  /** Pulse frequency, kHz */
  freq: number
  /** Q-pulse width, ns (MOPA sources); ignored by Q-switched sources */
  qpulse?: number
  passes: number
  /** fill only */
  hatch?: HatchPass[]
  /** fill only: alternate direction on every other line */
  bidir?: boolean
  /** fill only: also trace the outline after hatching */
  outline?: boolean
  /** Colour used on screen */
  color?: string
  /**
   * LightBurn only: name of a layer in the reference project (resources/lightburn/reference.lbrn2),
   * e.g. "BRASS". Its settings are the base for this layer; the values above are written on top.
   */
  preset?: string
  /**
   * Extra LightBurn cut-setting tags written verbatim (tag name → Value), applied after the mapped
   * settings. For galvo-only tags such as delays or jump speed, e.g. { "laserOnDelay": 100 }.
   */
  extra?: Record<string, string | number | boolean>
}

export type Slot = {
  /** Slot rectangle, mm, relative to the jig origin (top-left of the box) */
  x: number
  y: number
  w: number
  h: number
  align: 'left' | 'center' | 'right'
  valign?: 'top' | 'middle' | 'bottom'
  /** Font file name in the fonts directory */
  font: string
  /** Cap height in mm */
  size: number
  /** Line spacing as a multiple of size (default 1.6) */
  lineHeight?: number
  /** Shrink text uniformly until it fits the slot (default true) */
  autoShrink?: boolean
  maxLines?: number
  /** Extra space between letters, mm */
  letterSpacing?: number
  layer: string
}

export type ProductTemplate = {
  /** Exact SKU, or a prefix ending in '*' (e.g. 'TT-*'). '*' alone is the fallback template. */
  sku: string
  name: string
  jig: {
    id: string
    /** Jig origin in field mm (field centre is 0,0) */
    origin: [number, number]
    /** Degrees, clockwise, about the jig origin */
    rotation: number
    /** Part outline drawn on the canvas for orientation (field mm relative to jig origin) */
    outline?: { w: number; h: number; radius?: number }
  }
  /** Keyed by engravingText line key, e.g. 'engraving-text-66'. '' or 'default' catches unkeyed lines. */
  slots: Record<string, Slot>
  layers: Record<string, LayerSettings>
}

export type TemplateMatch = {
  template: ProductTemplate
  kind: 'exact' | 'prefix' | 'fallback'
}

/** Exact SKU match wins, then the longest matching prefix, then the '*' fallback. */
export function matchTemplate(templates: ProductTemplate[], sku: string): TemplateMatch | null {
  const norm = sku.trim().toUpperCase()
  const exact = templates.find((t) => !t.sku.endsWith('*') && t.sku.toUpperCase() === norm)
  if (exact) return { template: exact, kind: 'exact' }

  let best: ProductTemplate | null = null
  for (const t of templates) {
    if (t.sku === '*' || !t.sku.endsWith('*')) continue
    const prefix = t.sku.slice(0, -1).toUpperCase()
    if (norm.startsWith(prefix) && (!best || prefix.length > best.sku.length - 1)) best = t
  }
  if (best) return { template: best, kind: 'prefix' }

  const fallback = templates.find((t) => t.sku === '*')
  return fallback ? { template: fallback, kind: 'fallback' } : null
}

/** Pick the slot for an engraving line key. Unkeyed or unknown keys use the 'default' slot. */
export function slotFor(template: ProductTemplate, key: string): Slot | undefined {
  return template.slots[key] ?? template.slots['default'] ?? template.slots['']
}
