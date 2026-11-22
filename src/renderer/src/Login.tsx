import { useState } from 'react'
import type { Role, UserRow } from '@shared/types'
import { api, Field, type AppState } from './ui'

const ROLE: Record<Role, string> = { admin: 'Administrador', atendente: 'Atendente' }

export function Login({ st, reload }: { st: AppState; reload: () => void }) {
  const [pick, setPick] = useState<UserRow | null>(null)
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const enter = async (u: UserRow, p?: string) => {
    const r = await api.login(u.id, p)
    if (r.ok) reload(); else { setErr(r.error ?? 'Não foi possível entrar.'); setPin('') }
  }
  return <div className="wiz" style={{ maxWidth: 560, paddingTop: 80 }}>
    <div className="brand"><i>💬</i>AssistBot</div>
    <div className="card"><h1>Quem está usando?</h1><p className="sub">Escolha seu nome. O bot continua atendendo mesmo sem ninguém logado.</p>
      {!pick && <div className="grid">{st.session.users.map((u) => <button key={u.id} className="card" style={{ margin: 0, textAlign: 'left', cursor: 'pointer', borderColor: u.id === st.session.lastUserId ? 'var(--g)' : undefined }}
        onClick={() => { setErr(''); u.hasPin ? setPick(u) : void enter(u) }}>
        <b>{u.name}</b> {u.hasPin && '🔒'}<div className="mute">{ROLE[u.role]}</div></button>)}</div>}
      {pick && <div><Field label={`PIN de ${pick.name}`}><input type="password" autoFocus value={pin} inputMode="numeric" maxLength={12} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void enter(pick, pin)} /></Field>
        {err && <div className="banner r" style={{ marginTop: 10 }}>{err}</div>}
        <div className="row" style={{ marginTop: 14 }}><button className="btn fit" onClick={() => { setPick(null); setErr('') }}>← Voltar</button><span /><button className="btn pri fit" onClick={() => void enter(pick, pin)}>Entrar</button></div></div>}
      {!pick && err && <div className="banner r" style={{ marginTop: 10 }}>{err}</div>}
    </div></div>
}

/** Instalações antigas sem nenhum usuário: cria o administrador. */
export function CreateAdmin({ reload }: { reload: () => void }) {
  const [name, setName] = useState(''); const [pin, setPin] = useState(''); const [err, setErr] = useState('')
  return <div className="wiz" style={{ maxWidth: 560, paddingTop: 80 }}>
    <div className="brand"><i>💬</i>AssistBot</div>
    <div className="card"><h1>Criar o administrador</h1><p className="sub">Esse nome assina as mensagens que você enviar e pode ser mudado depois.</p>
      <Field label="Seu nome"><input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="PIN (opcional)" hint="Números que protegem o acesso. Deixe em branco para entrar sem PIN."><input type="password" inputMode="numeric" maxLength={12} value={pin} onChange={(e) => setPin(e.target.value)} /></Field>
      {err && <div className="banner r" style={{ marginTop: 10 }}>{err}</div>}
      <div style={{ marginTop: 14 }}><button className="btn pri" onClick={async () => { try { await api.userSave({ name, role: 'admin', pin: pin || null }); reload() } catch (e) { setErr((e as Error).message) } }}>Continuar</button></div></div></div>
}
