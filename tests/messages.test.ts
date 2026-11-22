import { describe, it, expect } from 'vitest'
import { signText } from '../src/shared/messages'
import { parseMessage, vcard, extFor, mimeFor } from '../src/main/whatsapp/parse'

describe('assinatura', () => {
  it('formata como *Nome:* + quebra de linha', () => { expect(signText('Edson Cleubert', 'Olá, tudo bem?')).toBe('*Edson Cleubert:*\nOlá, tudo bem?') })
  it('sem nome ou sem texto não assina', () => { expect(signText('', 'oi')).toBe('oi'); expect(signText('Ana', '')).toBe('') })
  it('remove marcações que quebrariam o negrito', () => { expect(signText('Ana *Maria*', 'oi')).toBe('*Ana Maria:*\noi') })
})
describe('parser de mensagens', () => {
  it('texto simples e estendido', () => {
    expect(parseMessage({ conversation: 'oi' })).toMatchObject({ kind: 'text', text: 'oi' })
    expect(parseMessage({ extendedTextMessage: { text: 'link' } }).text).toBe('link')
  })
  it('imagem com legenda', () => { expect(parseMessage({ imageMessage: { caption: 'olha', mimetype: 'image/png' } })).toMatchObject({ kind: 'image', text: 'olha', hasMedia: true, mime: 'image/png' }) })
  it('áudio normal x mensagem de voz', () => {
    expect(parseMessage({ audioMessage: { ptt: true } }).kind).toBe('voice')
    expect(parseMessage({ audioMessage: { ptt: false } }).kind).toBe('audio')
  })
  it('documento dentro de wrapper', () => {
    const r = parseMessage({ documentWithCaptionMessage: { message: { documentMessage: { fileName: 'orcamento.pdf', caption: 'segue', mimetype: 'application/pdf' } } } })
    expect(r).toMatchObject({ kind: 'document', fileName: 'orcamento.pdf', text: 'segue' })
  })
  it('mensagem temporária e visualização única', () => {
    expect(parseMessage({ ephemeralMessage: { message: { conversation: 'efêmera' } } }).text).toBe('efêmera')
    expect(parseMessage({ viewOnceMessageV2: { message: { imageMessage: {} } } }).kind).toBe('image')
  })
  it('localização e contato', () => {
    expect(parseMessage({ locationMessage: { degreesLatitude: -23.5, degreesLongitude: -46.6, name: 'Casa' } })).toMatchObject({ kind: 'location', lat: -23.5, lng: -46.6, text: 'Casa' })
    expect(parseMessage({ contactMessage: { displayName: 'João', vcard: 'TEL;type=CELL:+55 11 98888-0000' } }).text).toContain('João')
  })
  it('ignora reações e protocolo', () => {
    expect(parseMessage({ reactionMessage: {} }).ignore).toBe(true)
    expect(parseMessage({ protocolMessage: {} }).ignore).toBe(true)
  })
  it('tipos desconhecidos viram aviso, não erro', () => { expect(parseMessage({ foo: 1 })).toMatchObject({ kind: 'other', text: expect.stringContaining('não suportado') }) })
  it('vcard e mime', () => {
    expect(vcard('Ana', '(11) 98888-7777')).toContain('waid=11988887777')
    expect(extFor('image/jpeg')).toBe('jpg'); expect(extFor(undefined, 'a.PDF')).toBe('pdf'); expect(mimeFor('x.mp3')).toBe('audio/mpeg')
  })
})
