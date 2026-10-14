/**
 * Geometry primitives. All coordinates are millimetres in galvo field space:
 * origin at the centre of the field, +x right, +y down (same orientation as SVG).
 */
export type Point = [number, number]
export type Polyline = Point[]

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export const emptyBounds = (): Bounds => ({
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity,
})

export function boundsOf(polys: Polyline[], into: Bounds = emptyBounds()): Bounds {
  for (const poly of polys) {
    for (const [x, y] of poly) {
      if (x < into.minX) into.minX = x
      if (y < into.minY) into.minY = y
      if (x > into.maxX) into.maxX = x
      if (y > into.maxY) into.maxY = y
    }
  }
  return into
}

export const isEmptyBounds = (b: Bounds) => !Number.isFinite(b.minX)

export function rotatePoint([x, y]: Point, radians: number, [cx, cy]: Point = [0, 0]): Point {
  const c = Math.cos(radians)
  const s = Math.sin(radians)
  const dx = x - cx
  const dy = y - cy
  return [cx + dx * c - dy * s, cy + dx * s + dy * c]
}

export const translatePolys = (polys: Polyline[], dx: number, dy: number): Polyline[] =>
  polys.map((p) => p.map(([x, y]) => [x + dx, y + dy] as Point))

export const rotatePolys = (polys: Polyline[], radians: number, center: Point = [0, 0]): Polyline[] =>
  radians === 0 ? polys : polys.map((p) => p.map((pt) => rotatePoint(pt, radians, center)))

export const scalePolys = (polys: Polyline[], sx: number, sy = sx, [cx, cy]: Point = [0, 0]): Polyline[] =>
  polys.map((p) => p.map(([x, y]) => [cx + (x - cx) * sx, cy + (y - cy) * sy] as Point))

export const degToRad = (deg: number) => (deg * Math.PI) / 180

/** Adaptive-free fixed subdivision; segment count chosen from control polygon length. */
function subdivisions(len: number, tolerance: number): number {
  return Math.max(2, Math.min(256, Math.ceil(Math.sqrt(len / tolerance))))
}

const dist = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1])

export function flattenCubic(p0: Point, p1: Point, p2: Point, p3: Point, tolerance: number): Point[] {
  const n = subdivisions(dist(p0, p1) + dist(p1, p2) + dist(p2, p3), tolerance)
  const out: Point[] = []
  for (let i = 1; i <= n; i++) {
    const t = i / n
    const mt = 1 - t
    const a = mt * mt * mt
    const b = 3 * mt * mt * t
    const c = 3 * mt * t * t
    const d = t * t * t
    out.push([
      a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    ])
  }
  return out
}

export function flattenQuad(p0: Point, p1: Point, p2: Point, tolerance: number): Point[] {
  const n = subdivisions(dist(p0, p1) + dist(p1, p2), tolerance)
  const out: Point[] = []
  for (let i = 1; i <= n; i++) {
    const t = i / n
    const mt = 1 - t
    out.push([
      mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
      mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
    ])
  }
  return out
}

/** Path commands in the shape opentype.js (and our SVG importer) produce. */
export type PathCommand =
  | { type: 'M' | 'L'; x: number; y: number }
  | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: 'Q'; x1: number; y1: number; x: number; y: number }
  | { type: 'Z' }

/** Flatten path commands into closed contours (each contour's first point is not repeated). */
export function flattenCommands(commands: PathCommand[], tolerance = 0.005): Polyline[] {
  const contours: Polyline[] = []
  let current: Polyline = []
  let last: Point = [0, 0]
  const finish = () => {
    if (current.length >= 3) {
      const first = current[0]
      const end = current[current.length - 1]
      if (first[0] === end[0] && first[1] === end[1]) current.pop()
      contours.push(current)
    }
    current = []
  }
  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        finish()
        last = [cmd.x, cmd.y]
        current.push(last)
        break
      case 'L':
        last = [cmd.x, cmd.y]
        current.push(last)
        break
      case 'C':
        current.push(...flattenCubic(last, [cmd.x1, cmd.y1], [cmd.x2, cmd.y2], [cmd.x, cmd.y], tolerance))
        last = [cmd.x, cmd.y]
        break
      case 'Q':
        current.push(...flattenQuad(last, [cmd.x1, cmd.y1], [cmd.x, cmd.y], tolerance))
        last = [cmd.x, cmd.y]
        break
      case 'Z':
        finish()
        break
    }
  }
  finish()
  return contours
}
