import type { WaStatus } from '@shared/types'
import type { IncomingMessage, OutContent, WaTransport } from './transport'
import { parseMessage } from './parse'
import { clearAuth, useSqliteAuthState } from './authStore'
import { log } from '../logger'
import { jitter } from './jitter'

/* eslint-disable @typescript-eslint/no-explicit-any */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class BaileysTransport implements WaTransport {
  private sock: any
  private statusCb: (s: WaStatus) => void = () => {}
  private msgCb: (m: IncomingMessage) => void = () => {}
  private stopped = true
  private retry = 0
  private timer: NodeJS.Timeout | undefined
  private lib: any
  private status: WaStatus = { state: 'disconnected' }

  onStatus(cb: (s: WaStatus) => void): void { this.statusCb = cb }
  onMessage(cb: (m: IncomingMessage) => void): void { this.msgCb = cb }
  private set(s: Partial<WaStatus> & { state: WaStatus['state'] }): void {
    this.status = { ...s }
    this.statusCb(this.status)
  }

  async start(): Promise<void> {
    this.stopped = false
    clearTimeout(this.timer)
    await this.connect()
  }

  private async connect(): Promise<void> {
    if (this.stopped) return
    this.set({ state: 'connecting' })
    try {
      this.lib ??= await import('baileys')
      const L = this.lib
      const makeWASocket = L.default ?? L.makeWASocket
      const { state, saveCreds } = await useSqliteAuthState(L.initAuthCreds, L.BufferJSON, L.proto)
      let version: number[] | undefined
      try { version = (await L.fetchLatestBaileysVersion()).version } catch { /* usa padrão da biblioteca */ }
      const pino = (await import('pino')).default
      const sock = makeWASocket({
        auth: state, version, logger: pino({ level: 'silent' }), printQRInTerminal: false,
        browser: ['AssistBot', 'Desktop', '1.0.0'], markOnlineOnConnect: false, syncFullHistory: false,
        generateHighQualityLinkPreview: false
      })
      this.sock = sock
      sock.ev.on('creds.update', saveCreds)
      sock.ev.on('connection.update', (u: any) => {
        if (sock !== this.sock) return
        if (u.qr) this.set({ state: 'qr', qr: u.qr })
        if (u.connection === 'open') {
          this.retry = 0
          const id: string = sock.user?.id ?? ''
          this.set({ state: 'connected', phone: id.split(':')[0].split('@')[0], since: Date.now() })
        }
        if (u.connection === 'close') {
          const code = u.lastDisconnect?.error?.output?.statusCode
          const loggedOut = code === L.DisconnectReason.loggedOut
          log.warn('WhatsApp desconectado', code)
          if (loggedOut) {
            clearAuth()
            this.set({ state: 'disconnected', lastError: 'O WhatsApp foi desconectado pelo celular. Conecte novamente.' })
            if (!this.stopped) this.scheduleReconnect(1500)
          } else if (!this.stopped) {
            this.set({ state: 'connecting', lastError: 'Conexão perdida. Tentando reconectar…' })
            this.scheduleReconnect()
          }
        }
      })
      sock.ev.on('messages.upsert', (ev: any) => {
        if (ev.type !== 'notify' && ev.type !== 'append') return
        for (const m of ev.messages ?? []) this.handle(m, ev.type)
      })
    } catch (e) {
      log.error('Falha ao iniciar WhatsApp', e)
      this.set({ state: 'disconnected', lastError: 'Não foi possível iniciar a conexão. Verifique a internet.' })
      if (!this.stopped) this.scheduleReconnect()
    }
  }

  private scheduleReconnect(ms?: number): void {
    clearTimeout(this.timer)
    const delay = ms ?? Math.min(60_000, 2000 * 2 ** this.retry++)
    this.timer = setTimeout(() => { void this.connect() }, delay)
  }

  private handle(m: any, type: string): void {
    const jid: string | undefined = m.key?.remoteJid
    if (!jid || jid === 'status@broadcast') return
    if (type === 'append' && !m.key.fromMe) return
    if (!m.message) return
    const p = parseMessage(m.message)
    if (p.ignore) return
    const L = this.lib; const sock = this.sock
    const download = p.hasMedia
      ? async (): Promise<Buffer> => {
        const pino = (await import('pino')).default
        return (await L.downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage })) as Buffer
      }
      : undefined
    this.msgCb({
      id: m.key.id, jid, altJid: m.key.remoteJidAlt ?? m.key.participantAlt, text: p.text, fromMe: !!m.key.fromMe,
      pushName: m.pushName, ts: (Number(m.messageTimestamp) || Math.floor(Date.now() / 1000)) * 1000,
      isGroup: jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter'),
      kind: p.kind, mime: p.mime, fileName: p.fileName, lat: p.lat, lng: p.lng, download
    })
  }

  private toBaileys(c: OutContent): any {
    switch (c.type) {
      case 'text': return { text: c.text }
      case 'location': return { location: { degreesLatitude: c.lat, degreesLongitude: c.lng, name: c.name } }
      case 'contact': return { contacts: { displayName: c.name, contacts: [{ vcard: c.vcard }] } }
      case 'media':
        if (c.kind === 'image') return { image: c.data, mimetype: c.mime, caption: c.caption || undefined }
        if (c.kind === 'video') return { video: c.data, mimetype: c.mime, caption: c.caption || undefined }
        if (c.kind === 'audio') return { audio: c.data, mimetype: c.mime, ptt: !!c.ptt }
        if (c.kind === 'sticker') return { sticker: c.data }
        return { document: c.data, mimetype: c.mime, fileName: c.fileName ?? 'arquivo', caption: c.caption || undefined }
    }
  }

  async send(jid: string, content: OutContent, automated = true): Promise<string | undefined> {
    if (!this.sock || this.status.state !== 'connected') throw new Error('WhatsApp desconectado')
    if (automated) {
      await jitter(2000, 5000) // atraso aleatório de 2 a 5 s antes de qualquer ação automática
      try {
        await this.sock.presenceSubscribe(jid)
        await this.sock.sendPresenceUpdate(content.type === 'media' && content.kind === 'audio' ? 'recording' : 'composing', jid)
        await sleep(content.type === 'text' ? Math.min(1500, 400 + content.text.length * 10) : 800)
        await this.sock.sendPresenceUpdate('paused', jid)
      } catch { /* presença é opcional */ }
    }
    if (!this.sock || this.status.state !== 'connected') throw new Error('WhatsApp desconectado')
    const r = await this.sock.sendMessage(jid, this.toBaileys(content))
    return r?.key?.id
  }

  sendText(jid: string, text: string, automated = true): Promise<string | undefined> { return this.send(jid, { type: 'text', text }, automated) }

  async stop(): Promise<void> {
    this.stopped = true
    clearTimeout(this.timer)
    try { this.sock?.ev?.removeAllListeners?.('connection.update'); this.sock?.end?.(undefined) } catch { /* ignore */ }
    this.sock = undefined
    this.set({ state: 'disconnected' })
  }

  async logout(): Promise<void> {
    try { await this.sock?.logout?.() } catch { /* ignore */ }
    await this.stop()
    clearAuth()
  }
}
