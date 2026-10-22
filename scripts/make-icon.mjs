#!/usr/bin/env node
// App icon in the house style: white tile, 1px-ish black rule, "CW&T" set in Space Mono Bold as paths.
// Writes build/icon.svg, build/icon.png (1024) and build/icon.icns (via qlmanage + iconutil, macOS only).
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import opentype from 'opentype.js'

const S = 1024
const font = opentype.loadSync('resources/fonts/SpaceMono-Bold.ttf')
const text = 'CW&T'
const size = 300
const w = font.getAdvanceWidth(text, size)
const path = font.getPath(text, (S - w) / 2, S / 2 + size * 0.33, size)
const r = 180 // macOS squircle-ish corner
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<rect x="0" y="0" width="${S}" height="${S}" rx="${r}" fill="#ffffff"/>
<rect x="20" y="20" width="${S - 40}" height="${S - 40}" rx="${r - 20}" fill="none" stroke="#000" stroke-width="14"/>
<path d="${path.toPathData(2)}" fill="#000"/>
<rect x="${S / 2 - 150}" y="${S * 0.72}" width="300" height="24" fill="#bbff00"/>
</svg>
`
mkdirSync('build', { recursive: true })
writeFileSync('build/icon.svg', svg)
rmSync('build/icon.iconset', { recursive: true, force: true })
mkdirSync('build/icon.iconset')
execSync(`qlmanage -t -s ${S} -o build build/icon.svg`, { stdio: 'ignore' })
renameSync('build/icon.svg.png', 'build/icon.png')
for (const [name, px] of [['16x16', 16], ['16x16@2x', 32], ['32x32', 32], ['32x32@2x', 64], ['128x128', 128], ['128x128@2x', 256], ['256x256', 256], ['256x256@2x', 512], ['512x512', 512], ['512x512@2x', 1024]]) {
  execSync(`sips -z ${px} ${px} build/icon.png --out build/icon.iconset/icon_${name}.png`, { stdio: 'ignore' })
}
execSync('iconutil -c icns build/icon.iconset -o build/icon.icns')
rmSync('build/icon.iconset', { recursive: true, force: true })
console.log('wrote build/icon.svg, build/icon.png, build/icon.icns')
