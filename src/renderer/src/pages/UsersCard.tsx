import { useState } from 'react'
import type { Role } from '@shared/types'
import { api, Field, type AppState } from '../ui'

export function UsersCard({ st, reload }: { st: AppState; reload: () => void }) {
  const [edit, setEdit] = useState<{ id?: number; name: string; role: Role; pin: string; clearPin?: boolean } | null>(null)
  const [err, setErr] = useState('')
  const save = async () => {
    if (!edit) return
    try {
      await api.userSave({ id: edit.id, name: edit.name, role: edit.role, pin: edit.clearPin ? null : edit.pin ? edit.pin : edit.id ? undefined : null })
      setEdit(null); setErr(''); reload()
    } catch (e) { setErr((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')) }
  }
  return <div className="card"><h2>Usuários</h2>
    <p className="mute">Cada pessoa que atende tem seu nome. As mensagens enviadas pelo programa saem assinadas com o nome de quem está logado. <b>Administradores</b> mexem em tudo; <b>atendentes</b> só em atendimentos e coletas.</p>
    <table><tbody>{st.session.users.map((u) => <tr key={u.id}>
      <td><b>{u.name}</b> {u.id === st.session.user?.id && <span className="pill p-g">você</span>} {u.hasPin && '🔒'}</td><td>{u.role === 'admin' ? 'Administrador' : 'Atendente'}</td>
      <td style={{ textAlign: 'right' }}><button className="btn" onClick={() => { setErr(''); setEdit({ id: u.id, name: u.name, role: u.role, pin: '' }) }}>Editar</button>{' '}
        {u.id !== st.session.user?.id && <button className="btn red" onClick={async () => { if (confirm(`Remover ${u.name}?`)) { try { await api.userDelete(u.id); reload() } catch (e) { alert((e as Error).message) } } }}>Remover</button>}</td></tr>)}</tbody></table>
    {!edit && <button className="btn pri" style={{ marginTop: 10 }} onClick={() => { setErr(''); setEdit({ name: '', role: 'atendente', pin: '' }) }}>+ Novo usuário</button>}
    {edit && <div className="card" style={{ background: '#fafafa', marginTop: 12 }}>
      <Field label="Nome (aparece na assinatura)"><input type="text" autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
      <Field label="Perfil"><select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}><option value="atendente">Atendente</option><option value="admin">Administrador</option></select></Field>
      <Field label={edit.id ? 'Novo PIN (deixe em branco para manter)' : 'PIN (opcional)'} hint="Só números, até 12 dígitos."><input type="password" inputMode="numeric" maxLength={12} value={edit.pin} onChange={(e) => setEdit({ ...edit, pin: e.target.value })} /></Field>
      {edit.id && <label style={{ fontWeight: 400 }}><input type="checkbox" checked={!!edit.clearPin} onChange={(e) => setEdit({ ...edit, clearPin: e.target.checked })} /> Remover o PIN deste usuário</label>}
      {err && <div className="banner r" style={{ marginTop: 10 }}>{err}</div>}
      <div className="row" style={{ marginTop: 12 }}><span /><button className="btn fit" onClick={() => setEdit(null)}>Cancelar</button><button className="btn pri fit" onClick={save}>Salvar</button></div></div>}
  </div>
}
