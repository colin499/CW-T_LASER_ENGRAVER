import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Bounds, Job } from '../../core'
import type { GalvoDriver } from './driver'

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Stopped', 'AbortError'))
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Stopped', 'AbortError'))
    }, { once: true })
  })

/** Write the job as an SVG so a run can be inspected without a laser. */
export function jobToSvg(job: Job, fieldSize: number): string {
  const h = fieldSize / 2
  const layers = job.layers
    .map((l) => {
      const d = l.paths.map((p) => 'M' + p.map(([x, y]) => `${x.toFixed(4)} ${y.toFixed(4)}`).join('L')).join('')
      return `<path data-layer="${l.name}" d="${d}" fill="none" stroke="${l.settings.color ?? '#000'}" stroke-width="0.01"/>`
    })
    .join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${fieldSize}mm" height="${fieldSize}mm" viewBox="${-h} ${-h} ${fieldSize} ${fieldSize}">\n${layers}\n</svg>\n`
}

export class SimulatorDriver implements GalvoDriver {
  readonly name = 'simulator'
  constructor(private outDir: string, private fieldSize: () => number) {}

  async connect() {}
  async disconnect() {}

  async frame(_bounds: Bounds, signal: AbortSignal) {
    while (!signal.aborted) await sleep(250, signal).catch(() => {})
  }

  async run(job: Job, onProgress: (p: number) => void, signal: AbortSignal) {
    mkdirSync(this.outDir, { recursive: true })
    const file = join(this.outDir, `job-${new Date().toISOString().replace(/[:.]/g, '-')}.svg`)
    writeFileSync(file, jobToSvg(job, this.fieldSize()))
    // Simulate in real time, capped so testing stays quick.
    const total = Math.min(job.stats.estSeconds * 1000, 5000)
    const steps = 50
    for (let i = 1; i <= steps; i++) {
      await sleep(total / steps, signal)
      onProgress(i / steps)
    }
  }
}
