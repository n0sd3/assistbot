import type { BotConfig } from '@shared/types'
import type { LlamaServer } from './server'
import { norm } from '../bot/engine'

export interface Interpretation { intent: 'answer' | 'question' | 'human' | 'other'; value: string; reply: string }
export interface Prefill { name: string; service: string; equipment: string; brand: string; problem: string }

/** Contrato de IA: o bot só depende disto. Trocar de modelo/provedor não afeta o restante. */
export interface AiProvider {
  ready(): boolean
  interpret(i: { question: string; options?: string[]; text: string; cfg: BotConfig }): Promise<Interpretation | undefined>
  prefill(text: string, cfg: BotConfig): Promise<Partial<Prefill> | undefined>
}

const businessFacts = (cfg: BotConfig): string =>
  `Nome: ${cfg.business.name}. Endereço: ${cfg.business.address || 'não informado'}. Horário: ${cfg.business.hoursText}. Telefone: ${cfg.business.phone || 'não informado'}. ` +
  `Serviços: ${cfg.services.map((s) => s.name).join(', ')}. Equipamentos: ${cfg.equipmentTypes.map((s) => s.name).join(', ')}. ` +
  (cfg.pickup.enabled ? 'Faz coleta (busca o aparelho).' : 'Não faz coleta.')

const INTERPRET_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['intent', 'value', 'reply'],
  properties: { intent: { type: 'string', enum: ['answer', 'question', 'human', 'other'] }, value: { type: 'string' }, reply: { type: 'string' } }
}
const PREFILL_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['name', 'service', 'equipment', 'brand', 'problem'],
  properties: { name: { type: 'string' }, service: { type: 'string' }, equipment: { type: 'string' }, brand: { type: 'string' }, problem: { type: 'string' } }
}

export class LlamaProvider implements AiProvider {
  constructor(private server: LlamaServer, private isReady: () => boolean) {}
  ready(): boolean { return this.isReady() }

  async interpret({ question, options, text, cfg }: { question: string; options?: string[]; text: string; cfg: BotConfig }): Promise<Interpretation | undefined> {
    const sys = `Você é o assistente de triagem do WhatsApp de uma assistência técnica. Dados da loja: ${businessFacts(cfg)}\n` +
      `Pergunta feita ao cliente: "${question.split('\n')[0]}"\n` + (options ? `Opções válidas: ${options.join(' | ')}\n` : '') +
      `Classifique a mensagem do cliente e responda SOMENTE em JSON:\n` +
      `- intent "answer": respondeu à pergunta. "value" = ${options ? 'a opção válida EXATA mais adequada' : 'a resposta limpa (ex.: só o nome da pessoa)'}; "reply" vazio.\n` +
      `- intent "question": fez uma pergunta sobre a loja. "reply" = resposta curta em português usando APENAS os dados da loja. Se a informação não estiver nos dados, use intent "human".\n` +
      `- intent "human": quer falar com uma pessoa, reclamou ou pediu algo que você não sabe.\n- intent "other": nenhum dos casos. "value" e "reply" vazios nos casos não aplicáveis.\n` +
      `REGRA: se o cliente apenas forneceu a informação pedida, mesmo de modo informal, com gírias ou frases extras, use SEMPRE "answer". Use "human" só se pedir uma pessoa/reclamar ou perguntar algo fora dos dados da loja.\n` +
      `Exemplo: pergunta de nome, cliente "fala, aqui é o Zé Carlos da padaria" => {"intent":"answer","value":"Zé Carlos","reply":""}.`
    try {
      const r = await this.server.chatJson<Interpretation>(sys, text.slice(0, 600), INTERPRET_SCHEMA)
      if (r.intent === 'answer' && options) {
        const hit = options.find((o) => norm(o) === norm(r.value))
        if (!hit) return { intent: 'other', value: '', reply: '' }
        r.value = hit
      }
      if (r.intent === 'answer' && !r.value.trim()) return { intent: 'other', value: '', reply: '' }
      if (r.intent === 'question' && !r.reply.trim()) return { intent: 'human', value: '', reply: '' }
      return r
    } catch { return undefined }
  }

  async prefill(text: string, cfg: BotConfig): Promise<Partial<Prefill> | undefined> {
    const sys = `Extraia dados da primeira mensagem de um cliente de assistência técnica. Responda SOMENTE em JSON; use string vazia quando a informação não aparecer.\n` +
      `name: nome da pessoa se ela se apresentou. service: um destes: ${cfg.services.map((s) => s.name).join(' | ')}. equipment: um destes: ${cfg.equipmentTypes.map((s) => s.name).join(' | ')}. ` +
      `brand: marca e modelo do aparelho. problem: resumo curto do defeito relatado.`
    try {
      const r = await this.server.chatJson<Prefill>(sys, text.slice(0, 800), PREFILL_SCHEMA, 45_000, 160)
      const out: Partial<Prefill> = {}
      const rs = norm(r.service); const sv = rs ? cfg.services.find((s) => norm(s.name) === rs || (rs.length >= 5 && norm(s.name).includes(rs))) : undefined; if (sv) out.service = sv.name
      const eq = cfg.equipmentTypes.find((s) => norm(s.name) === norm(r.equipment)); if (eq) out.equipment = eq.name
      if (r.name && /^[\p{L}' .-]{2,40}$/u.test(r.name)) out.name = r.name.trim()
      if (r.brand?.trim().length >= 2 && eq?.askBrand) out.brand = r.brand.trim()
      if (r.problem?.trim().length >= 3) out.problem = r.problem.trim()
      return out
    } catch { return undefined }
  }
}
