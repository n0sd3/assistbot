import { useEffect, useState } from 'react'
import type { RequestRow } from '@shared/types'
import { api, fmtDate, type AppState } from '../ui'
import { Conversas } from './Chat'

const RSTATUS: Record<string, string> = { novo: 'Novo', em_andamento: 'Em andamento', concluido: 'Concluído', cancelado: 'Cancelado' }

export function Atendimentos({ st }: { st: AppState }) {
  const [view, setView] = useState<'conv' | 'req'>('conv')
  return <div>
    <h1>Atendimentos</h1><p className="sub">Acompanhe as conversas e as solicitações coletadas pelo bot.</p>
    <div className="tabs"><button className={'tab' + (view === 'conv' ? ' on' : '')} onClick={() => setView('conv')}>Conversas</button>
      <button className={'tab' + (view === 'req' ? ' on' : '')} onClick={() => setView('req')}>Solicitações</button></div>
    {view === 'conv' ? <Conversas st={st} summaryKey={st.summary.conversationsToday + ':' + st.summary.needsHuman} /> : <Solicitacoes key={st.summary.totalRequests} />}
  </div>
}

function Solicitacoes() {
  const [rows, setRows] = useState<RequestRow[]>([])
  const load = async () => setRows(await api.requests())
  useEffect(() => { void load() }, [])
  return <div className="card">{rows.length === 0 ? <p className="mute">Nenhuma solicitação recebida ainda.</p> : <table>
    <thead><tr><th>#</th><th>Cliente</th><th>O que precisa</th><th>Detalhes</th><th>Status</th></tr></thead>
    <tbody>{rows.map((r) => <tr key={r.id}>
      <td>{r.id}<div className="mute" style={{ fontSize: 12 }}>{fmtDate(r.createdAt)}</div></td>
      <td><b>{r.name}</b><div className="mute">{r.jid.split('@')[0]}</div></td>
      <td>{r.service}<div className="mute">{r.equipment} {r.brandModel}</div></td>
      <td><div>{r.problem}</div><div className="mute" style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{r.details}</div>{r.address && <div>📍 {r.address}<br />🕒 {r.availability}</div>}</td>
      <td><select style={{ minWidth: 150 }} value={r.status} onChange={async (e) => { await api.updateRequest(r.id, { status: e.target.value }); void load() }}>
        {Object.entries(RSTATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td></tr>)}</tbody></table>}</div>
}
