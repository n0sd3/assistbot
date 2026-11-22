import { useEffect, useMemo, useRef, useState } from 'react'
import type { ContactInfo, ConversationRow, MessageRow, StagedFile } from '@shared/types'
import { api, useAsk, type AppState } from '../ui'
import { KIND_ICON, KIND_NAME, avatarColor, dayLabel, fmtPhone, fmtSize, hhmm, initials, sameDay, shortTime } from './chatUtils'

const STATUS: Record<string, [string, string]> = { bot: ['Bot atendendo', 'p-g'], needs_human: ['Precisa de você', 'p-r'], human: ['Em atendimento', 'p-b'], done: ['Concluído', 'p-x'] }
const murl = (p: string) => 'assistbot-media://m/' + p.split('/').map(encodeURIComponent).join('/')
const parseCoords = (t: string): [number, number] | null => { const m = t.match(/(-?\d{1,3}\.\d+)\s*[,; ]\s*(-?\d{1,3}\.\d+)/); return m ? [Number(m[1]), Number(m[2])] : null }
const errText = (e: unknown) => (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return <div className="at-av" style={{ width: size, height: size, background: avatarColor(name), fontSize: size * 0.38 }} aria-hidden>{initials(name)}</div>
}

/* ------------------------------------------------------------------ lista */
function List({ list, sel, setSel, me }: { list: ConversationRow[]; sel: string; setSel: (j: string) => void; me: string }) {
  const [q, setQ] = useState('')
  const [f, setF] = useState<'all' | 'pend' | 'mine' | 'bot'>('all')
  const pending = (c: ConversationRow) => c.status === 'needs_human' || (c.unanswered && c.status !== 'bot' && c.status !== 'done')
  const counts = useMemo(() => ({ all: list.length, pend: list.filter(pending).length, mine: list.filter((c) => c.assignedName === me && c.status === 'human').length, bot: list.filter((c) => c.status === 'bot').length }), [list, me])
  const shown = list.filter((c) => {
    if (f === 'pend' && !pending(c)) return false
    if (f === 'mine' && !(c.assignedName === me && c.status === 'human')) return false
    if (f === 'bot' && c.status !== 'bot') return false
    const t = q.trim().toLowerCase()
    return !t || c.name.toLowerCase().includes(t) || c.phone.includes(t.replace(/\D/g, '') || '§') || c.lastMessage.toLowerCase().includes(t)
  })
  const F: [typeof f, string][] = [['all', 'Todas'], ['pend', 'Pendentes'], ['mine', 'Minhas'], ['bot', 'Com o bot']]
  return <div className="at-list">
    <div className="at-search"><input type="text" placeholder="Buscar por nome, telefone ou mensagem" aria-label="Buscar conversas" value={q} onChange={(e) => setQ(e.target.value)} /></div>
    <div className="at-filters" role="tablist">{F.map(([k, l]) => <button key={k} role="tab" aria-selected={f === k} className={'chip' + (f === k ? ' on' : '')} onClick={() => setF(k)}>{l}{counts[k] > 0 && <span className="at-count">{counts[k]}</span>}</button>)}</div>
    <div className="at-items">
      {shown.length === 0 && <p className="mute" style={{ padding: 16 }}>{list.length === 0 ? 'Nenhuma conversa ainda. Quando um cliente escrever, ela aparece aqui.' : 'Nenhuma conversa neste filtro.'}</p>}
      {shown.map((c) => <button key={c.jid} className={'at-item' + (c.jid === sel ? ' on' : '')} onClick={() => setSel(c.jid)}>
        <Avatar name={c.name} />
        <div className="at-item-body">
          <div className="at-item-top"><b>{c.name}</b><span className={c.unanswered && c.status !== 'bot' ? 'at-time hot' : 'at-time'}>{shortTime(c.lastActivity)}</span></div>
          <div className="at-item-prev">{c.unanswered && c.status !== 'bot' && <i className="at-dot" aria-label="Sem resposta" />}{KIND_ICON[c.lastKind]} {c.lastMessage || KIND_NAME[c.lastKind]}</div>
          <div className="at-item-meta"><span className={'pill ' + STATUS[c.status][1]}>{STATUS[c.status][0]}</span>{c.assignedName && <span className="mute">· {c.assignedName}</span>}</div>
        </div></button>)}
    </div></div>
}

/* ---------------------------------------------------------------- mensagens */
function Bubble({ m, who, showWho }: { m: MessageRow; who: string; showWho: boolean }) {
  const url = m.mediaPath ? murl(m.mediaPath) : ''
  const gone = (l: string) => <i className="mute">[{l} indisponível]</i>
  const cls = m.source === 'client' ? 'in' : m.source === 'human' ? 'hu' : 'bo'
  return <div className={'at-b ' + cls}>
    {showWho && <div className="at-who" style={m.source === 'human' ? { color: avatarColor(m.userName || 'celular') } : undefined}>{who}</div>}
    {m.kind === 'image' && (url ? <img src={url} alt="foto" className="at-img" onClick={() => api.openMedia(m.mediaPath)} /> : gone('foto'))}
    {m.kind === 'sticker' && (url ? <img src={url} alt="figurinha" style={{ width: 110 }} /> : gone('figurinha'))}
    {m.kind === 'video' && (url ? <video src={url} controls className="at-img" /> : gone('vídeo'))}
    {(m.kind === 'audio' || m.kind === 'voice') && (url ? <div className="at-audio">{m.kind === 'voice' ? '🎤' : '🎵'}<audio src={url} controls /></div> : gone('áudio'))}
    {m.kind === 'document' && (url ? <div className="at-doc"><span className="at-doc-ic">📄</span><div><b>{m.mediaName || 'arquivo'}</b>
      <div className="row" style={{ gap: 6, marginTop: 6 }}><button className="btn fit sm" onClick={() => api.openMedia(m.mediaPath)}>Abrir</button><button className="btn fit sm" onClick={() => api.saveMediaAs(m.mediaPath, m.mediaName)}>Salvar como…</button></div></div></div> : gone('documento'))}
    {m.kind === 'location' && <div className="at-loc">📍 <b>{m.text || 'Localização'}</b><br /><a href={`https://maps.google.com/?q=${m.lat},${m.lng}`} target="_blank" rel="noreferrer">Ver no mapa</a></div>}
    {m.kind !== 'location' && m.text && <div className="at-text">{m.text}</div>}
    <div className="at-ts">{hhmm(m.ts)}</div></div>
}

function Messages({ msgs, who, boxRef, onDrop }: { msgs: MessageRow[]; who: (m: MessageRow) => string; boxRef: React.RefObject<HTMLDivElement | null>; onDrop: (files: File[]) => void }) {
  const [atBottom, setAtBottom] = useState(true)
  const [over, setOver] = useState(false)
  const last = useRef(0)
  useEffect(() => {
    const el = boxRef.current; if (!el) return
    if (atBottom || msgs.length !== last.current && msgs[msgs.length - 1]?.source === 'human') el.scrollTop = el.scrollHeight
    last.current = msgs.length
  }, [msgs.length])
  const nodes: React.ReactNode[] = []
  msgs.forEach((m, i) => {
    const p = msgs[i - 1]
    if (!p || !sameDay(p.ts, m.ts)) nodes.push(<div key={'d' + m.id} className="at-day"><span>{dayLabel(m.ts)}</span></div>)
    const grouped = p && sameDay(p.ts, m.ts) && p.source === m.source && (p.userName === m.userName) && m.ts - p.ts < 5 * 60000
    nodes.push(<Bubble key={m.id} m={m} who={who(m)} showWho={!grouped} />)
  })
  return <div className="at-msgs-wrap" onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); onDrop([...e.dataTransfer.files]) }}>
    <div className="at-msgs" ref={boxRef} onScroll={(e) => { const el = e.currentTarget; setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80) }}>{nodes}</div>
    {!atBottom && <button className="at-jump" onClick={() => { const el = boxRef.current!; el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }) }}>↓ Ir para o fim</button>}
    {over && <div className="at-drop">📎 Solte o arquivo para anexar</div>}
  </div>
}

/* ------------------------------------------------------------------ compose */
function Compose({ st, cur, onSent, stagedFromDrop, clearDrop }: { st: AppState; cur: ConversationRow; onSent: () => void; stagedFromDrop: StagedFile[]; clearDrop: () => void }) {
  const me = st.session.user
  const connected = st.wa.state === 'connected'
  const [text, setText] = useState('')
  const [files, setFiles] = useState<StagedFile[]>([])
  const [menu, setMenu] = useState<'' | 'attach' | 'quick'>('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [dlg, ask] = useAsk()
  const ta = useRef<HTMLTextAreaElement>(null)
  const draft = useRef<Record<string, string>>({})
  useEffect(() => { setText(draft.current[cur.jid] ?? ''); setFiles([]); setErr(''); setMenu('') }, [cur.jid])
  useEffect(() => { if (stagedFromDrop.length) { setFiles((f) => [...f, ...stagedFromDrop]); clearDrop() } }, [stagedFromDrop])
  useEffect(() => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = Math.min(150, el.scrollHeight) + 'px' } }, [text])
  const first = cur.name.split(' ')[0]
  const quick = st.config.quickReplies.filter(Boolean)
  const slash = text.startsWith('/') ? text.slice(1).toLowerCase() : null
  const slashHits = slash !== null ? quick.filter((q) => q.toLowerCase().includes(slash)) : []
  const set = (v: string) => { setText(v); draft.current[cur.jid] = v }
  const insert = (q: string) => { set(q.replace(/\{nome\}/g, first)); setMenu(''); ta.current?.focus() }
  const can = connected && !busy && (text.trim().length > 0 || files.length > 0)

  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(''); try { await fn(); onSent() } catch (e) { setErr(errText(e) || 'Não foi possível enviar.') } finally { setBusy(false) } }
  const submit = () => {
    if (!can) return
    const t = text.trim(); const fs = files
    void run(async () => {
      if (fs.length) { for (let i = 0; i < fs.length; i++) await api.send(cur.jid, { type: 'attachment', token: fs[i].token, caption: i === 0 ? t || undefined : undefined }) }
      if (t && !fs.length) await api.send(cur.jid, { type: 'text', text: t })
      set(''); setFiles([])
    })
  }
  const pick = async (kind: 'image' | 'video' | 'audio' | 'document') => { setMenu(''); try { const f = await api.pickFile(kind); if (f) setFiles((x) => [...x, f]) } catch (e) { setErr(errText(e)) } }
  const sendLocation = async () => {
    setMenu(''); const r = await ask('Enviar localização', [{ key: 'c', label: 'Coordenadas', placeholder: '-23.5505, -46.6333' }, { key: 'n', label: 'Nome do local (opcional)' }])
    if (!r) return; const c = parseCoords(r.c ?? ''); if (!c) { setErr('Não encontrei as coordenadas. Use o formato -23.5505, -46.6333.'); return }
    void run(() => api.send(cur.jid, { type: 'location', lat: c[0], lng: c[1], name: r.n || undefined }))
  }
  const sendContact = async () => {
    setMenu(''); const r = await ask('Enviar contato', [{ key: 'n', label: 'Nome' }, { key: 'p', label: 'Telefone com DDD', placeholder: '11 98888-7777' }])
    if (!r?.n || !r?.p) return; const d = r.p.replace(/\D/g, '')
    void run(() => api.send(cur.jid, { type: 'contact', name: r.n, phone: d.length <= 11 ? '55' + d : d }))
  }
  const botDriving = cur.status === 'bot' || cur.status === 'done'
  return <div className="at-compose" onKeyDown={(e) => e.key === 'Escape' && setMenu('')}>
    {!connected && <div className="banner r at-banner">📵 WhatsApp desconectado: não é possível enviar agora.</div>}
    {botDriving && connected && <div className="banner a at-banner">🤖 O bot está conduzindo esta conversa. Ao enviar uma mensagem, você assume e o bot fica em silêncio.</div>}
    {err && <div className="banner r at-banner">{err}<button className="btn" onClick={() => setErr('')}>Fechar</button></div>}
    {files.length > 0 && <div className="at-staged">{files.map((f) => <div key={f.token} className="at-chip"><span>{f.kind === 'image' ? '🖼️' : f.kind === 'video' ? '🎥' : f.kind === 'audio' ? '🎵' : '📄'}</span><div><b>{f.name}</b><small>{fmtSize(f.size)}</small></div>
      <button aria-label="Remover anexo" onClick={() => setFiles(files.filter((x) => x.token !== f.token))}>✕</button></div>)}</div>}
    {(menu === 'quick' || slashHits.length > 0) && <div className="at-pop at-quick" role="listbox"><div className="at-pop-title">⚡ Respostas rápidas <small>{slash !== null ? 'filtrando…' : 'ou digite / no campo'}</small></div>
      {(slash !== null ? slashHits : quick).map((q, i) => <button key={i} role="option" onClick={() => insert(q)}>{q.replace(/\{nome\}/g, first)}</button>)}
      {(slash !== null ? slashHits : quick).length === 0 && <p className="mute" style={{ padding: 10 }}>Nenhuma resposta rápida. Cadastre em Configurar bot › Respostas rápidas.</p>}</div>}
    {menu === 'attach' && <div className="at-pop at-attach">{([['image', '🖼️', 'Foto'], ['video', '🎥', 'Vídeo'], ['audio', '🎵', 'Áudio'], ['document', '📄', 'Documento']] as const).map(([k, ic, l]) => <button key={k} onClick={() => void pick(k)}><span>{ic}</span>{l}</button>)}
      <button onClick={() => void sendLocation()}><span>📍</span>Localização</button><button onClick={() => void sendContact()}><span>👤</span>Contato</button></div>}
    <div className="at-box">
      <button className="at-ic" title="Anexar foto, vídeo, áudio, documento, localização ou contato" aria-label="Anexar" onClick={() => setMenu(menu === 'attach' ? '' : 'attach')}>📎</button>
      <button className="at-ic" title="Respostas rápidas" aria-label="Respostas rápidas" onClick={() => setMenu(menu === 'quick' ? '' : 'quick')}>⚡</button>
      <textarea ref={ta} rows={1} value={text} aria-label="Mensagem" placeholder={`Escreva para ${first}…`}
        onChange={(e) => set(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }}
        onPaste={() => undefined} />
      <button className="btn pri at-send" disabled={!can} onClick={submit}>{busy ? 'Enviando…' : 'Enviar ➤'}</button>
    </div>
    <div className="at-foot"><span>{st.settings.signHuman && me ? <>✍️ Sai como <b>*{me.name}:*</b></> : 'Sem assinatura'}</span><span>Enter envia · Shift+Enter nova linha · / respostas rápidas</span></div>
    {dlg}</div>
}

/* ----------------------------------------------------------------- contato */
function Contact({ jid, onClose, reloadKey }: { jid: string; onClose: () => void; reloadKey: string }) {
  const [c, setC] = useState<ContactInfo | null>(null)
  const [name, setName] = useState(''); const [notes, setNotes] = useState(''); const [saved, setSaved] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => { void api.contactGet(jid).then((x) => { setC(x); setName(x.name); setNotes(x.notes) }) }, [jid, reloadKey])
  if (!c) return <aside className="at-contact" />
  const save = async (p: { name?: string; notes?: string }) => { await api.contactSave(jid, p); setSaved('Salvo ✓'); setTimeout(() => setSaved(''), 1800) }
  return <aside className="at-contact" aria-label="Dados do contato">
    <div className="at-ct-head"><b>Contato</b><button className="at-ic" aria-label="Fechar painel" onClick={onClose}>✕</button></div>
    <div className="at-ct-id"><Avatar name={c.name} size={72} />
      <input type="text" className="at-name" aria-label="Nome do contato" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== c.name && void save({ name })} />
      <div className="mute">{fmtPhone(c.phone)}</div>
      <div className="row" style={{ gap: 6, justifyContent: 'center' }}>
        <button className="btn fit sm" onClick={async () => { await navigator.clipboard.writeText(fmtPhone(c.phone)); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? 'Copiado ✓' : 'Copiar número'}</button>
        <a className="btn fit sm" href={`https://wa.me/${c.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">Abrir no WhatsApp</a></div></div>
    <div className="at-ct-sec"><div className="at-ct-kv"><span>Situação</span><span className={'pill ' + STATUS[c.status][1]}>{STATUS[c.status][0]}</span></div>
      {c.assignedName && <div className="at-ct-kv"><span>Atendido por</span><b>{c.assignedName}</b></div>}
      <div className="at-ct-kv"><span>Mensagens</span><b>{c.messageCount}</b></div>
      {c.firstSeen > 0 && <div className="at-ct-kv"><span>Cliente desde</span><b>{new Date(c.firstSeen).toLocaleDateString('pt-BR')}</b></div>}</div>
    <div className="at-ct-sec"><div className="at-ct-title">Anotações {saved && <small className="ok">{saved}</small>}</div>
      <textarea aria-label="Anotações sobre o cliente" placeholder="Ex.: prefere contato à tarde, já fez orçamento…" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== c.notes && void save({ notes })} /></div>
    {Object.keys(c.collected).length > 0 && <div className="at-ct-sec"><div className="at-ct-title">Coletado pelo bot</div>{Object.entries(c.collected).map(([k, v]) => <div key={k} className="at-ct-kv col"><span>{k}</span><b>{v}</b></div>)}</div>}
    <div className="at-ct-sec"><div className="at-ct-title">Solicitações ({c.requests.length})</div>
      {c.requests.length === 0 && <p className="mute" style={{ margin: 0 }}>Nenhuma solicitação ainda.</p>}
      {c.requests.map((r) => <div key={r.id} className="at-req"><div><b>#{r.id} · {r.service}</b><div className="mute">{r.equipment} {r.brandModel}</div><div className="mute">{r.problem}</div></div>
        <span className={'pill ' + (r.status === 'concluido' ? 'p-g' : r.status === 'novo' ? 'p-b' : 'p-a')}>{{ novo: 'Novo', em_andamento: 'Andamento', concluido: 'Concluído', cancelado: 'Cancelado' }[r.status]}</span></div>)}</div>
  </aside>
}

/* ------------------------------------------------------------------- tela */
export function Conversas({ st, summaryKey }: { st: AppState; summaryKey: string }) {
  const me = st.session.user
  const [list, setList] = useState<ConversationRow[]>([])
  const [sel, setSel] = useState<string>(() => { try { return localStorage.getItem('at-sel') ?? '' } catch { return '' } })
  const [msgs, setMsgs] = useState<MessageRow[]>([])
  const [info, setInfo] = useState<boolean>(() => { try { return localStorage.getItem('at-info') === '1' } catch { return true } })
  const [dropped, setDropped] = useState<StagedFile[]>([])
  const [tick, setTick] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const load = async () => { setList(await api.conversations()); if (sel) setMsgs(await api.messages(sel)); setTick(String(Date.now())) }
  useEffect(() => { void load(); const t = setInterval(load, 3000); return () => clearInterval(t) }, [sel, summaryKey])
  useEffect(() => { try { localStorage.setItem('at-sel', sel); localStorage.setItem('at-info', info ? '1' : '0') } catch { /* sem armazenamento */ } }, [sel, info])
  const cur = list.find((c) => c.jid === sel)
  const who = (m: MessageRow) => (m.source === 'bot' ? '🤖 Bot' : m.source === 'human' ? '👤 ' + (m.userName || 'Celular da loja') : cur?.name ?? '')
  const human = cur?.status === 'human' || cur?.status === 'needs_human'
  const onDrop = async (files: File[]) => {
    const out: StagedFile[] = []
    for (const f of files) { try { const s = await api.stageFile(window.files.pathFor(f)); if (s) out.push(s) } catch { /* ignora arquivo inválido */ } }
    if (out.length) setDropped(out)
  }
  return <div className={'at-split' + (info && cur ? ' with-info' : '')}>
    <List list={list} sel={sel} setSel={setSel} me={me?.name ?? ''} />
    <section className="at-chat">{!cur ? <div className="at-empty"><div style={{ fontSize: 44 }}>💬</div><b>Selecione uma conversa</b><span className="mute">As mensagens dos clientes aparecem aqui.</span></div> : <>
      <header className="at-head">
        <button className="at-who-btn" onClick={() => setInfo(!info)} aria-label="Ver dados do contato"><Avatar name={cur.name} /><div><b>{cur.name}</b><div className="mute">{fmtPhone(cur.phone)} · <span className={'pill ' + STATUS[cur.status][1]}>{STATUS[cur.status][0]}</span>{cur.assignedName && ` · ${cur.assignedName}`}</div></div></button>
        <div className="row" style={{ flex: 'none', gap: 8 }}>
          {human ? <button className="btn fit" onClick={async () => { await api.release(cur.jid); void load() }}>Devolver ao bot</button>
            : <button className="btn pri fit" onClick={async () => { await api.takeOver(cur.jid); void load() }}>Assumir atendimento</button>}
          <button className={'btn fit' + (info ? ' on' : '')} aria-pressed={info} onClick={() => setInfo(!info)}>ℹ️ Contato</button></div>
      </header>
      <Messages msgs={msgs} who={who} boxRef={box} onDrop={onDrop} />
      <Compose st={st} cur={cur} onSent={() => void load()} stagedFromDrop={dropped} clearDrop={() => setDropped([])} />
    </>}</section>
    {info && cur && <Contact jid={cur.jid} onClose={() => setInfo(false)} reloadKey={tick.slice(0, -4)} />}
  </div>
}
