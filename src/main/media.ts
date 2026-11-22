import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { extFor } from './whatsapp/parse'

export const MAX_MEDIA = 100 * 1024 * 1024 // limite do WhatsApp para documentos
export const mediaDir = (): string => { const d = join(app.getPath('userData'), 'midia'); mkdirSync(d, { recursive: true }); return d }

/** Salva o arquivo e devolve o caminho RELATIVO (guardado no banco). */
export function saveMedia(data: Buffer, id: string, mime?: string, fileName?: string): string {
  const month = new Date().toISOString().slice(0, 7)
  const dir = join(mediaDir(), month); mkdirSync(dir, { recursive: true })
  const safe = id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || String(Date.now())
  const rel = join(month, `${safe}.${extFor(mime, fileName)}`)
  writeFileSync(join(mediaDir(), rel), data)
  return rel.split(sep).join('/')
}
/** Resolve um caminho relativo garantindo que fica dentro da pasta de mídias (evita acesso a outros arquivos). */
export function resolveMedia(rel: string): string | undefined {
  const base = resolve(mediaDir()); const abs = resolve(base, rel)
  return abs.startsWith(base + sep) && existsSync(abs) ? abs : undefined
}
