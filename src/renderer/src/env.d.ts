import type { CwtApi } from '../../shared'

declare global {
  interface Window {
    cwt: CwtApi
  }
}
