import { app } from 'electron'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { AI_ASSETS, modelInfo, type Backend, type ModelKey } from '@shared/ai'

export const aiDir = (): string => { const d = join(app.getPath('userData'), 'ia'); mkdirSync(d, { recursive: true }); return d }
export const modelPath = (k: ModelKey): string => join(aiDir(), modelInfo(k).file)
const binDir = (b: Backend): string => join(aiDir(), 'motor', `${AI_ASSETS.llamaBuild}-${b}`)

function findServer(dir: string): string | undefined {
  if (!existsSync(dir)) return undefined
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) { const r = findServer(p); if (r) return r }
    else if (/^llama-server(\.exe)?$/.test(e.name)) return p
  }
  return undefined
}
export const serverPath = (b: Backend): string | undefined => findServer(binDir(b))
export const modelReady = (k: ModelKey): boolean => modelInfo(k).available && existsSync(modelPath(k)) && statSync(modelPath(k)).size === modelInfo(k).size
/** Qual modelo já está instalado (preferindo o melhor). */
export const installedModel = (): ModelKey | undefined => (['q4_0', 'q2_0'] as ModelKey[]).find((k) => modelReady(k))

const sha256 = (file: string): Promise<string> => new Promise((res, rej) => {
  const h = createHash('sha256'); const s = createReadStream(file)
  s.on('data', (d) => h.update(d)); s.on('end', () => res(h.digest('hex'))); s.on('error', rej)
})

export type Progress = (done: number, total: number) => void

/** Download com retomada (.part), progresso e verificação de integridade SHA-256. */
export async function download(url: string, dest: string, expected: string, size: number, onProgress: Progress, signal: AbortSignal): Promise<void> {
  const part = dest + '.part'
  let have = existsSync(part) ? statSync(part).size : 0
  if (have > size) { rmSync(part); have = 0 }
  if (have < size) {
    const r = await fetch(url, { headers: have ? { Range: `bytes=${have}-` } : {}, signal, redirect: 'follow' })
    if (!r.ok && r.status !== 206) throw new Error(`Falha no download (${r.status}). Verifique a internet.`)
    if (r.status === 200 && have) { rmSync(part); have = 0 }
    const out = createWriteStream(part, { flags: have ? 'a' : 'w' })
    let done = have
    const reader = r.body!.getReader()
    try {
      for (;;) {
        const { done: end, value } = await reader.read()
        if (end) break
        if (!out.write(value)) await new Promise((ok) => out.once('drain', ok))
        done += value.length; onProgress(done, size)
      }
    } finally { await new Promise((ok) => out.end(ok)) }
  }
  const got = await sha256(part)
  if (got !== expected) { rmSync(part, { force: true }); throw new Error('O arquivo baixado está corrompido (verificação de integridade falhou). Tente novamente.') }
  renameSync(part, dest)
}

export async function installBackend(b: Backend, onProgress: Progress, signal: AbortSignal): Promise<void> {
  if (serverPath(b)) return
  const a = AI_ASSETS.backends[b]
  const zip = join(aiDir(), a.file)
  await download(`https://github.com/ggml-org/llama.cpp/releases/download/${AI_ASSETS.llamaBuild}/${a.file}`, zip, a.sha256, a.size, onProgress, signal)
  const dir = binDir(b)
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  // tar.exe (bsdtar) já vem no Windows 10/11 e extrai .zip
  await new Promise<void>((res, rej) => execFile('tar', ['-xf', zip, '-C', dir], { windowsHide: true }, (e) => (e ? rej(new Error('Não foi possível extrair o motor de IA.')) : res())))
  rmSync(zip, { force: true })
  if (!serverPath(b)) throw new Error('Motor de IA incompleto após extração.')
}
export async function installModel(k: ModelKey, onProgress: Progress, signal: AbortSignal): Promise<void> {
  if (modelReady(k)) return
  const m = modelInfo(k)
  if (!m.available) throw new Error('Este modelo ainda não está disponível para download.')
  await download(m.url, modelPath(k), m.sha256, m.size, onProgress, signal)
}
export function removeAll(): void { rmSync(aiDir(), { recursive: true, force: true }) }
