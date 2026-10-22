import { createSocket, type Socket } from 'node:dgram'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildScene, compileJob } from '../src/core'
import { LOADED_MESSAGE, LightBurnDriver, lightburnCommand } from '../src/main/galvo/lightburn'
import { loadFont, templates, ticket } from './helpers'

/** A stand-in for LightBurn's listener: replies on port+1 like the real thing. */
let fake: Socket
let port = 0
const received: string[] = []

beforeAll(async () => {
  fake = createSocket('udp4')
  await new Promise<void>((r) => fake.bind(0, '127.0.0.1', r))
  port = fake.address().port
  fake.on('message', (msg, rinfo) => {
    const cmd = msg.toString()
    received.push(cmd)
    if (cmd === 'HANG') return
    const reply = cmd === 'PING' ? 'OK' : cmd.startsWith('FORCELOAD:') ? (cmd.includes('refused') ? '!' : 'OK') : '?'
    fake.send(reply, port + 1, rinfo.address)
  })
})
afterAll(() => fake.close())

const opts = () => ({ host: '127.0.0.1', port, replyPort: port + 1, timeoutMs: 200 })

describe('lightburnCommand', () => {
  it('resolves OK, ! and ? replies', async () => {
    expect(await lightburnCommand('PING', opts())).toBe('OK')
    expect(await lightburnCommand('FORCELOAD:/refused', opts())).toBe('!')
    expect(await lightburnCommand('NOPE', opts())).toBe('?')
  })

  it('times out when nothing answers', async () => {
    await expect(lightburnCommand('HANG', opts())).rejects.toThrow(/No reply from LightBurn/)
  })

  it('rejects with AbortError when stopped', async () => {
    const ac = new AbortController()
    const p = lightburnCommand('HANG', opts(), ac.signal)
    ac.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('releases the reply port after every call', async () => {
    await lightburnCommand('PING', opts())
    const probe = createSocket('udp4')
    await new Promise<void>((resolve, reject) => {
      probe.once('error', reject)
      probe.bind(port + 1, '127.0.0.1', resolve)
    })
    probe.close()
  })
})

describe('LightBurnDriver', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'cwt-lbrn-'))
  afterAll(() => rmSync(outDir, { recursive: true, force: true }))

  it('writes the job and asks LightBurn to load it', async () => {
    const driver = new LightBurnDriver(() => ({ ...opts(), outDir, yFlip: false, offset: [0, 0], reference: null, timeoutMs: 500 }))
    await driver.connect()
    const job = compileJob(buildScene(ticket({ id: 'order 42/a' }), templates, loadFont))
    const progress: number[] = []
    const result = await driver.run(job, (p) => progress.push(p), new AbortController().signal)
    expect(result).toBe(LOADED_MESSAGE)
    expect(progress.at(-1)).toBe(1)
    expect(driver.lastJobFile).toMatch(/order_42_a-.*\.lbrn2$/)
    expect(existsSync(driver.lastJobFile!)).toBe(true)
    expect(readFileSync(driver.lastJobFile!, 'utf8')).toContain('<LightBurnProject')
    expect(received.at(-1)).toBe(`FORCELOAD:${driver.lastJobFile}`)
  })

  it('surfaces a refused load as an error', async () => {
    const driver = new LightBurnDriver(() => ({ ...opts(), outDir: join(outDir, 'refused'), yFlip: false, offset: [0, 0], reference: null }))
    const job = compileJob(buildScene(ticket(), templates, loadFont))
    await expect(driver.run(job, () => {}, new AbortController().signal)).rejects.toThrow(/refused to load/)
  })
})
