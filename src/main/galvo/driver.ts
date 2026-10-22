import type { Bounds, Job } from '../../core'

/**
 * What the app needs from a galvo controller. The simulator writes SVGs, the
 * LightBurn driver hands the job to LightBurn over UDP, and the JCZ/BJJCZ LMC
 * USB driver (Phase 0, ported from meerk40t's galvo driver) will mark directly.
 */
export interface GalvoDriver {
  readonly name: string
  /** Most recent file this driver wrote, if it writes files */
  readonly lastJobFile?: string | null
  connect(): Promise<void>
  disconnect(): Promise<void>
  /** Trace the bounding box with the red guide laser until stop() is called. */
  frame(bounds: Bounds, signal: AbortSignal): Promise<void>
  /**
   * Mark the job. onProgress gets 0..1. Rejects with AbortError if stopped.
   * May resolve with a completion message (default 'Job complete').
   */
  run(job: Job, onProgress: (p: number) => void, signal: AbortSignal): Promise<void | string>
}
