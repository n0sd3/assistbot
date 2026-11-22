import { useState } from 'react'
import { useAppState, api } from './ui'
import { Wizard } from './Wizard'
import { CreateAdmin, Login } from './Login'
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
  if (st.session.users.length === 0) return <CreateAdmin reload={reload} />
  const user = st.session.user
  if (!user) return <Login st={st} reload={reload} />
  const admin = user.role === 'admin'
  const n = st.summary.needsHuman
  const active = st.system.botActive
  return <div className="app">
    <aside className="side">
      <div className="brand"><i>💬</i>AssistBot</div>
      {TABS.filter(([k]) => admin || k === 'inicio' || k === 'atend' || k === 'coletas').map(([k, ic, label]) => <button key={k} className={'nav' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>
        <span>{ic}</span>{label}{k === 'atend' && n > 0 && <span className="badge">{n}</span>}{k === 'coletas' && st.summary.openPickups > 0 && <span className="badge" style={{ background: '#2563eb' }}>{st.summary.openPickups}</span>}</button>)}
      <div className="foot">
        <div><span className={'pill ' + (active ? 'p-g' : 'p-x')}>{active ? '● Bot ativo' : '○ Bot parado'}</span></div>
        <div style={{ marginTop: 10 }}>👤 <b>{user.name}</b><div>{admin ? 'Administrador' : 'Atendente'}</div>
          <button className="btn" style={{ padding: '4px 10px', marginTop: 4, fontSize: 12 }} onClick={async () => { await api.logout(); reload() }}>Trocar usuário</button></div>
        <div style={{ marginTop: 6 }}>Versão {st.system.version}</div>
      </div>
    </aside>
    <main className="main">
      {!st.system.online && <div className="banner r">📡 Sem internet: o atendimento automático está indisponível até a conexão voltar.</div>}
      {tab === 'inicio' && <Inicio st={st} go={(t) => setTab(t as typeof tab)} reload={reload} />}
      {tab === 'atend' && <Atendimentos st={st} />}
      {tab === 'coletas' && <Coletas />}
      {tab === 'bot' && admin && <ConfigurarBot st={st} reload={reload} />}
      {tab === 'config' && admin && <Configuracoes st={st} reload={reload} />}
    </main>
  </div>
}
export { api }
