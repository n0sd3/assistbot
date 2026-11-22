import { useEffect, useRef, useState } from 'react'
import type { ConversationRow, MessageRow, RequestRow } from '@shared/types'
import { api, fmtDate, type AppState } from '../ui'

const STATUS: Record<string, [string, string]> = { bot: ['Bot atendendo', 'p-g'], needs_human: ['Precisa de você', 'p-r'], human: ['Você atendendo', 'p-b'], done: ['Concluído', 'p-x'] }
const RSTATUS: Record<string, string> = { novo: 'Novo', em_andamento: 'Em andamento', concluido: 'Concluído', cancelado: 'Cancelado' }

export function Atendimentos({ st }: { st: AppState }) {
  const [view, setView] = useState<'conv' | 'req'>('conv')
  return <div>
    <h1>Atendimentos</h1><p className="sub">Acompanhe as conversas e as solicitações coletadas pelo bot.</p>
    <div className="tabs"><button className={'tab' + (view === 'conv' ? ' on' : '')} onClick={() => setView('conv')}>Conversas</button>
      <button className={'tab' + (view === 'req' ? ' on' : '')} onClick={() => setView('req')}>Solicitações</button></div>
    {view === 'conv' ? <Conversas connected={st.wa.state === 'connected'} summaryKey={st.summary.conversationsToday + ':' + st.summary.needsHuman} /> : <Solicitacoes key={st.summary.totalRequests} />}
  </div>
}

function Conversas({ connected, summaryKey }: { connected: boolean; summaryKey: string }) {
  const [list, setList] = useState<ConversationRow[]>([])
  const [sel, setSel] = useState<string>('')
  const [msgs, setMsgs] = useState<MessageRow[]>([])
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const load = async () => { setList(await api.conversations()); if (sel) setMsgs(await api.messages(sel)) }
  useEffect(() => { void load(); const t = setInterval(load, 4000); return () => clearInterval(t) }, [sel, summaryKey])
  useEffect(() => { end.current?.scrollIntoView() }, [msgs.length, sel])
  const cur = list.find((c) => c.jid === sel)
  const send = async () => { if (!text.trim()) return; const t = text; setText(''); try { await api.sendManual(sel, t) } catch { alert('Não foi possível enviar. Verifique a conexão do WhatsApp.') } void load() }
  return <div className="split">
    <div className="list">{list.length === 0 && <p className="mute" style={{ padding: 16 }}>Nenhuma conversa ainda. Quando um cliente escrever, ela aparece aqui.</p>}
      {list.map((c) => <div key={c.jid} className={'li' + (c.jid === sel ? ' on' : '')} onClick={() => setSel(c.jid)}>
        <b>{c.name} <span className={'pill ' + STATUS[c.status][1]}>{STATUS[c.status][0]}</span></b><span>{c.lastMessage}</span><span>{fmtDate(c.lastActivity)}</span></div>)}</div>
    <div className="chat">{!cur ? <div className="msgs" style={{ placeItems: 'center', display: 'grid' }}><span className="mute">Selecione uma conversa</span></div> : <>
      <div className="msgs">{msgs.map((m) => <div key={m.id} className={'m ' + (m.source === 'client' ? '' : m.source === 'human' ? 'hu' : 'me')}>{m.text}<small>{m.source === 'bot' ? '🤖 bot' : m.source === 'human' ? '👤 equipe' : cur.name} · {fmtDate(m.ts)}</small></div>)}<div ref={end} /></div>
      <div className="chatbar">
        {cur.status === 'human' || cur.status === 'needs_human'
          ? <><input type="text" style={{ flex: 1 }} value={text} placeholder="Digite sua mensagem…" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void send()} />
            <button className="btn pri" disabled={!connected} onClick={() => void send()}>Enviar</button>
            <button className="btn" onClick={async () => { await api.release(cur.jid); void load() }}>Devolver ao bot</button></>
          : <><span className="mute" style={{ flex: 1 }}>O bot está conduzindo esta conversa.</span>
            <button className="btn pri" onClick={async () => { await api.takeOver(cur.jid); void load() }}>Assumir atendimento</button></>}
      </div>
      {(cur.status === 'human') && <div className="hint" style={{ padding: '0 12px 8px' }}>🤫 O bot fica em silêncio enquanto você conversa. Se você ficar parado, ele volta sozinho depois do tempo configurado.</div>}
    </>}</div>
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
      <td><select value={r.status} onChange={async (e) => { await api.updateRequest(r.id, { status: e.target.value }); void load() }}>
        {Object.entries(RSTATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td></tr>)}</tbody></table>}</div>
}
