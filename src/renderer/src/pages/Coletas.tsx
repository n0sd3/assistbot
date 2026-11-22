import { useEffect, useState } from 'react'
import type { PickupRow } from '@shared/types'
import { api } from '../ui'

const ST: [string, string][] = [['pendente', 'Pendente'], ['agendada', 'Agendada'], ['coletada', 'Coletada'], ['cancelada', 'Cancelada']]

export function Coletas() {
  const [rows, setRows] = useState<PickupRow[]>([])
  const [f, setF] = useState('abertas')
  const load = async () => setRows(await api.pickups())
  useEffect(() => { void load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [])
  const shown = rows.filter((r) => (f === 'abertas' ? r.status === 'pendente' || r.status === 'agendada' : f === 'todas' || r.status === f))
  return <div>
    <h1>Coletas</h1><p className="sub">Pedidos de retirada do aparelho na casa do cliente.</p>
    <div className="tabs">{[['abertas', 'Em aberto'], ['coletada', 'Coletadas'], ['cancelada', 'Canceladas'], ['todas', 'Todas']].map(([k, l]) => <button key={k} className={'tab' + (f === k ? ' on' : '')} onClick={() => setF(k)}>{l}</button>)}</div>
    <div className="card">{shown.length === 0 ? <p className="mute">Nenhuma coleta por aqui.</p> : <table>
      <thead><tr><th>Cliente</th><th>Endereço</th><th>Disponibilidade</th><th>Data combinada</th><th>Status</th></tr></thead>
      <tbody>{shown.map((r) => <tr key={r.id}>
        <td><b>{r.name}</b><div className="mute">{r.phone}</div></td><td>{r.address}</td><td>{r.availability}</td>
        <td><input type="text" defaultValue={r.scheduledAt} placeholder="ex.: 12/12 às 14h" onBlur={(e) => e.target.value !== r.scheduledAt && api.updatePickup(r.id, { scheduledAt: e.target.value })} /></td>
        <td><select value={r.status} onChange={async (e) => { await api.updatePickup(r.id, { status: e.target.value }); void load() }}>{ST.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td></tr>)}</tbody></table>}</div>
  </div>
}
