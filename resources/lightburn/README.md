# LightBurn reference project

`reference.lbrn2` here is a slim copy of our LightBurn master project: just the root element and the
`<CutSetting>` blocks (one per material layer: BRASS, SS, AL DARK, …), no artwork or thumbnail.
Regenerate it from a freshly saved master with:

```sh
node scripts/slim-lbrn2.mjs "path/to/CW&T ENGRAVE MASTER.lbrn2" resources/lightburn/reference.lbrn2
```

The app uses it as the base for every layer it sends to LightBurn. A template layer picks a material with
`"preset": "BRASS"`; its own power/speed/frequency/passes/hatch values are written on top, and galvo-only
settings from the preset (ramp, wobble, flood fill, angle per pass…) carry over unchanged. The `hide` flag
is never copied, so sent layers always output.

`*.lbrn2` files are gitignored because the presets are our material know-how and the GitHub repo is public.
`npm run dist` still bundles this folder into the app. A copy at `lightburn/reference.lbrn2` inside the
app's data folder (`~/Library/Application Support/CW&T Laser/`) overrides the bundled one.
