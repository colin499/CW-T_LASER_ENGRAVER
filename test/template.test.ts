import { describe, expect, it } from 'vitest'
import { matchTemplate, type ProductTemplate } from '../src/core'

const t = (sku: string) => ({ sku, name: sku, jig: { id: '', origin: [0, 0], rotation: 0 }, slots: {}, layers: {} }) as ProductTemplate

describe('matchTemplate', () => {
  const all = [t('*'), t('TT-*'), t('TT-BR*'), t('TT-BRASS')]
  it('prefers an exact SKU', () => expect(matchTemplate(all, 'tt-brass')?.template.sku).toBe('TT-BRASS'))
  it('uses the longest prefix', () => expect(matchTemplate(all, 'TT-BRONZE')?.template.sku).toBe('TT-BR*'))
  it('falls back to the shorter prefix', () => expect(matchTemplate(all, 'TT-STEEL')?.kind).toBe('prefix'))
  it('falls back to *', () => expect(matchTemplate(all, 'OTHER')?.kind).toBe('fallback'))
  it('returns null with no fallback', () => expect(matchTemplate([t('TT-*')], 'OTHER')).toBeNull())
})
