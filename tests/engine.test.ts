import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG } from '../src/shared/defaults'
import { processMessage, extractName } from '../src/main/bot/engine'
import type { Session } from '../src/shared/types'

const cfg = DEFAULT_CONFIG
let now = 1_000_000
function talk(msgs: string[], s: Session | null = null, open = true) {
  const out: string[][] = []
  let ev = 'none'
  for (const m of msgs) {
    now += 1000
    const r = processMessage(s, m, { cfg, now, open })
    s = r.session; out.push(r.replies); ev = r.event
  }
  return { s: s!, out, ev }
}

describe('motor de triagem', () => {
  it('extrai nomes', () => {
    expect(extractName('meu nome é joão silva')).toBe('João Silva')
    expect(extractName('oi, sou a maria')).toBe('Maria')
    expect(extractName('quero trocar a tela do meu celular agora mesmo pf')).toBeUndefined()
  })
  it('fluxo completo com coleta', () => {
    const r = talk(['oi', 'Carlos', '2', '1', 'Samsung A54', 'não carrega', 'sim', 'não', 'sim', 'não', '2', 'Rua das Flores 123, Centro', 'amanhã à tarde', 'sim'])
    expect(r.ev).toBe('completed')
    expect(r.s.data).toMatchObject({ name: 'Carlos', service: 'Conserto', equipment: 'Celular', brand: 'Samsung A54', pickup: 'Quero que busquem (coleta)' })
  })
  it('não repete perguntas quando o texto já traz serviço e equipamento', () => {
    const r = talk(['oi quero consertar meu notebook', 'Ana'])
    expect(r.s.data.service).toBe('Conserto')
    expect(r.s.data.equipment).toBe('Notebook')
    expect(r.out[1].join(' ')).toContain('marca e o modelo')
  })
  it('pula perguntas de coleta quando loja', () => {
    const r = talk(['oi', 'Bia', '1', '3', 'tela quebrada', 'sim', 'não', 'sim', 'não', '1'])
    expect(r.s.step).toBe('confirm')
    expect(r.s.data.address).toBeUndefined()
  })
  it('permite correção', () => {
    const r = talk(['oi', 'Bia', '1', '3', 'x', 'tela quebrada', 'sim', 'não', 'sim', 'não', '1', 'corrigir', '1', 'Beatriz'])
    expect(r.s.data.name).toBe('Beatriz')
    expect(r.s.step).toBe('confirm')
  })
  it('transfere para humano', () => {
    const r = talk(['oi', 'quero falar com o atendente'])
    expect(r.ev).toBe('handoff')
  })
  it('retoma conversa interrompida', () => {
    const a = talk(['oi', 'Carlos'])
    now += 60 * 60_000
    const b = talk(['olá'], a.s)
    expect(b.out[0][0]).toContain('continuar de onde paramos')
  })
  it('fora do expediente avisa mas coleta', () => {
    const r = talk(['oi'], null, false)
    expect(r.out[0].join(' ')).toContain('fora do horário')
  })
})
