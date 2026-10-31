/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Comma-separated sha256 hashes of valid unlock codes (PLAN §7). Never set for the demo. */
  readonly VITE_UNLOCK_HASHES?: string
  /** Where "Try the free demo" points. */
  readonly VITE_DEMO_URL?: string
}
