/// <reference types="vite/client" />
import type { Api, Events } from "@shared/api"
declare global {
  interface Window {
    api: Api
    files: { pathFor(f: File): string }
    events: { on<K extends keyof Events>(ev: K, cb: (v: Events[K]) => void): () => void }
  }
}
export {}
