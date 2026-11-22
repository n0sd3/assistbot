import { useState } from 'react'
import { useAppState, api } from './ui'
import { Wizard } from './Wizard'
import { Inicio } from './pages/Inicio'
import { Atendimentos } from './pages/Atendimentos'
import { Coletas } from './pages/Coletas'
import { ConfigurarBot } from './pages/ConfigurarBot'
import { Configuracoes } from './pages/Configuracoes'

const TABS = [['inicio', '🏠', 'Início'], ['atend', '💬', 'Atendimentos'], ['coletas', '📦', 'Coletas'], ['bot', '🤖', 'Configurar bot'], ['config', '⚙️', 'Configurações']] as const

export function App() {
  const [st, reload] = useAppState()
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('inicio')
  if (!st) return <div className="main">Carregando…</div>
  if (!st.settings.setupDone) return <Wizard st={st} reload={reload} />
  const n = st.summary.needsHuman
  const active = st.system.botActive
  return <div className="app">
    <aside className="side">
      <div className="brand"><i>💬</i>AssistBot</div>
      {TABS.map(([k, ic, label]) => <button key={k} className={'nav' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>
        <span>{ic}</span>{label}{k === 'atend' && n > 0 && <span className="badge">{n}</span>}{k === 'coletas' && st.summary.openPickups > 0 && <span className="badge" style={{ background: '#2563eb' }}>{st.summary.openPickups}</span>}</button>)}
      <div className="foot">
        <div><span className={'pill ' + (active ? 'p-g' : 'p-x')}>{active ? '● Bot ativo' : '○ Bot parado'}</span></div>
        <div style={{ marginTop: 6 }}>Versão {st.system.version}</div>
      </div>
    </aside>
    <main className="main">
      {!st.system.online && <div className="banner r">📡 Sem internet: o atendimento automático está indisponível até a conexão voltar.</div>}
      {tab === 'inicio' && <Inicio st={st} go={(t) => setTab(t as typeof tab)} reload={reload} />}
      {tab === 'atend' && <Atendimentos st={st} />}
      {tab === 'coletas' && <Coletas />}
      {tab === 'bot' && <ConfigurarBot st={st} reload={reload} />}
      {tab === 'config' && <Configuracoes st={st} reload={reload} />}
    </main>
  </div>
}
export { api }
