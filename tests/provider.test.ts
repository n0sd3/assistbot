import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG } from '../src/shared/defaults'
import { LlamaProvider } from '../src/main/ai/provider'

const fake = (r: unknown) => new LlamaProvider({ chatJson: async () => r } as never, () => true)

describe('provedor de IA (validação das respostas do modelo)', () => {
  it('só aceita opção existente', async () => {
    expect((await fake({ intent: 'answer', value: 'Conserto', reply: '' }).interpret({ question: 'q', options: ['Conserto'], text: 'x', cfg: DEFAULT_CONFIG }))?.value).toBe('Conserto')
    expect((await fake({ intent: 'answer', value: 'Inventado', reply: '' }).interpret({ question: 'q', options: ['Conserto'], text: 'x', cfg: DEFAULT_CONFIG }))?.intent).toBe('other')
  })
  it('pergunta sem resposta vira transferência humana', async () => {
    expect((await fake({ intent: 'question', value: '', reply: '' }).interpret({ question: 'q', text: 'x', cfg: DEFAULT_CONFIG }))?.intent).toBe('human')
  })
  it('prefill descarta valores fora das listas', async () => {
    const r = await fake({ name: 'Ana', service: 'Voar', equipment: 'Notebook', brand: 'Dell XPS', problem: 'não liga' }).prefill('oi sou a Ana', DEFAULT_CONFIG)
    expect(r).toEqual({ name: 'Ana', equipment: 'Notebook', brand: 'Dell XPS', problem: 'não liga' })
  })
  it('falha da IA não derruba o bot', async () => {
    const p = new LlamaProvider({ chatJson: async () => { throw new Error('x') } } as never, () => true)
    expect(await p.interpret({ question: 'q', text: 'x', cfg: DEFAULT_CONFIG })).toBeUndefined()
  })
})
