import { describe, expect, it } from 'vitest'
import { hatchContours, type Polyline } from '../src/core'

const square = (x: number, y: number, s: number): Polyline => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]]

describe('hatchContours', () => {
  it('fills a 1mm square with 10 horizontal lines at 0.1mm', () => {
    const segs = hatchContours([square(0, 0, 1)], { angle: 0, spacing: 0.1 })
    expect(segs).toHaveLength(10)
    for (const s of segs) expect(Math.abs(s[1][0] - s[0][0])).toBeCloseTo(1)
  })

  it('leaves holes unfilled (even-odd)', () => {
    const segs = hatchContours([square(0, 0, 3), square(1, 1, 1)], { angle: 0, spacing: 0.1 })
    // Rows that cross the hole are split in two, each 1mm long.
    const midRow = segs.filter((s) => Math.abs(s[0][1] - 1.55) < 1e-9)
    expect(midRow).toHaveLength(2)
    for (const s of midRow) expect(Math.abs(s[1][0] - s[0][0])).toBeCloseTo(1)
  })

  it('alternates direction when bidirectional', () => {
    const segs = hatchContours([square(0, 0, 1)], { angle: 0, spacing: 0.25 }, true)
    expect(segs[0][0][0]).toBeLessThan(segs[0][1][0])
    expect(segs[1][0][0]).toBeGreaterThan(segs[1][1][0])
  })

  it('rotated hatch stays inside the shape', () => {
    const segs = hatchContours([square(0, 0, 2)], { angle: 45, spacing: 0.1 })
    expect(segs.length).toBeGreaterThan(20)
    for (const s of segs) for (const [x, y] of s) {
      expect(x).toBeGreaterThanOrEqual(-1e-9)
      expect(x).toBeLessThanOrEqual(2 + 1e-9)
      expect(y).toBeGreaterThanOrEqual(-1e-9)
      expect(y).toBeLessThanOrEqual(2 + 1e-9)
    }
  })
})
