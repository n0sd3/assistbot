import type { AppState } from '../ui'
import { api, Toggle, fmtDate } from '../ui'

export function Inicio({ st, go, reload }: { st: AppState; go: (t: string) => void; reload: () => void }) {
  const { wa, config, summary, system } = st
  const connected = wa.state === 'connected'
  return <div>
    <h1>Início</h1><p className="sub">Veja como está o atendimento da {config.business.name} agora.</p>
    {!connected && <div className="banner r">⚠️ O WhatsApp está desconectado e o bot não consegue responder.
      <button className="btn" onClick={() => go('config')}>Reconectar</button></div>}
    {connected && !config.behavior.enabled && <div className="banner a">O WhatsApp está conectado, mas o atendimento automático está <b>desligado</b>.</div>}
    {system.botActive && <div className="banner g">🟢 Atendimento automático ligado. Mantenha o computador ligado e com internet.</div>}
    {system.offlineGaps[0] && <div className="banner a">🕒 O computador/aplicativo ficou indisponível entre {fmtDate(system.offlineGaps[0].from)} e {fmtDate(system.offlineGaps[0].to)}. Nesse período o bot não respondeu.</div>}
    <div className="card row">
      <div><h2>Atendimento automático</h2><span className="mute">{config.behavior.enabled ? 'O bot responde os clientes sozinho.' : 'O bot não responde ninguém enquanto estiver desligado.'}</span></div>
      <div className="fit"><Toggle on={config.behavior.enabled} onChange={async (v) => { await api.setBotEnabled(v); reload() }} /></div>
    </div>
    <div className="grid g4">
      <div className="card stat">{summary.newRequests}<small>Solicitações novas</small></div>
      <div className="card stat">{summary.openPickups}<small>Coletas em aberto</small></div>
      <div className="card stat">{summary.needsHuman}<small>Conversas com atendente</small></div>
      <div className="card stat">{summary.conversationsToday}<small>Conversas hoje</small></div>
    </div>
    <div className="grid g2">
      <div className="card"><h2>WhatsApp</h2>
        <p><span className={'pill ' + (connected ? 'p-g' : 'p-r')}>{connected ? 'Conectado' : wa.state === 'connecting' ? 'Conectando…' : 'Desconectado'}</span> {wa.phone && <span className="mute">número {wa.phone}</span>}</p>
        {!connected && <button className="btn pri" onClick={() => go('config')}>Conectar agora</button>}</div>
      <div className="card"><h2>Próximos passos</h2>
        <p className="mute">Quando alguém pedir um atendente, a conversa aparece em <b>Atendimentos</b> com aviso na bandeja do Windows. Novas solicitações ficam em <b>Atendimentos › Solicitações</b>.</p>
        <button className="btn" onClick={() => go('atend')}>Ver atendimentos</button></div>
    </div>
  </div>
}
