import type { BotConfig, EngineResult, Session, FollowUp } from '@shared/types'

export const norm = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

const hasWord = (text: string, kw: string): boolean => {
  const k = norm(kw)
  return k.length > 0 && (' ' + text + ' ').includes(' ' + k + ' ')
}

export function newSession(now: number): Session {
  return { step: 'start', data: {}, followUps: {}, followUpIndex: 0, lastActivity: now }
}

export function isOpenNow(cfg: BotConfig, d: Date): boolean {
  const s = cfg.schedule[d.getDay()]
  if (!s || !s.open) return false
  const cur = d.getHours() * 60 + d.getMinutes()
  const [fh, fm] = s.from.split(':').map(Number)
  const [th, tm] = s.to.split(':').map(Number)
  return cur >= fh * 60 + fm && cur < th * 60 + tm
}

/** Escolhe um item de uma lista por número ("2") ou por texto (parcial, sem acentos). */
export function pickOption<T>(text: string, items: T[], label: (t: T) => string, kws?: (t: T) => string[]): T | undefined {
  const n = norm(text)
  if (/^\d{1,2}$/.test(n)) {
    const i = parseInt(n, 10) - 1
    if (i >= 0 && i < items.length) return items[i]
  }
  for (const it of items) if (n === norm(label(it))) return it
  for (const it of items) {
    const l = norm(label(it))
    if (l.length >= 3 && (n.includes(l) || (n.length >= 4 && l.includes(n)))) return it
  }
  if (kws) for (const it of items) if (kws(it).some((k) => hasWord(n, k))) return it
  return undefined
}

const list = (items: string[]) => items.map((x, i) => `${i + 1}. ${x}`).join('\n')

export function extractName(text: string): string | undefined {
  let t = text.trim().replace(/[.!,;:]+$/g, '')
  t = t.replace(/^(oi|ola|ol[aá]|bom dia|boa tarde|boa noite)[,!\s]+/i, '')
  t = t.replace(/^(meu nome (e|é)|me chamo|sou (o|a)?|aqui (e|é) (o|a)?|pode me chamar de|eu sou (o|a)?|nome[:\s])\s*/i, '')
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length === 0 || words.length > 5) return undefined
  if (!words.every((w) => /^[\p{L}'.-]{1,30}$/u.test(w))) return undefined
  if (words.join('').length < 2) return undefined
  return words.map((w) => w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1)).join(' ')
}

function applicableFollowUps(cfg: BotConfig, data: Record<string, string>): FollowUp[] {
  return cfg.followUps.filter(
    (f) => (f.equipments.length === 0 || f.equipments.includes(data.equipment)) && (f.services.length === 0 || f.services.includes(data.service))
  )
}

/** Determina o próximo passo que falta, evitando perguntar o que já foi respondido. */
export function nextStep(s: Session, cfg: BotConfig): string {
  const d = s.data
  if (!d.name) return 'name'
  if (!d.service) return 'service'
  const svc = cfg.services.find((x) => x.name === d.service)
  if (svc && svc.name && !svc.askPickup && /andamento/i.test(svc.name)) {
    return d.problem ? 'confirm' : 'problem'
  }
  if (!d.equipment) return 'equipment'
  const eq = cfg.equipmentTypes.find((x) => x.name === d.equipment)
  if (eq?.askBrand && !d.brand) return 'brand'
  if (!d.problem) return 'problem'
  const fus = applicableFollowUps(cfg, d)
  if (fus.some((f) => !(f.id in s.followUps))) return 'followup'
  if (cfg.pickup.enabled && svc?.askPickup !== false) {
    if (!d.pickup) return 'pickup'
    const opt = cfg.pickup.options.find((o) => o.label === d.pickup)
    if (opt?.needsAddress) {
      if (!d.address) return 'address'
      if (!d.availability) return 'availability'
    }
  }
  return 'confirm'
}

function fill(t: string, cfg: BotConfig, s: Session, extra: Record<string, string> = {}): string {
  const vars: Record<string, string> = {
    empresa: cfg.business.name, nome: s.data.name ?? '', horario: cfg.business.hoursText,
    equipamento: (s.data.equipment ?? 'aparelho').toLowerCase(), endereco: cfg.business.address,
    telefone: cfg.business.phone, ...extra
  }
  return t.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
}

export function summaryText(s: Session, cfg: BotConfig): string {
  const d = s.data
  const rows: [string, string | undefined][] = [
    ['Nome', d.name], ['Serviço', d.service], ['Equipamento', d.equipment], ['Marca/modelo', d.brand],
    ['Problema', d.problem]
  ]
  for (const f of cfg.followUps) if (s.followUps[f.id]) rows.push([f.text.replace(/\?.*$/, ''), s.followUps[f.id]])
  rows.push(['Entrega', d.pickup], ['Endereço', d.address], ['Disponibilidade', d.availability])
  return rows.filter(([, v]) => v).map(([k, v]) => `• *${k}:* ${v}`).join('\n')
}

function question(step: string, s: Session, cfg: BotConfig): string {
  const m = cfg.messages
  switch (step) {
    case 'name': return fill(m.askName, cfg, s)
    case 'service': return fill(m.askService, cfg, s, { opcoes: list(cfg.services.map((x) => x.name)) })
    case 'equipment': return fill(m.askEquipment, cfg, s, { opcoes: list(cfg.equipmentTypes.map((x) => x.name)) })
    case 'brand': return fill(m.askBrand, cfg, s)
    case 'problem': return fill(m.askProblem, cfg, s)
    case 'followup': {
      const f = applicableFollowUps(cfg, s.data).find((x) => !(x.id in s.followUps))
      return f ? f.text : ''
    }
    case 'pickup': return fill(m.askPickup, cfg, s, { opcoes: list(cfg.pickup.options.map((x) => x.label)) })
    case 'address': return fill(m.askAddress, cfg, s)
    case 'availability': return fill(m.askAvailability, cfg, s)
    case 'confirm': return fill(m.confirm, cfg, s, { resumo: summaryText(s, cfg) })
    default: return ''
  }
}

const CORRECTABLE: [string, string][] = [
  ['name', 'Nome'], ['service', 'Serviço'], ['equipment', 'Equipamento'], ['brand', 'Marca/modelo'],
  ['problem', 'Problema'], ['pickup', 'Entrega'], ['address', 'Endereço'], ['availability', 'Disponibilidade']
]

/** Procura palavras-chave de serviço/equipamento em texto livre (ex.: "quero trocar a tela do meu iPhone"). */
function opportunistic(s: Session, text: string, cfg: BotConfig): void {
  const n = norm(text)
  if (!s.data.service && n.length > 3) {
    const sv = cfg.services.find((x) => x.keywords.some((k) => hasWord(n, k)))
    if (sv) s.data.service = sv.name
  }
  if (!s.data.equipment && n.length > 2) {
    const eq = cfg.equipmentTypes.find((x) => x.keywords.some((k) => hasWord(n, k)))
    if (eq) s.data.equipment = eq.name
  }
}

export interface Ctx { cfg: BotConfig; now: number; knownName?: string; open: boolean; prefill?: Record<string, string> }

/** Pergunta atual e opções válidas (usado pela IA para interpretar respostas livres). */
export function stepInfo(s: Session, cfg: BotConfig): { step: string; question: string; options?: string[] } {
  const options = s.step === 'service' ? cfg.services.map((x) => x.name) : s.step === 'equipment' ? cfg.equipmentTypes.map((x) => x.name)
    : s.step === 'pickup' ? cfg.pickup.options.map((x) => x.label) : undefined
  return { step: s.step, question: question(s.step, s, cfg), options }
}

export function processMessage(prev: Session | null, text: string, ctx: Ctx): EngineResult {
  const { cfg, now } = ctx
  let s: Session = prev ? { ...prev, data: { ...prev.data }, followUps: { ...prev.followUps } } : newSession(now)
  const replies: string[] = []
  const t = text.trim()
  const n = norm(t)
  let wasInvalid = false
  const result = (event: EngineResult['event'] = 'none'): EngineResult => {
    s.lastActivity = now
    return { session: s, replies, event, invalid: wasInvalid }
  }

  // sessão expirada -> recomeça
  if (prev && now - prev.lastActivity > cfg.behavior.sessionExpireHours * 3600_000) s = newSession(now)

  // pedido explícito de atendente humano
  if (cfg.handoff.keywords.some((k) => hasWord(n, k))) {
    replies.push(fill(cfg.messages.handoff, cfg, s))
    s.step = 'handoff'
    return result('handoff')
  }
  if (s.step === 'handoff' || s.step === 'done') s = newSession(now)

  const isNew = s.step === 'start'
  const wasIdle = !isNew && now - prev!.lastActivity > cfg.behavior.resumeAfterMinutes * 60_000

  if (isNew) {
    replies.push(fill(cfg.messages.greeting, cfg, s))
    if (!ctx.open) {
      replies.push(fill(cfg.messages.outOfHours, cfg, s))
      s.outOfHoursNotified = true
      if (cfg.behavior.outOfHoursMode === 'message_only') {
        s.step = 'done'
        return result('none')
      }
    }
    if (ctx.knownName) s.data.name = ctx.knownName
    if (ctx.prefill) for (const [k, v] of Object.entries(ctx.prefill)) if (v && !s.data[k]) s.data[k] = v
    opportunistic(s, t, cfg)
    // o primeiro "oi" não é resposta a nenhuma pergunta
    s.step = nextStep(s, cfg)
    const q = question(s.step, s, cfg)
    if (q) replies.push(q)
    return result()
  }

  if (wasIdle) replies.push(fill(cfg.messages.resume, cfg, s))

  // correção
  if (s.step !== 'correct_pick' && s.step !== 'confirm' && /^(corrigir|errei|voltar|alterar|mudar)\b/.test(n)) {
    s.step = 'correct_pick'
    replies.push(fill(cfg.messages.correctPrompt, cfg, s, { opcoes: list(CORRECTABLE.filter(([k]) => s.data[k]).map(([, l]) => l)) }))
    return result()
  }

  const invalid = () => { wasInvalid = true; replies.push(fill(cfg.messages.invalid, cfg, s)); const q = question(s.step, s, cfg); if (q) replies.push(q); return result() }
  const advance = (): EngineResult => {
    if (s.correcting) { s.correcting = undefined; s.step = 'confirm' } else s.step = nextStep(s, cfg)
    const q = question(s.step, s, cfg)
    if (q) replies.push(q)
    return result()
  }

  switch (s.step) {
    case 'correct_pick': {
      const avail = CORRECTABLE.filter(([k]) => s.data[k])
      const it = pickOption(t, avail, (x) => x[1])
      if (!it) return invalid()
      const [key] = it
      delete s.data[key]
      if (key === 'problem') s.followUps = {}
      s.correcting = key
      s.step = key
      replies.push(question(key, s, cfg))
      return result()
    }
    case 'name': {
      const nm = extractName(t)
      if (!nm) return invalid()
      s.data.name = nm
      opportunistic(s, t, cfg)
      return advance()
    }
    case 'service': {
      const sv = pickOption(t, cfg.services, (x) => x.name, (x) => x.keywords)
      if (!sv) return invalid()
      s.data.service = sv.name
      opportunistic(s, t, cfg)
      return advance()
    }
    case 'equipment': {
      const eq = pickOption(t, cfg.equipmentTypes, (x) => x.name, (x) => x.keywords)
      if (!eq) {
        // texto livre: guarda como "Outro" se existir tipo sem palavras-chave
        const other = cfg.equipmentTypes.find((x) => x.keywords.length === 0)
        if (other && n.length >= 3) { s.data.equipment = other.name; s.data.brand = t; return advance() }
        return invalid()
      }
      s.data.equipment = eq.name
      return advance()
    }
    case 'brand': {
      if (n.length < 2) return invalid()
      s.data.brand = t
      return advance()
    }
    case 'problem': {
      if (n.length < 3) return invalid()
      s.data.problem = t
      opportunistic(s, t, cfg)
      return advance()
    }
    case 'followup': {
      const f = applicableFollowUps(cfg, s.data).find((x) => !(x.id in s.followUps))
      if (f) s.followUps[f.id] = t
      return advance()
    }
    case 'pickup': {
      const op = pickOption(t, cfg.pickup.options, (x) => x.label, (x) => (x.needsAddress ? ['buscar', 'busquem', 'coleta', 'retirar', 'buscar'] : ['levar', 'levo', 'loja', 'ai']))
      if (!op) return invalid()
      s.data.pickup = op.label
      return advance()
    }
    case 'address': {
      if (n.length < 8) return invalid()
      s.data.address = t
      return advance()
    }
    case 'availability': {
      if (n.length < 2) return invalid()
      s.data.availability = t
      return advance()
    }
    case 'confirm': {
      if (/^(sim|s|ok|isso|certo|confirmo|pode|correto|tudo certo|esta certo|1)$/.test(n) || /\b(sim|confirm|pode enviar|tudo certo|esta certo)\b/.test(n)) {
        replies.push(fill(cfg.messages.closing, cfg, s))
        s.step = 'done'
        return result('completed')
      }
      if (/^(nao|n|corrigir|errado|alterar|2)\b/.test(n)) {
        s.step = 'correct_pick'
        replies.push(fill(cfg.messages.correctPrompt, cfg, s, { opcoes: list(CORRECTABLE.filter(([k]) => s.data[k]).map(([, l]) => l)) }))
        return result()
      }
      return invalid()
    }
    default: {
      s.step = nextStep(s, cfg)
      replies.push(question(s.step, s, cfg))
      return result()
    }
  }
}
