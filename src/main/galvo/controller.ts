import type { Bounds, Job } from '../../core'
import type { LaserStatus, Settings } from '../../shared'
import type { GalvoDriver } from './driver'

export const JOB_COMPLETE = 'Job complete'

/** Owns the active driver, serialises jobs, and broadcasts status. */
export class LaserController {
  private status: LaserStatus
  private abort: AbortController | null = null

  constructor(private driver: GalvoDriver, private emit: (s: LaserStatus) => void) {
    this.status = { state: 'idle', driver: driver.name as Settings['driver'] }
  }

  get current() {
    return this.driver
  }

  getStatus() {
    return this.status
  }

  get busy() {
    return this.status.state === 'framing' || this.status.state === 'running'
  }

  private set(patch: Partial<LaserStatus>) {
    this.status = { ...this.status, ...patch }
    this.emit(this.status)
  }

  private begin(state: LaserStatus['state']) {
    if (this.busy) throw new Error(`Laser is busy (${this.status.state})`)
    this.abort = new AbortController()
    this.set({ state, progress: 0, message: undefined })
    return this.abort.signal
  }

  /** Probe the driver. A failure is reported as status, not thrown. */
  async connect(): Promise<LaserStatus> {
    if (this.busy) return this.status
    try {
      await this.driver.connect()
      this.set({ state: 'idle', connected: true, message: undefined })
    } catch (e) {
      this.set({ state: 'disconnected', connected: false, message: e instanceof Error ? e.message : String(e) })
    }
    return this.status
  }

  /** Swap the driver (after a settings change). Throws if a job is in progress. */
  async setDriver(driver: GalvoDriver) {
    if (this.busy) throw new Error(`Laser is busy (${this.status.state}); stop it before changing the driver`)
    await this.driver.disconnect().catch(() => {})
    this.driver = driver
    this.set({ state: 'idle', driver: driver.name as Settings['driver'], connected: undefined, message: undefined, progress: undefined })
    await this.connect()
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
      const message = await this.driver.run(job, (progress) => this.set({ progress }), signal)
      this.set({ state: 'idle', progress: 1, message: message || JOB_COMPLETE })
    } catch (e) {
      const stopped = e instanceof DOMException && e.name === 'AbortError'
      this.set({ state: 'idle', message: stopped ? 'Stopped' : e instanceof Error ? e.message : String(e) })
      if (!stopped) throw e
    }
  }

  stop() {
    this.abort?.abort()
  }
}
