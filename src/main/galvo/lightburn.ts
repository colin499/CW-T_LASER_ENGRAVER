import { createSocket } from 'node:dgram'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Job, type ReferenceCutSettings, jobToLbrn2 } from '../../core'
import type { GalvoDriver } from './driver'

/**
 * Hands jobs to a running LightBurn on this machine: writes a .lbrn2 project and
 * asks LightBurn to open it over its UDP command interface (Device Settings →
 * enable UDP). LightBurn listens on 19840 and replies on 19841. The operator
 * frames and starts the job in LightBurn.
 */
export type LightBurnOptions = {
  host: string
  port: number
  replyPort: number
  outDir: string
  yFlip: boolean
  offset: [number, number]
  reference: ReferenceCutSettings | null
  timeoutMs: number
}

export type UdpReply = 'OK' | '!' | '?'

export const LOADED_MESSAGE = 'Loaded in LightBurn'

/** Send one command and wait for LightBurn's reply ('OK', '!' failed, '?' unknown command). */
export function lightburnCommand(
  cmd: string,
  o: Pick<LightBurnOptions, 'host' | 'port' | 'replyPort' | 'timeoutMs'>,
  signal?: AbortSignal,
): Promise<UdpReply> {
  return new Promise<UdpReply>((resolve, reject) => {
    const sock = createSocket('udp4')
    let done = false
    const finish = (fn: () => void) => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      sock.close()
      fn()
    }
    const onAbort = () => finish(() => reject(new DOMException('Stopped', 'AbortError')))
    const timer = setTimeout(
      () => finish(() => reject(new Error(`No reply from LightBurn at ${o.host}:${o.port} (is UDP enabled in Device Settings?)`))),
      o.timeoutMs,
    )
    if (signal?.aborted) return onAbort()
    signal?.addEventListener('abort', onAbort, { once: true })
    sock.on('error', (e) => finish(() => reject(e)))
    sock.on('message', (msg) => {
      const text = msg.toString('utf8').trim()
      finish(() => resolve(text === 'OK' ? 'OK' : text === '?' ? '?' : '!'))
    })
    sock.bind(o.replyPort, o.host === '127.0.0.1' || o.host === 'localhost' ? '127.0.0.1' : '0.0.0.0', () => {
      sock.send(Buffer.from(cmd, 'utf8'), o.port, o.host, (e) => {
        if (e) finish(() => reject(e))
      })
    })
  })
}

const safeName = (s: string) => s.replace(/[^\w.-]+/g, '_').slice(0, 40) || 'job'

export class LightBurnDriver implements GalvoDriver {
  readonly name = 'lightburn'
  lastJobFile: string | null = null
  constructor(private opts: () => LightBurnOptions) {}

  async connect() {
    const o = this.opts()
    const reply = await lightburnCommand('PING', { ...o, timeoutMs: Math.min(o.timeoutMs, 1500) })
    if (reply !== 'OK') throw new Error('LightBurn answered PING but is not ready (a dialog may be open)')
  }

  async disconnect() {}

  /** Framing is done in LightBurn; nothing to do here. */
  async frame() {}

  async run(job: Job, onProgress: (p: number) => void, signal: AbortSignal): Promise<string> {
    const o = this.opts()
    mkdirSync(o.outDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const file = join(o.outDir, `${safeName(job.ticketId ?? 'job')}-${stamp}.lbrn2`)
    writeFileSync(file, jobToLbrn2(job, { yFlip: o.yFlip, offset: o.offset, reference: o.reference }))
    this.lastJobFile = file
    onProgress(0.5)
    const reply = await lightburnCommand(`FORCELOAD:${file}`, o, signal)
    if (reply === '!') throw new Error(`LightBurn refused to load ${file}`)
    if (reply === '?') throw new Error('LightBurn did not understand FORCELOAD (older LightBurn version?)')
    onProgress(1)
    return LOADED_MESSAGE
  }
}
