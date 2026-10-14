import { describe, expect, it } from 'vitest'
import { boundsOf, buildScene, compileJob, layoutTextInSlot } from '../src/core'
import { loadFont, templates, ticket } from './helpers'

const tag = templates.find((t) => t.sku === 'EXAMPLE-TAG')!

describe('layoutTextInSlot', () => {
  it('centres text inside the slot at the requested cap height', () => {
    const slot = tag.slots['engraving-text-66']
    const r = layoutTextInSlot(loadFont(slot.font), 'HELL', slot) // no round letters: 'O' overshoots the cap line
    const b = boundsOf(r.contours)
    expect(r.shrunk).toBe(false)
    expect(b.maxY - b.minY).toBeCloseTo(slot.size, 1) // caps only, no descenders
    expect((b.minX + b.maxX) / 2).toBeCloseTo(slot.x + slot.w / 2, 0)
    expect(b.minX).toBeGreaterThanOrEqual(slot.x)
    expect(b.maxX).toBeLessThanOrEqual(slot.x + slot.w)
  })

  it('shrinks long text to fit the slot width', () => {
    const slot = tag.slots['engraving-text-66']
    const r = layoutTextInSlot(loadFont(slot.font), 'A VERY LONG ENGRAVING LINE', slot)
    const b = boundsOf(r.contours)
    expect(r.shrunk).toBe(true)
    expect(r.capHeight).toBeLessThan(slot.size)
    expect(b.maxX - b.minX).toBeLessThanOrEqual(slot.w + 0.01)
  })
})

describe('buildScene + compileJob', () => {
  it('places each keyed line in its slot on the jig', () => {
    const scene = buildScene(
      ticket({ engravingText: JSON.stringify([
        { key: 'engraving-text-66', value: 'HELLO' },
        { key: 'engraving-text-67', value: '2026.10.14' },
      ]) }),
      templates,
      loadFont,
    )
    expect(scene.warnings).toEqual([])
    expect(scene.items).toHaveLength(2)
    const [o0, o1] = [tag.jig.origin[0], tag.jig.origin[1]]
    const b0 = boundsOf(scene.items[0].contours)
    const b1 = boundsOf(scene.items[1].contours)
    expect(b0.minY).toBeGreaterThanOrEqual(o1 + tag.slots['engraving-text-66'].y)
    expect(b1.minY).toBeGreaterThanOrEqual(o1 + tag.slots['engraving-text-67'].y)
    expect(b0.minX).toBeGreaterThanOrEqual(o0)

    const job = compileJob(scene)
    expect(job.layers.map((l) => l.name)).toEqual(['text'])
    expect(job.layers[0].paths.length).toBeGreaterThan(100)
    expect(job.stats.estSeconds).toBeGreaterThan(0)
    expect(job.bounds.maxX).toBeLessThanOrEqual(o0 + tag.jig.outline!.w)
  })

  it('warns when falling back to the generic template', () => {
    const scene = buildScene(ticket({ sku: 'UNKNOWN', engravingText: 'Hi there' }), templates, loadFont)
    expect(scene.template.sku).toBe('*')
    expect(scene.warnings[0]).toMatch(/fallback/)
  })
})
