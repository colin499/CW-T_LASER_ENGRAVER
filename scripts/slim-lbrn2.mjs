#!/usr/bin/env node
// Keep only the root element and <CutSetting> blocks of a LightBurn project (drops artwork, thumbnail, prefs).
import { readFileSync, writeFileSync } from 'node:fs'
const [src, dst] = process.argv.slice(2)
if (!src || !dst) {
  console.error('usage: slim-lbrn2.mjs <master.lbrn2> <reference.lbrn2>')
  process.exit(1)
}
const xml = readFileSync(src, 'utf8')
const root = xml.match(/<LightBurnProject\b[^>]*>/)?.[0]
if (!root) throw new Error('not a LightBurn project')
const blocks = [...xml.matchAll(/<CutSetting\b[^>]*>[\s\S]*?<\/CutSetting>/g)].map((m) => m[0])
writeFileSync(dst, `<?xml version="1.0" encoding="UTF-8"?>\n${root}\n    ${blocks.join('\n    ')}\n</LightBurnProject>\n`)
console.log(`${dst}: ${blocks.length} cut settings`)
