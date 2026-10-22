import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

// The UI font ships with the app (resources/fonts) and is served over IPC, so the renderer works offline.
for (const [file, weight] of [['SpaceMono-Regular.ttf', '400'], ['SpaceMono-Bold.ttf', '700']] as const) {
  window.cwt
    .getFont(file)
    .then((buf) => new FontFace('Space Mono', buf, { weight }).load())
    .then((face) => document.fonts.add(face))
    .catch((e) => console.warn(`UI font ${file} not loaded:`, e))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
