import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { dirname } from 'node:path'
import type { AiPlan } from '@shared/ai'
import { installedModel, modelPath, serverPath } from './installer'
import { log } from '../logger'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const freePort = (): Promise<number> => new Promise((res, rej) => {
  const s = createServer(); s.once('error', rej)
  s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)) })
})

/** Gerencia o llama-server local: inicia sob demanda e desliga quando fica ocioso (economiza RAM/CPU). */
export class LlamaServer {
  private proc: ChildProcess | undefined
  private port = 0
  private starting: Promise<void> | undefined
  private idle: NodeJS.Timeout | undefined
  private queue: Promise<unknown> = Promise.resolve()
  onChange: (running: boolean) => void = () => {}
  constructor(private getPlan: () => AiPlan, private idleMinutes: () => number) {}

  get running(): boolean { return !!this.proc && this.port > 0 }

  async ensure(): Promise<void> {
    if (this.running) return
    this.starting ??= this.start().finally(() => { this.starting = undefined })
    return this.starting
  }

  private async start(): Promise<void> {
    const plan = this.getPlan()
    if (!plan.usable) throw new Error('Este computador não atende aos requisitos da IA local.')
    try { await this.spawnWith(plan.backend, plan) }
    catch (e) {
      if (plan.backend === 'vulkan') { log.warn('Vulkan falhou, usando CPU', e); await this.spawnWith('cpu', { ...plan, gpuLayers: 0 }) } else throw e
    }
  }

  private async spawnWith(backend: 'cpu' | 'vulkan', plan: AiPlan): Promise<void> {
    const exe = serverPath(backend) ?? (backend === 'vulkan' ? serverPath('cpu') : undefined)
    if (!exe) throw new Error('Motor de IA não instalado.')
    this.port = await freePort()
    const mk = installedModel(); if (!mk) throw new Error('Modelo de IA não instalado.')
    const args = ['-m', modelPath(plan.model === mk ? plan.model : mk), '--host', '127.0.0.1', '--port', String(this.port), '-c', String(plan.ctx * plan.parallel), '-ngl', String(plan.gpuLayers),
      '-t', String(plan.threads), '-np', String(plan.parallel), '--no-webui', '--no-warmup']
    log.info('Iniciando llama-server', exe, args.join(' '))
    const p = spawn(exe, args, { cwd: dirname(exe), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    this.proc = p
    let tail = ''
    const keep = (d: Buffer) => { tail = (tail + d.toString()).slice(-1500) }
    p.stdout?.on('data', keep); p.stderr?.on('data', keep)
    p.on('exit', (code) => { log.warn('llama-server saiu', code, tail.slice(-400)); if (this.proc === p) { this.proc = undefined; this.port = 0; this.onChange(false) } })
    const t0 = Date.now()
    while (Date.now() - t0 < 180_000) {
      if (this.proc !== p) throw new Error('O motor de IA encerrou ao iniciar: ' + tail.slice(-200))
      try { const r = await fetch(`http://127.0.0.1:${this.port}/health`); if (r.ok) { this.onChange(true); this.touch(); return } } catch { /* ainda carregando */ }
      await sleep(700)
    }
    this.stop()
    throw new Error('Tempo esgotado ao carregar o modelo de IA.')
  }

  private touch(): void {
    clearTimeout(this.idle)
    const m = this.idleMinutes()
    if (m > 0) this.idle = setTimeout(() => { log.info('IA ociosa: desligando'); this.stop() }, m * 60_000)
  }

  stop(): void {
    clearTimeout(this.idle)
    const p = this.proc; this.proc = undefined; this.port = 0
    if (p && !p.killed) { try { p.kill() } catch { /* já encerrou */ } this.onChange(false) }
  }

  /** Uma chamada por vez (a fila evita estourar CPU/RAM); devolve JSON conforme o schema. */
  chatJson<T>(system: string, user: string, schema: object, timeoutMs = 60_000, maxTokens = 220): Promise<T> {
    const job = this.queue.then(async () => {
      await this.ensure()
      this.touch()
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs)
      try {
        const r = await fetch(`http://127.0.0.1:${this.port}/v1/chat/completions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
          body: JSON.stringify({
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0, max_tokens: maxTokens,
            response_format: { type: 'json_schema', json_schema: { name: 'resposta', strict: true, schema } },
            chat_template_kwargs: { enable_thinking: false }
          })
        })
        if (!r.ok) throw new Error('IA respondeu ' + r.status + ': ' + (await r.text()).slice(0, 200))
        const j = (await r.json()) as { choices: { message: { content: string } }[] }
        return JSON.parse(j.choices[0].message.content) as T
      } finally { clearTimeout(t); this.touch() }
    })
    this.queue = job.catch(() => undefined)
    return job
  }
}
