import opentype, { type Font } from 'opentype.js'
import type { ProductTemplate } from '@core'

const cache = new Map<string, Font>()

/** Fetch and parse every font a set of templates uses, so layout can run synchronously. */
export async function ensureFonts(templates: ProductTemplate[]) {
  const names = new Set(templates.flatMap((t) => Object.values(t.slots).map((s) => s.font)))
  await Promise.all(
    [...names].filter((n) => !cache.has(n)).map(async (n) => cache.set(n, opentype.parse(await window.cwt.getFont(n)))),
  )
}

export function loadFont(name: string): Font {
  const f = cache.get(name)
  if (!f) throw new Error(`Font not loaded: ${name}`)
  return f
}
