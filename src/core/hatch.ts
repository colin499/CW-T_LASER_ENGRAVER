import { type Point, type Polyline, boundsOf, degToRad, rotatePolys } from './geometry'
import type { HatchPass } from './template'

/**
 * Scanline hatch fill of closed contours using the even-odd rule (glyph
 * counters like the hole in 'O' stay unfilled). Returns 2-point segments
 * ordered line by line; with bidir, every other line runs backwards.
 */
export function hatchContours(contours: Polyline[], pass: HatchPass, bidir = true): Polyline[] {
  if (contours.length === 0 || pass.spacing <= 0) return []
  const theta = degToRad(pass.angle)
  // Rotate the shape so hatch lines become horizontal, hatch, then rotate back.
  const rotated = rotatePolys(contours, -theta)
  const b = boundsOf(rotated)
  const segments: Polyline[] = []
  // Offset by half a spacing so lines don't graze the extreme edges.
  let row = 0
  for (let y = b.minY + pass.spacing / 2; y < b.maxY; y += pass.spacing, row++) {
    const xs: number[] = []
    for (const poly of rotated) {
      const n = poly.length
      for (let i = 0; i < n; i++) {
        const [x1, y1] = poly[i]
        const [x2, y2] = poly[(i + 1) % n]
        // Half-open interval avoids double-counting shared vertices.
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
          xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1))
        }
      }
    }
    if (xs.length < 2) continue
    xs.sort((a, c) => a - c)
    const rowSegs: Polyline[] = []
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1] - xs[i] > 1e-6) rowSegs.push([[xs[i], y], [xs[i + 1], y]])
    }
    if (bidir && row % 2 === 1) {
      rowSegs.reverse()
      rowSegs.forEach((s) => s.reverse())
    }
    segments.push(...rowSegs)
  }
  return rotatePolys(segments, theta)
}

/** Greedy nearest-neighbour ordering to cut galvo jump distance between paths. */
export function orderPaths(paths: Polyline[], start: Point = [0, 0]): Polyline[] {
  const remaining = paths.slice()
  const out: Polyline[] = []
  let cur = start
  while (remaining.length) {
    let bestI = 0
    let bestD = Infinity
    let bestRev = false
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i]
      const a = p[0]
      const z = p[p.length - 1]
      const da = (a[0] - cur[0]) ** 2 + (a[1] - cur[1]) ** 2
      const dz = (z[0] - cur[0]) ** 2 + (z[1] - cur[1]) ** 2
      if (da < bestD) [bestD, bestI, bestRev] = [da, i, false]
      if (dz < bestD) [bestD, bestI, bestRev] = [dz, i, true]
    }
    const [p] = remaining.splice(bestI, 1)
    const chosen = bestRev ? p.slice().reverse() : p
    out.push(chosen)
    cur = chosen[chosen.length - 1]
  }
  return out
}
