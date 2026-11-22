import { useState } from 'react'
import type { BotConfig } from '@shared/types'
import { DEFAULT_CONFIG } from '@shared/defaults'
import { api, Field, Setting, StrList, Toggle, useAsk, useToast, type AppState } from '../ui'

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
type P = { cfg: BotConfig; set: (c: BotConfig) => void }
const kw = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

export function EquipEditor({ cfg, set }: P) {
  const [dlg, ask] = useAsk()
  const toggle = (name: string) => {
    const has = cfg.equipmentTypes.some((e) => e.name === name)
    const base = DEFAULT_CONFIG.equipmentTypes.find((e) => e.name === name) ?? { name, keywords: [], askBrand: true }
    set({ ...cfg, equipmentTypes: has ? cfg.equipmentTypes.filter((e) => e.name !== name) : [...cfg.equipmentTypes, base] })
  }
  const names = [...new Set([...DEFAULT_CONFIG.equipmentTypes.map((e) => e.name), ...cfg.equipmentTypes.map((e) => e.name)])]
  return <div><div className="chips">{names.map((n) => <button key={n} className={'chip' + (cfg.equipmentTypes.some((e) => e.name === n) ? ' on' : '')} onClick={() => toggle(n)}>{n}</button>)}</div>
    <details style={{ marginTop: 12 }}><summary>Editar detalhes (palavras que o cliente costuma usar)</summary>
      {cfg.equipmentTypes.map((e, i) => <div key={e.name} className="item" style={{ flexWrap: 'wrap' }}>
        <b style={{ width: 150 }}>{e.name}</b>
        <input type="text" value={e.keywords.join(', ')} placeholder="palavras separadas por vírgula" onChange={(ev) => set({ ...cfg, equipmentTypes: cfg.equipmentTypes.map((x, j) => (j === i ? { ...x, keywords: kw(ev.target.value) } : x)) })} />
        <label style={{ margin: 0, fontWeight: 400 }}><input type="checkbox" checked={e.askBrand} onChange={(ev) => set({ ...cfg, equipmentTypes: cfg.equipmentTypes.map((x, j) => (j === i ? { ...x, askBrand: ev.target.checked } : x)) })} /> perguntar marca/modelo</label></div>)}
      <button className="btn" onClick={async () => { const r = await ask('Novo tipo de equipamento', [{ key: 'n', label: 'Nome do equipamento' }]); const n = r?.n?.trim(); if (n) set({ ...cfg, equipmentTypes: [...cfg.equipmentTypes, { name: n, keywords: [], askBrand: true }] }) }}>+ Novo tipo</button></details>{dlg}</div>
}
export function ServicesEditor({ cfg, set }: P) {
  const [dlg, ask] = useAsk()
  const names = [...new Set([...DEFAULT_CONFIG.services.map((e) => e.name), ...cfg.services.map((e) => e.name)])]
  const toggle = (name: string) => {
    const has = cfg.services.some((e) => e.name === name)
    const base = DEFAULT_CONFIG.services.find((e) => e.name === name) ?? { name, keywords: [], askPickup: true }
    set({ ...cfg, services: has ? cfg.services.filter((e) => e.name !== name) : [...cfg.services, base] })
  }
  return <div><div className="chips">{names.map((n) => <button key={n} className={'chip' + (cfg.services.some((e) => e.name === n) ? ' on' : '')} onClick={() => toggle(n)}>{n}</button>)}</div>
    <button className="btn" style={{ marginTop: 10 }} onClick={async () => { const r = await ask('Novo serviço', [{ key: 'n', label: 'Nome do serviço' }]); const n = r?.n?.trim(); if (n) set({ ...cfg, services: [...cfg.services, { name: n, keywords: [], askPickup: true }] }) }}>+ Novo serviço</button>{dlg}</div>
}
export function PickupEditor({ cfg, set }: P) {
  return <div><Setting title="Oferecer coleta (buscar o aparelho)" desc="O bot pergunta se o cliente vai levar ou se quer que busquem."><Toggle on={cfg.pickup.enabled} onChange={(v) => set({ ...cfg, pickup: { ...cfg.pickup, enabled: v } })} /></Setting>
    {cfg.pickup.enabled && cfg.pickup.options.map((o, i) => <div className="item" key={i}>
      <input type="text" value={o.label} onChange={(e) => set({ ...cfg, pickup: { ...cfg.pickup, options: cfg.pickup.options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) } })} />
      <label style={{ margin: 0, fontWeight: 400, whiteSpace: 'nowrap' }}><input type="checkbox" checked={o.needsAddress} onChange={(e) => set({ ...cfg, pickup: { ...cfg.pickup, options: cfg.pickup.options.map((x, j) => (j === i ? { ...x, needsAddress: e.target.checked } : x)) } })} /> pedir endereço</label>
      <button className="x" onClick={() => set({ ...cfg, pickup: { ...cfg.pickup, options: cfg.pickup.options.filter((_, j) => j !== i) } })}>✕</button></div>)}
    {cfg.pickup.enabled && <button className="btn" onClick={() => set({ ...cfg, pickup: { ...cfg.pickup, options: [...cfg.pickup.options, { label: '', needsAddress: false }] } })}>+ Opção</button>}</div>
}

const MSG: [keyof BotConfig['messages'], string, string][] = [
  ['greeting', 'Mensagem inicial', 'Use {empresa} para o nome da assistência.'],
  ['askName', 'Pergunta do nome', ''], ['askService', 'Pergunta do serviço', 'Use {opcoes} para a lista numerada e {nome}.'],
  ['askEquipment', 'Pergunta do equipamento', 'Use {opcoes}.'], ['askBrand', 'Pergunta de marca e modelo', 'Use {equipamento}.'],
  ['askProblem', 'Pergunta do problema', ''], ['askPickup', 'Pergunta de entrega/coleta', 'Use {opcoes}.'],
  ['askAddress', 'Pergunta do endereço', ''], ['askAvailability', 'Pergunta de disponibilidade', ''],
  ['confirm', 'Confirmação', 'Use {resumo} para o resumo dos dados.'],
  ['closing', 'Mensagem final', 'Use {nome} e {horario}.'], ['outOfHours', 'Resposta fora do expediente', 'Use {horario}.'],
  ['handoff', 'Ao chamar um atendente', ''], ['resume', 'Ao retomar conversa parada', ''], ['invalid', 'Quando não entender', ''],
  ['mediaReceived', 'Quando o cliente envia foto/arquivo', 'Use {tipo} (foto, vídeo, documento…).'], ['audioReceived', 'Quando o cliente envia áudio', 'O bot ainda não entende áudios.']
]

export function ConfigurarBot({ st, reload }: { st: AppState; reload: () => void }) {
  const [cfg, setCfg] = useState<BotConfig>(st.config)
  const [tab, setTab] = useState('msgs')
  const [dirty, setDirty] = useState(false)
  const [toast, say] = useToast()
  const set = (c: BotConfig) => { setCfg(c); setDirty(true) }
  const save = async () => { await api.saveConfig(cfg); setDirty(false); say('Alterações salvas!'); reload() }
  const T = ([['msgs', 'Mensagens'], ['q', 'Perguntas'], ['eq', 'Equipamentos e serviços'], ['hrs', 'Horários'], ['pick', 'Coleta'], ['quick', 'Respostas rápidas'], ['beh', 'Comportamento']] as const)
  return <div>
    <h1>Configurar bot</h1><p className="sub">Tudo o que o bot fala e pergunta. Nada de programação: é só editar os textos.</p>
    <div className="tabs">{T.map(([k, l]) => <button key={k} className={'tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>)}</div>
    <div className="card">
      {tab === 'msgs' && <>{MSG.map(([k, l, h]) => <Field key={k} label={l} hint={h}><textarea value={cfg.messages[k]} onChange={(e) => set({ ...cfg, messages: { ...cfg.messages, [k]: e.target.value } })} /></Field>)}
        <button className="btn" style={{ marginTop: 12 }} onClick={() => confirm('Voltar todas as mensagens ao padrão?') && set({ ...cfg, messages: DEFAULT_CONFIG.messages })}>Restaurar mensagens padrão</button></>}
      {tab === 'q' && <><p className="mute">Perguntas extras feitas depois do problema. Pode limitar a certos equipamentos (deixe vazio para perguntar sempre).</p>
        {cfg.followUps.map((f, i) => <div key={f.id} className="card" style={{ background: '#fafafa' }}>
          <div className="item"><input type="text" value={f.text} onChange={(e) => set({ ...cfg, followUps: cfg.followUps.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
            <button className="x" onClick={() => set({ ...cfg, followUps: cfg.followUps.filter((_, j) => j !== i) })}>✕</button></div>
          <div className="chips">{cfg.equipmentTypes.map((e) => <button key={e.name} className={'chip' + (f.equipments.includes(e.name) ? ' on' : '')}
            onClick={() => set({ ...cfg, followUps: cfg.followUps.map((x, j) => (j === i ? { ...x, equipments: x.equipments.includes(e.name) ? x.equipments.filter((n) => n !== e.name) : [...x.equipments, e.name] } : x)) })}>{e.name}</button>)}</div>
          <div className="hint">{f.equipments.length ? 'Só para: ' + f.equipments.join(', ') : 'Para todos os equipamentos'}</div></div>)}
        <button className="btn" onClick={() => set({ ...cfg, followUps: [...cfg.followUps, { id: 'q' + Date.now(), text: '', equipments: [], services: [] }] })}>+ Nova pergunta</button></>}
      {tab === 'eq' && <><h2>Tipos de equipamento atendidos</h2><EquipEditor cfg={cfg} set={set} /><h2 style={{ marginTop: 24 }}>Serviços oferecidos</h2><ServicesEditor cfg={cfg} set={set} /></>}
      {tab === 'hrs' && <>
        <Field label="Nome da assistência"><input type="text" value={cfg.business.name} onChange={(e) => set({ ...cfg, business: { ...cfg.business, name: e.target.value } })} /></Field>
        <Field label="Horário (texto mostrado ao cliente)"><input type="text" value={cfg.business.hoursText} onChange={(e) => set({ ...cfg, business: { ...cfg.business, hoursText: e.target.value } })} /></Field>
        <label>Dias e horários de atendimento</label>
        {cfg.schedule.map((d, i) => <div className="item" key={i} style={{ alignItems: 'center' }}>
          <Toggle on={d.open} onChange={(v) => set({ ...cfg, schedule: cfg.schedule.map((x, j) => (j === i ? { ...x, open: v } : x)) })} /><span style={{ width: 90 }}>{DAYS[i]}</span>
          <input type="time" value={d.from} disabled={!d.open} onChange={(e) => set({ ...cfg, schedule: cfg.schedule.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) })} style={{ maxWidth: 130 }} />
          <span>até</span><input type="time" value={d.to} disabled={!d.open} onChange={(e) => set({ ...cfg, schedule: cfg.schedule.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) })} style={{ maxWidth: 130 }} /></div>)}
        <Field label="Fora do horário, o bot deve…"><select value={cfg.behavior.outOfHoursMode} onChange={(e) => set({ ...cfg, behavior: { ...cfg.behavior, outOfHoursMode: e.target.value as 'collect' | 'message_only' } })}>
          <option value="collect">Avisar que está fechado e mesmo assim anotar o pedido</option><option value="message_only">Só avisar que está fechado</option></select></Field></>}
      {tab === 'pick' && <><PickupEditor cfg={cfg} set={set} />
        <Field label="Endereço da loja" hint="Usado em {endereco} nas mensagens."><input type="text" value={cfg.business.address} onChange={(e) => set({ ...cfg, business: { ...cfg.business, address: e.target.value } })} /></Field></>}
      {tab === 'quick' && <><p className="mute">Textos prontos para você usar no chat com um clique (botão ⚡ ou digitando <b>/</b>). Use <b>{'{nome}'}</b> para o primeiro nome do cliente.</p>
        <StrList items={cfg.quickReplies} onChange={(v) => set({ ...cfg, quickReplies: v })} placeholder="Ex.: Olá {nome}, tudo bem?" /></>}
      {tab === 'beh' && <>
        <Field label="Palavras que chamam um atendente humano" hint="Se o cliente escrever alguma delas, o bot para e avisa você."><StrList items={cfg.handoff.keywords} onChange={(v) => set({ ...cfg, handoff: { ...cfg.handoff, keywords: v } })} /></Field>
        <Field label="Depois que um funcionário responder, o bot fica em silêncio por (minutos)"><input type="text" value={cfg.handoff.pauseMinutesAfterHuman} onChange={(e) => set({ ...cfg, handoff: { ...cfg.handoff, pauseMinutesAfterHuman: Number(e.target.value.replace(/\D/g, '')) || 0 } })} /></Field>
        <Field label="Considerar conversa parada após (minutos) e retomar com aviso"><input type="text" value={cfg.behavior.resumeAfterMinutes} onChange={(e) => set({ ...cfg, behavior: { ...cfg.behavior, resumeAfterMinutes: Number(e.target.value.replace(/\D/g, '')) || 1 } })} /></Field>
        <Field label="Recomeçar do zero uma conversa abandonada após (horas)"><input type="text" value={cfg.behavior.sessionExpireHours} onChange={(e) => set({ ...cfg, behavior: { ...cfg.behavior, sessionExpireHours: Number(e.target.value.replace(/\D/g, '')) || 1 } })} /></Field></>}
    </div>
    <div className="save"><button className="btn pri" disabled={!dirty} onClick={save}>Salvar alterações</button>{dirty && <span className="mute">Há alterações não salvas.</span>}</div>
    {toast}
  </div>
}
