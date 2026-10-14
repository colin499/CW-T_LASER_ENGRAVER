/**
 * Mirrors engraving.cwandt.com src/lib/engraving.ts — keep the two in sync.
 * Ticket engravingText is JSON [{key, value}] where key (e.g. 'engraving-text-66')
 * names the slot on the product, or legacy plain text.
 */
export type EngravingLine = { key: string; value: string }

export function parseEngravingLines(raw: string): EngravingLine[] {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && 'value' in parsed[0]) {
      return parsed
    }
  } catch {}
  return raw.split('\n').map((line) => ({ key: '', value: line }))
}
