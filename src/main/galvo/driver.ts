import type { Bounds, Job } from '../../core'

/**
 * What the app needs from a galvo controller. The simulator implements this
 * today; the JCZ/BJJCZ LMC USB driver (Phase 0, ported from meerk40t's galvo
 * driver) will implement the same interface.
 */
export interface GalvoDriver {
  readonly name: string
  connect(): Promise<void>
  disconnect(): Promise<void>
  /** Trace the bounding box with the red guide laser until stop() is called. */
  frame(bounds: Bounds, signal: AbortSignal): Promise<void>
  /** Mark the job. onProgress gets 0..1. Rejects with AbortError if stopped. */
  run(job: Job, onProgress: (p: number) => void, signal: AbortSignal): Promise<void>
}
