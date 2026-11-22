import type { WaTransport, IncomingMessage } from '../whatsapp/transport'
import * as db from '../db'
import { isOpenNow, processMessage, stepInfo } from './engine'
import type { AiProvider } from '../ai/provider'
import { log } from '../logger'

export interface Hooks { notify(title: string, body: string, kind: 'human' | 'request'): void; changed(): void }

const MAX_AGE_MS = 2 * 3600_000 // não responde mensagens muito antigas (recebidas enquanto o PC estava desligado)

export class BotManager {
  private botSent = new Set<string>()
  private queues = new Map<string, Promise<void>>()
  constructor(private wa: WaTransport, private hooks: Hooks, private ai?: AiProvider) {
    wa.onMessage((m) => this.enqueue(m))
  }

  private enqueue(m: IncomingMessage): void {
    const prev = this.queues.get(m.jid) ?? Promise.resolve()
    const next = prev.then(() => this.handle(m)).catch((e) => log.error('Erro ao tratar mensagem', e))
    this.queues.set(m.jid, next)
    void next.finally(() => { if (this.queues.get(m.jid) === next) this.queues.delete(m.jid) })
  }

  private canonical(m: IncomingMessage): string {
    if (m.altJid && m.altJid.endsWith('@s.whatsapp.net') && m.jid.endsWith('@lid')) return m.altJid
    return m.jid
  }

  private async handle(m: IncomingMessage): Promise<void> {
    if (m.isGroup || !m.text) return
    const jid = this.canonical(m)
    if (m.fromMe) {
      // aguarda o retorno do id da própria mensagem do bot antes de concluir que foi uma pessoa
      await new Promise((r) => setTimeout(r, 1500))
      if (this.botSent.has(m.id)) return
      if (!db.addMessage(jid, true, m.text, 'human', m.id, m.ts)) return
      const cfg = db.getConfig()
      db.setConv(jid, { status: 'human', humanUntil: Date.now() + cfg.handoff.pauseMinutesAfterHuman * 60_000 })
      this.hooks.changed()
      return
    }
    if (!db.addMessage(jid, false, m.text, 'client', m.id, m.ts)) return // duplicada
    db.upsertCustomer(jid, m.pushName)
    this.hooks.changed()
    const cfg = db.getConfig()
    if (!cfg.behavior.enabled) return
    if (Date.now() - m.ts > MAX_AGE_MS) return

    const conv = db.getConv(jid)
    const now = Date.now()
    if (conv.status === 'needs_human') return
    if (conv.status === 'human') {
      if (conv.humanUntil > now) return
      db.setConv(jid, { status: 'bot', session: null })
    } else if (conv.status === 'done') db.setConv(jid, { status: 'bot' })

    const prevSession = conv.status === 'bot' ? conv.session : null
    const open = isOpenNow(cfg, new Date())
    const ctxBase = { cfg, now, knownName: db.customerName(jid), open }
    const useAi = !!this.ai?.ready() && !!cfg.behavior.enabled
    const isNew = !prevSession || prevSession.step === 'start' || prevSession.step === 'done' || prevSession.step === 'handoff'
    let prefill: Record<string, string> | undefined
    if (useAi && isNew && m.text.length > 15) prefill = (await this.ai!.prefill(m.text, cfg)) as Record<string, string> | undefined
    let res = processMessage(prevSession, m.text, { ...ctxBase, prefill })
    const askedQuestion = m.text.trim().endsWith('?') && !!prevSession && ['name', 'brand', 'problem', 'followup', 'address', 'availability'].includes(prevSession.step)
    if (useAi && (res.invalid || askedQuestion) && prevSession) {
      const info = stepInfo(prevSession, cfg)
      const it = await this.ai!.interpret({ question: info.question, options: info.options, text: m.text, cfg })
      if (it?.intent === 'answer' && res.invalid) {
        const again = processMessage(prevSession, it.value, ctxBase)
        if (!again.invalid) res = again
      } else if (it?.intent === 'question') {
        res = { session: { ...prevSession, lastActivity: now }, replies: [it.reply, info.question].filter(Boolean), event: 'none' }
      } else if (it?.intent === 'human' && res.invalid) {
        res = { session: { ...prevSession, step: 'handoff', lastActivity: now }, replies: [cfg.messages.handoff], event: 'handoff' }
      }
    }
    db.setConv(jid, { session: res.session })
    for (const r of res.replies) await this.reply(jid, r)

    if (res.event === 'handoff') {
      db.setConv(jid, { status: 'needs_human', session: res.session })
      this.hooks.notify('Cliente pediu atendimento humano', `${db.customerName(jid) ?? db.phoneOf(jid)} aguarda uma pessoa.`, 'human')
    } else if (res.event === 'completed') {
      const id = db.createRequest(jid, res.session, cfg)
      db.setConv(jid, { status: 'done' })
      this.hooks.notify('Nova solicitação', `#${id} — ${res.session.data.name} (${res.session.data.equipment}): ${res.session.data.problem}`, 'request')
    }
    this.hooks.changed()
  }

  private async reply(jid: string, text: string): Promise<void> {
    try {
      const id = await this.wa.sendText(jid, text)
      if (id) this.botSent.add(id)
      db.addMessage(jid, true, text, 'bot', id)
      if (this.botSent.size > 500) this.botSent = new Set([...this.botSent].slice(-200))
    } catch (e) {
      log.error('Falha ao enviar resposta', e)
    }
  }

  /** Funcionário assume a conversa pelo app. */
  async sendManual(jid: string, text: string): Promise<void> {
    const id = await this.wa.sendText(jid, text)
    if (id) this.botSent.add(id)
    db.addMessage(jid, true, text, 'human', id)
    const cfg = db.getConfig()
    db.setConv(jid, { status: 'human', humanUntil: Date.now() + cfg.handoff.pauseMinutesAfterHuman * 60_000 })
    this.hooks.changed()
  }
  takeOver(jid: string): void {
    db.setConv(jid, { status: 'human', humanUntil: Date.now() + db.getConfig().handoff.pauseMinutesAfterHuman * 60_000 })
    this.hooks.changed()
  }
  release(jid: string): void {
    db.setConv(jid, { status: 'bot', humanUntil: 0, session: null })
    this.hooks.changed()
  }
}
