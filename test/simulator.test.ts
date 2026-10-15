import { describe, expect, it } from 'vitest'
import { buildScene, compileJob } from '../src/core'
import { jobToSvg } from '../src/main/galvo/simulator'
import { loadFont, templates, ticket } from './helpers'

describe('jobToSvg', () => {
  it('writes a field-sized SVG centred on the field with a blue alignment frame', () => {
    const svg = jobToSvg(compileJob(buildScene(ticket(), templates, loadFont)), 110)
    expect(svg).toContain('width="110mm" height="110mm" viewBox="-55 -55 110 110"')
    expect(svg).toContain('<rect x="-55" y="-55" width="110" height="110"/>')
    expect(svg).toMatch(/data-layer="text" d="M/)
  })
})
