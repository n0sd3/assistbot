import type { MsgKind } from '@shared/types'

export interface Parsed {
  kind: MsgKind; text: string; mime?: string; fileName?: string; hasMedia: boolean
  lat?: number; lng?: number; ignore?: boolean
}
/* eslint-disable @typescript-eslint/no-explicit-any */
const WRAPPERS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage']

export function unwrap(msg: any): any {
  let m = msg
  for (let i = 0; i < 5 && m; i++) {
    const k = WRAPPERS.find((w) => m[w]?.message)
    if (!k) break
    m = m[k].message
  }
  return m
}

/** Converte uma mensagem do WhatsApp (formato do Baileys) em algo simples para o app. */
export function parseMessage(raw: any): Parsed {
  const m = unwrap(raw)
  if (!m) return { kind: 'other', text: '', hasMedia: false, ignore: true }
  if (m.reactionMessage || m.protocolMessage || m.senderKeyDistributionMessage || m.editedMessage) return { kind: 'other', text: '', hasMedia: false, ignore: true }
  const txt = m.conversation ?? m.extendedTextMessage?.text
  if (txt) return { kind: 'text', text: String(txt), hasMedia: false }
  const reply = m.buttonsResponseMessage?.selectedDisplayText ?? m.listResponseMessage?.title ?? m.templateButtonReplyMessage?.selectedDisplayText
  if (reply) return { kind: 'text', text: String(reply), hasMedia: false }
  if (m.imageMessage) return { kind: 'image', text: m.imageMessage.caption ?? '', mime: m.imageMessage.mimetype ?? 'image/jpeg', hasMedia: true }
  if (m.videoMessage) return { kind: 'video', text: m.videoMessage.caption ?? '', mime: m.videoMessage.mimetype ?? 'video/mp4', hasMedia: true }
  if (m.audioMessage) return { kind: m.audioMessage.ptt ? 'voice' : 'audio', text: '', mime: m.audioMessage.mimetype ?? 'audio/ogg', hasMedia: true }
  if (m.documentMessage) return { kind: 'document', text: m.documentMessage.caption ?? '', mime: m.documentMessage.mimetype ?? 'application/octet-stream', fileName: m.documentMessage.fileName ?? 'arquivo', hasMedia: true }
  if (m.stickerMessage) return { kind: 'sticker', text: '', mime: m.stickerMessage.mimetype ?? 'image/webp', hasMedia: true }
  const loc = m.locationMessage ?? m.liveLocationMessage
  if (loc) return { kind: 'location', text: [loc.name, loc.address].filter(Boolean).join(' — '), lat: loc.degreesLatitude, lng: loc.degreesLongitude, hasMedia: false }
  if (m.contactMessage) return { kind: 'contact', text: `👤 ${m.contactMessage.displayName ?? 'Contato'}${phoneFromVcard(m.contactMessage.vcard)}`, hasMedia: false }
  if (m.contactsArrayMessage) return { kind: 'contact', text: '👤 ' + (m.contactsArrayMessage.contacts ?? []).map((c: any) => c.displayName).filter(Boolean).join(', '), hasMedia: false }
  const poll = m.pollCreationMessage ?? m.pollCreationMessageV2 ?? m.pollCreationMessageV3
  if (poll) return { kind: 'other', text: `📊 Enquete: ${poll.name ?? ''}`, hasMedia: false }
  if (m.pollUpdateMessage) return { kind: 'other', text: '', hasMedia: false, ignore: true }
  if (Object.keys(m).every((k) => k === 'messageContextInfo')) return { kind: 'other', text: '', hasMedia: false, ignore: true }
  return { kind: 'other', text: '[mensagem de tipo não suportado]', hasMedia: false }
}

function phoneFromVcard(v?: string): string {
  const t = v?.match(/TEL[^:]*:([+\d\s()-]+)/)?.[1]?.trim()
  return t ? ` (${t})` : ''
}

export const vcard = (name: string, phone: string): string => {
  const digits = phone.replace(/\D/g, '')
  return `BEGIN:VCARD\nVERSION:3.0\nN:;${name};;;\nFN:${name}\nTEL;type=CELL;waid=${digits}:+${digits}\nEND:VCARD`
}

export const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/3gpp': '3gp',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr', 'application/pdf': 'pdf'
}
export const extFor = (mime: string | undefined, fileName?: string): string => {
  const fromName = fileName?.match(/\.([A-Za-z0-9]{1,6})$/)?.[1]
  if (fromName) return fromName.toLowerCase()
  const base = (mime ?? '').split(';')[0].trim()
  return EXT[base] ?? 'bin'
}
export const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime', '3gp': 'video/3gpp',
  ogg: 'audio/ogg; codecs=opus', opus: 'audio/ogg; codecs=opus', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', amr: 'audio/amr', wav: 'audio/wav',
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', txt: 'text/plain', zip: 'application/zip'
}
export const mimeFor = (fileName: string): string => MIME_BY_EXT[fileName.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
