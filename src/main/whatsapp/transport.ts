import type { WaStatus } from '@shared/types'

export interface IncomingMessage {
  id: string; jid: string; altJid?: string; text: string; fromMe: boolean; pushName?: string; ts: number; isGroup: boolean
}
/** Contrato único entre o app e a biblioteca de WhatsApp: permite trocar Baileys por LibZapitu sem mexer no resto. */
export interface WaTransport {
  start(): Promise<void>
  stop(): Promise<void>
  logout(): Promise<void>
  sendText(jid: string, text: string): Promise<string | undefined>
  onStatus(cb: (s: WaStatus) => void): void
  onMessage(cb: (m: IncomingMessage) => void): void
}
