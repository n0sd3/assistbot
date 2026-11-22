import type { WaTransport, IncomingMessage, OutContent } from '../whatsapp/transport'
import * as db from '../db'
import { isOpenNow, processMessage, stepInfo } from './engine'
import type { AiProvider } from '../ai/provider'
import { log } from '../logger'
import { MAX_MEDIA, saveMedia } from '../media'
import { KIND_LABEL, signText } from '@shared/messages'
import type { EngineResult, MsgKind, UserRow } from '@shared/types'

export interface Hooks { notify(title: string, body: string, kind: 'human' | 'request'): void; changed(): void }

const MAX_AGE_MS = 2 * 3600_000 // não responde mensagens muito antigas (recebidas enquanto o PC estava desligado)
const MEDIA_KINDS: MsgKind[] = ['image', 'video', 'audio', 'voice', 'document', 'sticker']

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

  /** Baixa e guarda a mídia recebida (foto, áudio, documento…). Falhas não impedem o registro da mensagem. */
  private async fetchMedia(m: IncomingMessage): Promise<{ mediaPath?: string; mediaName?: string }> {
    if (!m.download) return {}
    try {
      const buf = await m.download()
      if (buf.length > MAX_MEDIA) return {}
      return { mediaPath: saveMedia(buf, m.id, m.mime, m.fileName), mediaName: m.fileName }
    } catch (e) { log.warn('Falha ao baixar mídia', String(e)); return {} }
  }

  private async handle(m: IncomingMessage): Promise<void> {
    if (m.isGroup) return
    const hasContent = !!m.text || !!m.download || m.kind === 'location' || m.kind === 'contact'
    if (!hasContent) return
    const jid = this.canonical(m)
    const media = await this.fetchMedia(m)
    const extra = { kind: m.kind, mime: m.mime, mediaPath: media.mediaPath, mediaName: media.mediaName ?? m.fileName, lat: m.lat, lng: m.lng }

    if (m.fromMe) {
      // aguarda o retorno do id da própria mensagem enviada pelo app antes de concluir que foi uma pessoa no celular
      await new Promise((r) => setTimeout(r, 1500))
      if (this.botSent.has(m.id)) return
      if (!db.addMessage(jid, true, m.text, 'human', m.id, m.ts, extra)) return
      const cfg = db.getConfig()
      db.setConv(jid, { status: 'human', humanUntil: Date.now() + cfg.handoff.pauseMinutesAfterHuman * 60_000 })
      this.hooks.changed()
      return
    }
    if (!db.addMessage(jid, false, m.text, 'client', m.id, m.ts, extra)) return // duplicada
    db.upsertCustomer(jid, m.pushName)
    this.hooks.changed()
    const cfg = db.getConfig()
    if (!cfg.behavior.enabled) return
    if (Date.now() - m.ts > MAX_AGE_MS) return
    if (m.kind === 'sticker' || m.kind === 'contact' || m.kind === 'other') return // não exigem resposta do bot

    const conv = db.getConv(jid)
    const now = Date.now()
    if (conv.status === 'needs_human') return
    if (conv.status === 'human') {
      if (conv.humanUntil > now) return
      db.setConv(jid, { status: 'bot', session: null, assignedTo: null })
    } else if (conv.status === 'done') db.setConv(jid, { status: 'bot' })

    // texto que o bot "enxerga": a própria mensagem, a legenda da mídia ou o link da localização
    const botText = m.kind === 'location' ? `📍 ${m.text} https://maps.google.com/?q=${m.lat},${m.lng}`.trim() : m.text
    const mediaOnly = MEDIA_KINDS.includes(m.kind) && !m.text

    const prevSession = conv.status === 'bot' ? conv.session : null
    const open = isOpenNow(cfg, new Date())
    const ctxBase = { cfg, now, knownName: db.customerName(jid), open }
    const inFlow = !!prevSession && !['start', 'done', 'handoff'].includes(prevSession.step)
    let res: EngineResult

    if (mediaOnly && inFlow) {
      // mídia sem texto no meio da triagem: confirma o recebimento e repete a pergunta atual
      const note = m.kind === 'audio' || m.kind === 'voice' ? cfg.messages.audioReceived : cfg.messages.mediaReceived.replace('{tipo}', KIND_LABEL[m.kind] ?? 'arquivo')
      res = { session: { ...prevSession!, lastActivity: now }, replies: [note, stepInfo(prevSession!, cfg).question].filter(Boolean), event: 'none' }
    } else {
      const useAi = !!this.ai?.ready()
      const isNew = !inFlow
      let prefill: Record<string, string> | undefined
      if (useAi && isNew && botText.length > 15) prefill = (await this.ai!.prefill(botText, cfg)) as Record<string, string> | undefined
      res = processMessage(prevSession, mediaOnly ? '' : botText, { ...ctxBase, prefill })
      const askedQuestion = botText.trim().endsWith('?') && !!prevSession && ['name', 'brand', 'problem', 'followup', 'address', 'availability'].includes(prevSession.step)
      if (useAi && (res.invalid || askedQuestion) && prevSession) {
        const info = stepInfo(prevSession, cfg)
        const it = await this.ai!.interpret({ question: info.question, options: info.options, text: botText, cfg })
        if (it?.intent === 'answer' && res.invalid) {
          const again = processMessage(prevSession, it.value, ctxBase)
          if (!again.invalid) res = again
        } else if (it?.intent === 'question') {
          res = { session: { ...prevSession, lastActivity: now }, replies: [it.reply, info.question].filter(Boolean), event: 'none' }
        } else if (it?.intent === 'human' && res.invalid) {
          res = { session: { ...prevSession, step: 'handoff', lastActivity: now }, replies: [cfg.messages.handoff], event: 'handoff' }
        }
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

  /** Resposta automática do bot (com atraso de 2–5 s e, se ativado, assinatura do bot). */
  private async reply(jid: string, text: string): Promise<void> {
    try {
      const st = db.getSettings()
      const wire = st.signBot ? signText(st.botSignatureName, text) : text
      const id = await this.wa.send(jid, { type: 'text', text: wire }, true)
      if (id) this.botSent.add(id)
      db.addMessage(jid, true, text, 'bot', id)
      if (this.botSent.size > 500) this.botSent = new Set([...this.botSent].slice(-200))
    } catch (e) {
      log.error('Falha ao enviar resposta', e)
    }
  }

  /** Funcionário envia qualquer tipo de mensagem pelo app. Texto e legendas levam a assinatura do usuário. */
  async sendFromUser(jid: string, content: OutContent, user: UserRow | null, stored: { mediaName?: string } = {}): Promise<void> {
    const st = db.getSettings()
    const sign = (t: string) => (st.signHuman && user ? signText(user.name, t) : t)
    let wire: OutContent = content
    if (content.type === 'text') wire = { ...content, text: sign(content.text) }
    else if (content.type === 'media' && content.caption) wire = { ...content, caption: sign(content.caption) }
    const id = await this.wa.send(jid, wire, false)
    if (id) this.botSent.add(id)
    const base = { userId: user?.id }
    if (content.type === 'text') db.addMessage(jid, true, content.text, 'human', id, Date.now(), base)
    else if (content.type === 'location') db.addMessage(jid, true, content.name ?? '', 'human', id, Date.now(), { ...base, kind: 'location', lat: content.lat, lng: content.lng })
    else if (content.type === 'contact') db.addMessage(jid, true, `👤 ${content.name}`, 'human', id, Date.now(), { ...base, kind: 'contact' })
    else {
      const kind: MsgKind = content.kind === 'audio' && content.ptt ? 'voice' : content.kind
      const mediaPath = saveMedia(content.data, id ?? String(Date.now()), content.mime, content.fileName)
      db.addMessage(jid, true, content.caption ?? '', 'human', id, Date.now(), { ...base, kind, mime: content.mime, mediaPath, mediaName: stored.mediaName ?? content.fileName })
    }
    const cfg = db.getConfig()
    db.setConv(jid, { status: 'human', humanUntil: Date.now() + cfg.handoff.pauseMinutesAfterHuman * 60_000, assignedTo: user?.id ?? null })
    this.hooks.changed()
  }
  takeOver(jid: string, user: UserRow | null): void {
    db.setConv(jid, { status: 'human', humanUntil: Date.now() + db.getConfig().handoff.pauseMinutesAfterHuman * 60_000, assignedTo: user?.id ?? null })
    this.hooks.changed()
  }
  release(jid: string): void {
    db.setConv(jid, { status: 'bot', humanUntil: 0, session: null, assignedTo: null })
    this.hooks.changed()
  }
}
