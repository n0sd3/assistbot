import type { MsgKind } from '@shared/types'

export const fmtPhone = (p: string): string => {
  const d = p.replace(/\D/g, '')
  const m = d.match(/^55(\d{2})(9?\d{4})(\d{4})$/)
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : d ? '+' + d : ''
}
export const initials = (n: string): string => (n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase()
export const avatarColor = (s: string): string => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 45% 42%)` }
export const fmtSize = (b: number): string => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB')

const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
/** Hora se for hoje, "Ontem", dia da semana nesta semana, senão dd/mm. */
export function shortTime(t: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(t)) / 86400000)
  if (days <= 0) return new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return 'Ontem'
  if (days < 7) return WEEK[new Date(t).getDay()]
  return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
export function dayLabel(t: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(t)) / 86400000)
  if (days <= 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  return new Date(t).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}
export const hhmm = (t: number): string => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
export const sameDay = (a: number, b: number): boolean => startOfDay(a) === startOfDay(b)

export const KIND_ICON: Record<MsgKind, string> = { text: '', image: '📷', video: '🎥', audio: '🎵', voice: '🎤', document: '📄', sticker: '🏷️', location: '📍', contact: '👤', other: '' }
export const KIND_NAME: Record<MsgKind, string> = { text: '', image: 'Foto', video: 'Vídeo', audio: 'Áudio', voice: 'Mensagem de voz', document: 'Documento', sticker: 'Figurinha', location: 'Localização', contact: 'Contato', other: '' }
