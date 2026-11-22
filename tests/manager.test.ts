import { describe, it, expect, vi, beforeAll } from 'vitest'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'assistbot-'))
vi.mock('electron', () => ({ app: { getPath: () => dir, isPackaged: false }, safeStorage: { isEncryptionAvailable: () => false } }))

import * as db from '../src/main/db'
import { BotManager } from '../src/main/bot/manager'
import type { IncomingMessage, OutContent, WaTransport } from '../src/main/whatsapp/transport'
import { resolveMedia } from '../src/main/media'

class Fake implements WaTransport {
  sent: { jid: string; c: OutContent; automated: boolean }[] = []
  cb: (m: IncomingMessage) => void = () => {}
  n = 0
  async start() {} async stop() {} async logout() {}
  async send(jid: string, c: OutContent, automated = true) { this.sent.push({ jid, c, automated }); return 'OUT' + ++this.n }
  sendText(jid: string, t: string, a = true) { return this.send(jid, { type: 'text', text: t }, a) }
  onStatus() {} onMessage(cb: (m: IncomingMessage) => void) { this.cb = cb }
}
const J = '5511988880001@s.whatsapp.net'
let id = 0
const msg = (o: Partial<IncomingMessage>): IncomingMessage => ({ id: 'M' + ++id, jid: J, text: '', fromMe: false, ts: Date.now(), isGroup: false, kind: 'text', ...o })
const settle = () => new Promise((r) => setTimeout(r, 60))

describe('gerenciador: mídia, assinatura e usuários', () => {
  const wa = new Fake()
  let mgr: BotManager
  beforeAll(() => {
    db.openDb(join(dir, 'x.db'))
    const c = db.getConfig(); c.behavior.enabled = true; db.saveConfig(c)
    mgr = new BotManager(wa, { notify() {}, changed() {} })
  })

  it('recebe foto com legenda: salva o arquivo e registra', async () => {
    wa.cb(msg({ kind: 'image', text: 'olha a tela', mime: 'image/jpeg', download: async () => Buffer.from('JPEGDATA') }))
    await settle()
    const m = db.listMessages(J).find((x) => x.kind === 'image')!
    expect(m.text).toBe('olha a tela'); expect(m.mime).toBe('image/jpeg')
    expect(readFileSync(resolveMedia(m.mediaPath)!).toString()).toBe('JPEGDATA')
  })
  it('mídia fora do caminho é recusada', () => { expect(resolveMedia('../x.db')).toBeUndefined(); expect(resolveMedia('../../etc/passwd')).toBeUndefined() })
  it('foto sem legenda no meio da triagem: confirma e repete a pergunta', async () => {
    wa.sent.length = 0
    wa.cb(msg({ kind: 'image', mime: 'image/png', download: async () => Buffer.from('PNG') }))
    await settle()
    const texts = wa.sent.map((s) => (s.c.type === 'text' ? s.c.text : ''))
    expect(texts.some((t) => t.includes('foto'))).toBe(true)
    expect(wa.sent.every((s) => s.automated)).toBe(true)
  })
  it('áudio recebe aviso de que não é compreendido', async () => {
    wa.sent.length = 0
    wa.cb(msg({ kind: 'voice', mime: 'audio/ogg', download: async () => Buffer.from('OGG') }))
    await settle()
    expect(wa.sent.map((s) => (s.c.type === 'text' ? s.c.text : '')).join('|')).toContain('áudios')
  })
  it('localização vira texto para o bot e fica salva', async () => {
    wa.cb(msg({ kind: 'location', text: 'Minha casa', lat: -23.5, lng: -46.6 }))
    await settle()
    const m = db.listMessages(J).find((x) => x.kind === 'location')!
    expect(m.lat).toBe(-23.5)
  })
  it('mensagem duplicada é ignorada', async () => {
    const clientMsgs = () => db.listMessages(J).filter((m) => m.source === 'client').length
    const before = clientMsgs(); wa.sent.length = 0
    const dup = msg({ text: 'repetida' }); wa.cb(dup); wa.cb(dup); await settle()
    expect(clientMsgs()).toBe(before + 1)
    const firstReplyBatch = wa.sent.length
    expect(firstReplyBatch).toBeLessThanOrEqual(3) // respondeu uma vez só
  })

  it('usuário envia texto assinado, sem atraso automático', async () => {
    const uid = db.saveUser({ name: 'Edson Cleubert', role: 'admin' })
    const user = db.getUser(uid)!
    wa.sent.length = 0
    await mgr.sendFromUser(J, { type: 'text', text: 'Olá, tudo bem?' }, user)
    expect(wa.sent[0].c).toEqual({ type: 'text', text: '*Edson Cleubert:*\nOlá, tudo bem?' })
    expect(wa.sent[0].automated).toBe(false)
    const saved = db.listMessages(J).filter((x) => x.source === 'human').pop()!
    expect(saved.text).toBe('Olá, tudo bem?'); expect(saved.userName).toBe('Edson Cleubert')
    const conv = db.listConversations().find((c) => c.jid === J)!
    expect(conv.status).toBe('human'); expect(conv.assignedName).toBe('Edson Cleubert')
  })
  it('legenda de anexo também é assinada e o arquivo é guardado', async () => {
    const user = db.listUsers()[0]
    wa.sent.length = 0
    await mgr.sendFromUser(J, { type: 'media', kind: 'document', data: Buffer.from('%PDF'), mime: 'application/pdf', fileName: 'orcamento.pdf', caption: 'Segue o orçamento' }, user)
    expect(wa.sent[0].c).toMatchObject({ type: 'media', caption: '*Edson Cleubert:*\nSegue o orçamento' })
    const m = db.listMessages(J).filter((x) => x.kind === 'document').pop()!
    expect(m.mediaName).toBe('orcamento.pdf'); expect(existsSync(resolveMedia(m.mediaPath)!)).toBe(true)
  })
  it('sem assinatura quando desativada; dois usuários assinam cada um com seu nome', async () => {
    const s = db.getSettings(); db.saveSettings({ ...s, signHuman: false })
    wa.sent.length = 0
    await mgr.sendFromUser(J, { type: 'text', text: 'sem assinatura' }, db.listUsers()[0])
    expect((wa.sent[0].c as { text: string }).text).toBe('sem assinatura')
    db.saveSettings({ ...s, signHuman: true })
    const b = db.getUser(db.saveUser({ name: 'Ana Souza', role: 'atendente' }))!
    await mgr.sendFromUser(J, { type: 'text', text: 'oi' }, b)
    expect((wa.sent[1].c as { text: string }).text).toBe('*Ana Souza:*\noi')
    expect(db.listConversations().find((c) => c.jid === J)!.assignedName).toBe('Ana Souza')
  })
  it('bot em silêncio enquanto humano atende', async () => {
    wa.sent.length = 0
    wa.cb(msg({ text: 'ainda está aí?' })); await settle()
    expect(wa.sent.length).toBe(0)
  })
  it('localização e contato enviados por pessoa', async () => {
    const u = db.listUsers()[0]
    await mgr.sendFromUser(J, { type: 'location', lat: -23.5, lng: -46.6, name: 'Loja' }, u)
    await mgr.sendFromUser(J, { type: 'contact', name: 'João', vcard: 'BEGIN:VCARD' }, u)
    const kinds = db.listMessages(J).map((m) => m.kind)
    expect(kinds).toContain('contact'); expect(kinds.filter((k) => k === 'location').length).toBeGreaterThanOrEqual(2)
  })
  it('assinatura do bot opcional', async () => {
    db.setConv(J, { status: 'bot', session: null, humanUntil: 0 })
    db.saveSettings({ ...db.getSettings(), signBot: true, botSignatureName: 'Assistente virtual' })
    wa.sent.length = 0
    wa.cb(msg({ text: 'oi' })); await settle()
    expect((wa.sent[0].c as { text: string }).text.startsWith('*Assistente virtual:*\n')).toBe(true)
  })
})

describe('contato', () => {
  it('guarda nome e anotações e resume o cliente', () => {
    db.saveContact(J, { name: 'Marina S.', notes: 'prefere à tarde' })
    const c = db.getContact(J)
    expect(c).toMatchObject({ name: 'Marina S.', notes: 'prefere à tarde', phone: '5511988880001' })
    expect(c.messageCount).toBeGreaterThan(3)
  })
  it('marca conversa sem resposta quando a última mensagem é do cliente', async () => {
    db.setConv(J, { status: 'human', humanUntil: Date.now() + 60000 })
    await new Promise((r) => setTimeout(r, 5))
    db.addMessage(J, false, 'alguém aí?', 'client', 'UNANS1', Date.now() + 1000)
    expect(db.listConversations().find((x) => x.jid === J)!.unanswered).toBe(true)
  })
})
