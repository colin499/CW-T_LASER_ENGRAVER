import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  type Job,
  type LayerSettings,
  buildScene,
  compileJob,
  contoursToShape,
  jobToLbrn2,
  layerToCutSetting,
  parseReferenceCutSettings,
} from '../src/core'
import { loadFont, templates, ticket } from './helpers'

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length
const value = (xml: string, tag: string) => xml.match(new RegExp(`<${tag} Value="([^"]*)"/>`))?.[1]

const fill: LayerSettings = {
  mode: 'fill', power: 40, speed: 1500, freq: 30, qpulse: 100, passes: 2,
  hatch: [{ angle: 0, spacing: 0.03 }, { angle: 90, spacing: 0.03 }], bidir: true,
}
const line: LayerSettings = { mode: 'line', power: 20, speed: 500, freq: 20, passes: 1 }

const squareJob = (settings: LayerSettings, name = 'text'): Job => ({
  layers: [{ name, settings, paths: [], contours: [[[0, 0], [10, 0], [10, 10], [0, 10]]] }],
  bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
  stats: { markLength: 0, jumpLength: 0, estSeconds: 0 },
  ticketId: 't1',
})

describe('jobToLbrn2', () => {
  const job = compileJob(buildScene(ticket(), templates, loadFont))
  const xml = jobToLbrn2(job)

  it('writes a LightBurn project with one cut setting and one shape per layer', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<LightBurnProject AppVersion=')).toBe(true)
    expect(xml).toContain('FormatVersion="1"')
    expect(xml.trimEnd().endsWith('</LightBurnProject>')).toBe(true)
    expect(count(xml, /<CutSetting /g)).toBe(job.layers.length)
    expect(count(xml, /<\/CutSetting>/g)).toBe(job.layers.length)
    expect(count(xml, /<Shape /g)).toBe(job.layers.length)
    expect(count(xml, /<\/Shape>/g)).toBe(job.layers.length)
    expect(job.layers[0].contours.length).toBeGreaterThan(0) // compileJob keeps the outlines
    expect(job.ticketId).toBe('t1')
  })

  it('maps the EXAMPLE-TAG text layer to a cross-hatched Scan layer', () => {
    expect(xml).toContain('<CutSetting type="Scan">')
    expect(value(xml, 'index')).toBe('0')
    expect(value(xml, 'name')).toBe('text')
    expect(value(xml, 'interval')).toBe('0.03')
    expect(value(xml, 'angle')).toBe('0')
    expect(value(xml, 'crossHatch')).toBe('1')
    expect(value(xml, 'numPasses')).toBe('2')
    expect(value(xml, 'speed')).toBe('1500')
    expect(value(xml, 'maxPower')).toBe('40')
    expect(value(xml, 'frequency')).toBe('30000')
    expect(value(xml, 'QPulseWidth')).toBe('100')
    expect(xml).toContain('<Shape Type="Path" CutIndex="0">')
  })

  it('writes line layers as Cut with no fill settings', () => {
    const out = jobToLbrn2(squareJob(line, 'outline'))
    expect(out).toContain('<CutSetting type="Cut">')
    expect(out).not.toContain('<interval ')
    expect(out).not.toContain('<QPulseWidth ')
  })

  it('encodes each contour as a closed loop of line primitives', () => {
    const out = jobToLbrn2(squareJob(line))
    expect(out).toContain('<VertList>V0 0c0x1c1x1V10 0c0x1c1x1V10 10c0x1c1x1V0 10c0x1c1x1</VertList>')
    expect(out).toContain('<PrimList>L0 1L1 2L2 3L3 0</PrimList>')
  })

  it('keeps two loops in one shape, each closed on itself, and drops a repeated last point', () => {
    const shape = contoursToShape(
      [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [3, 1], [3, 3]]],
      2,
      { yFlip: false, offset: [0, 0], precision: 4 },
    )!
    expect(shape).toContain('CutIndex="2"')
    expect(count(shape, /V[-\d.]+ [-\d.]+/g)).toBe(7)
    expect(shape).toContain('<PrimList>L0 1L1 2L2 3L3 0L4 5L5 6L6 4</PrimList>')
  })

  it('flips y and applies the offset', () => {
    const out = jobToLbrn2(squareJob(line), { yFlip: true, offset: [1.5, -2] })
    expect(out).toContain('<VertList>V1.5 -2c0x1c1x1V11.5 -2c0x1c1x1V11.5 -12c0x1c1x1V1.5 -12c0x1c1x1</VertList>')
  })
})

describe('layerToCutSetting merge order', () => {
  const ref = parseReferenceCutSettings(`<?xml version="1.0"?>
<LightBurnProject AppVersion="1.7.03" FormatVersion="1" MaterialHeight="0" MirrorX="False" MirrorY="True">
  <CutSetting type="Scan">
    <index Value="0"/>
    <name Value="text"/>
    <speed Value="9"/>
    <laserOnDelay Value="150"/>
    <bidir Value="True"/>
  </CutSetting>
  <CutSetting type="Cut">
    <index Value="1"/>
    <name Value="C01"/>
    <jumpSpeed Value="4000"/>
  </CutSetting>
</LightBurnProject>`)

  it('parses root attributes, blocks by name, and the boolean style', () => {
    expect(ref.root.MirrorY).toBe('True')
    expect(ref.boolStyle).toBe('word')
    expect(ref.byName.text.laserOnDelay).toBe(150)
    expect(ref.byName.C01.jumpSpeed).toBe(4000)
  })

  it('reference values < mapped values < extra, and index/name always win', () => {
    const { type, values } = layerToCutSetting(3, 'text', { ...fill, extra: { speed: 7, custom: 'x', index: 99 } }, ref)
    expect(type).toBe('Scan')
    expect(values.laserOnDelay).toBe(150) // from the reference
    expect(values.speed).toBe(7) // extra beats mapped (1500) beats reference (9)
    expect(values.custom).toBe('x')
    expect(values.index).toBe(3)
    expect(values.name).toBe('text')
  })

  it('copies nothing from the reference for a layer with no preset or matching name', () => {
    const { values } = layerToCutSetting(0, 'outline', line, ref)
    expect(values.jumpSpeed).toBeUndefined()
    expect(values.laserOnDelay).toBeUndefined()
  })

  it('takes the preset by settings.preset over the layer name', () => {
    const { values } = layerToCutSetting(0, 'text', { ...line, preset: 'C01' }, ref)
    expect(values.jumpSpeed).toBe(4000)
    expect(values.laserOnDelay).toBeUndefined()
  })

  it('writes booleans and root attributes in the reference style', () => {
    const out = jobToLbrn2(squareJob(fill), { reference: ref })
    expect(out).toContain('MirrorY="True"')
    expect(out).toContain('<crossHatch Value="True"/>')
  })

  it('never copies hide/index/name/priority from the reference', () => {
    const r = parseReferenceCutSettings(
      '<LightBurnProject><CutSetting type="Scan"><index Value="7"/><name Value="BRASS"/><hide Value="1"/><priority Value="9"/><floodFill Value="1"/></CutSetting></LightBurnProject>',
    )
    const { values } = layerToCutSetting(0, 'text', { ...fill, preset: 'BRASS' }, r)
    expect(values.hide).toBeUndefined()
    expect(values.index).toBe(0)
    expect(values.priority).toBe(0)
    expect(values.floodFill).toBe(1) // but galvo-only settings do carry over
  })

  const refFile = join(import.meta.dirname, '../resources/lightburn/reference.lbrn2')
  it.skipIf(!existsSync(refFile))('bases a layer on a material preset from the bundled reference project', () => {
    const r = parseReferenceCutSettings(readFileSync(refFile, 'utf8'))
    expect(r.root.DeviceName).toMatch(/JCZ/)
    expect(r.boolStyle).toBe('number')
    expect(Object.keys(r.byName)).toContain('BRASS')
    const { type, values } = layerToCutSetting(0, 'text', { ...fill, preset: 'JPF-BL-AL' }, r)
    expect(type).toBe('Scan')
    expect(values.rampLength).toBe(0.04) // from the preset
    expect(values.rampOuter).toBe(1)
    expect(values.speed).toBe(1500) // ours wins
    expect(values.frequency).toBe(30000)
    expect(values.hide).toBeUndefined()
    const xml = jobToLbrn2(squareJob({ ...fill, preset: 'JPF-BL-AL' }), { reference: r })
    expect(xml).toContain('DeviceName="JCZFiber (LMC4)"')
    expect(xml).toContain('<rampLength Value="0.04"/>')
    expect(xml).not.toContain('<hide ')
  })
})
