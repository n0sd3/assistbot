import type { MsgKind, WaStatus } from '@shared/types'

export interface IncomingMessage {
  id: string; jid: string; altJid?: string; text: string; fromMe: boolean; pushName?: string; ts: number; isGroup: boolean
  kind: MsgKind; mime?: string; fileName?: string; lat?: number; lng?: number
  /** Baixa o arquivo (foto, áudio, documento…) — só existe para mensagens com mídia. */
  download?: () => Promise<Buffer>
}

/** Qualquer conteúdo que o app pode enviar. */
export type OutContent =
  | { type: 'text'; text: string }
  | { type: 'media'; kind: 'image' | 'video' | 'audio' | 'document' | 'sticker'; data: Buffer; mime: string; fileName?: string; caption?: string; ptt?: boolean }
  | { type: 'location'; lat: number; lng: number; name?: string }
  | { type: 'contact'; name: string; vcard: string }

/** Contrato único entre o app e a biblioteca de WhatsApp: permite trocar Baileys por LibZapitu sem mexer no resto. */
export interface WaTransport {
  start(): Promise<void>
  stop(): Promise<void>
  logout(): Promise<void>
  /** automated=true (padrão): ações do bot aguardam 2–5 s aleatórios; mensagens de uma pessoa (automated=false) saem na hora. */
  send(jid: string, content: OutContent, automated?: boolean): Promise<string | undefined>
  sendText(jid: string, text: string, automated?: boolean): Promise<string | undefined>
  onStatus(cb: (s: WaStatus) => void): void
  onMessage(cb: (m: IncomingMessage) => void): void
}
