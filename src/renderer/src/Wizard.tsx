import { useState } from 'react'
import type { BotConfig } from '@shared/types'
import { api, ConnectCard, Field, type AppState } from './ui'
import { EquipEditor, PickupEditor, ServicesEditor } from './pages/ConfigurarBot'

export function Wizard({ st, reload }: { st: AppState; reload: () => void }) {
  const [step, setStep] = useState(1)
  const [cfg, setCfg] = useState<BotConfig>(st.config)
  const [busy, setBusy] = useState(false)
  const b = cfg.business
  const setB = (p: Partial<typeof b>) => setCfg({ ...cfg, business: { ...b, ...p } })
  const persist = async () => { await api.saveConfig(cfg) }
  const next = async () => {
    await persist()
    if (step === 1 && st.wa.state === 'disconnected') void api.waConnect()
    setStep(step + 1)
  }
  const finish = async () => {
    setBusy(true)
    await api.saveConfig({ ...cfg, behavior: { ...cfg.behavior, enabled: true } })
    await api.finishSetup(); reload()
  }
  return <div className="wiz">
    <div className="brand"><i>💬</i>Bem-vindo ao AssistBot</div>
    <div className="steps">{[1, 2, 3, 4].map((n) => <div key={n} className={n <= step ? 'on' : ''} />)}</div>
    {step === 1 && <div className="card"><h1>1. Dados da assistência</h1><p className="sub">Essas informações aparecem nas mensagens enviadas aos clientes.</p>
      <Field label="Nome da assistência"><input type="text" value={b.name} onChange={(e) => setB({ name: e.target.value })} /></Field>
      <Field label="Endereço"><input type="text" value={b.address} placeholder="Rua, número, bairro, cidade" onChange={(e) => setB({ address: e.target.value })} /></Field>
      <Field label="Horário de funcionamento" hint="Texto que o cliente vai ler. Você ajusta os dias e horas exatos depois em Configurar bot."><input type="text" value={b.hoursText} onChange={(e) => setB({ hoursText: e.target.value })} /></Field>
      <Field label="Telefone de contato"><input type="text" value={b.phone} placeholder="(00) 00000-0000" onChange={(e) => setB({ phone: e.target.value })} /></Field></div>}
    {step === 2 && <div className="card"><h1>2. Conectar o WhatsApp</h1><p className="sub">Use o número da assistência. Recomendamos um chip dedicado ao negócio.</p><ConnectCard wa={st.wa} />
      {st.wa.state === 'connected' && <p className="mute">Perfeito! Pode seguir para o próximo passo.</p>}</div>}
    {step === 3 && <div className="card"><h1>3. Configurar atendimento</h1><p className="sub">Já deixamos tudo preparado. Marque só o que a sua assistência faz.</p>
      <h2>Equipamentos que você conserta</h2><EquipEditor cfg={cfg} set={setCfg} />
      <h2 style={{ marginTop: 20 }}>Serviços oferecidos</h2><ServicesEditor cfg={cfg} set={setCfg} />
      <h2 style={{ marginTop: 20 }}>Coleta</h2><PickupEditor cfg={cfg} set={setCfg} /></div>}
    {step === 4 && <div className="card"><h1>4. Finalizar</h1><p className="sub">Confira o resumo. Você poderá mudar tudo depois.</p>
      <p><b>{b.name}</b><br />{b.address || 'Endereço não informado'}<br />{b.hoursText}<br />{b.phone}</p>
      <p>📱 WhatsApp: <b>{st.wa.state === 'connected' ? 'conectado' : 'ainda não conectado'}</b>{st.wa.state !== 'connected' && ' (você pode conectar depois em Configurações)'}</p>
      <p>🔧 Equipamentos: {cfg.equipmentTypes.map((e) => e.name).join(', ') || '—'}</p><p>🛠️ Serviços: {cfg.services.map((e) => e.name).join(', ') || '—'}</p>
      <p>📦 Coleta: {cfg.pickup.enabled ? 'sim' : 'não'}</p>
      <div className="banner g">O AssistBot abre junto com o Windows e continua funcionando perto do relógio. Mantenha o computador ligado e com internet.</div>
      <div style={{ textAlign: 'center', marginTop: 12 }}><button className="btn pri big" disabled={busy} onClick={finish}>Ativar atendimento automático</button></div></div>}
    {step < 4 && <div className="row" style={{ marginTop: 8 }}>
      {step > 1 ? <button className="btn fit" onClick={() => setStep(step - 1)}>← Voltar</button> : <span />}
      <span /><button className="btn pri fit" onClick={next}>{step === 2 && st.wa.state !== 'connected' ? 'Pular por enquanto →' : 'Continuar →'}</button></div>}
    {step === 4 && <div className="row"><button className="btn fit" onClick={() => setStep(3)}>← Voltar</button><span /></div>}
  </div>
}
