import type { Bounds, Job } from '../../core'
import type { LaserStatus, Settings } from '../../shared'
import type { GalvoDriver } from './driver'

/** Owns the active driver, serialises jobs, and broadcasts status. */
export class LaserController {
  private status: LaserStatus
  private abort: AbortController | null = null

  constructor(private driver: GalvoDriver, private emit: (s: LaserStatus) => void) {
    this.status = { state: 'idle', driver: driver.name as Settings['driver'] }
  }

  getStatus() {
    return this.status
  }

  private set(patch: Partial<LaserStatus>) {
    this.status = { ...this.status, ...patch }
    this.emit(this.status)
  }

  private begin(state: LaserStatus['state']) {
    if (this.status.state === 'framing' || this.status.state === 'running') {
      throw new Error(`Laser is busy (${this.status.state})`)
    }
    this.abort = new AbortController()
    this.set({ state, progress: 0, message: undefined })
    return this.abort.signal
  }

  async frame(bounds: Bounds) {
    const signal = this.begin('framing')
    try {
      await this.driver.frame(bounds, signal)
    } finally {
      this.set({ state: 'idle' })
    }
  }

  async run(job: Job) {
    const signal = this.begin('running')
    try {
      await this.driver.run(job, (progress) => this.set({ progress }), signal)
      this.set({ state: 'idle', progress: 1, message: 'Job complete' })
    } catch (e) {
      const stopped = e instanceof DOMException && e.name === 'AbortError'
      this.set({ state: 'idle', message: stopped ? 'Stopped' : String(e) })
      if (!stopped) throw e
    }
  }

  stop() {
    this.abort?.abort()
  }
}
