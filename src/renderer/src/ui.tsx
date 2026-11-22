import { useEffect, useState, type ReactNode } from 'react'
import type { Api, SystemInfo } from '@shared/api'
import type { AppSettings, BotConfig, Summary, UpdateInfo, WaStatus } from '@shared/types'

export interface AppState { config: BotConfig; settings: AppSettings; wa: WaStatus; system: SystemInfo; summary: Summary; update: UpdateInfo }

export function useAppState(): [AppState | null, () => void] {
  const [s, setS] = useState<AppState | null>(null)
  const load = () => { void window.api.getState().then((r) => setS((p) => ({ ...r, update: p?.update ?? { state: 'idle' } }))) }
  useEffect(() => {
    load()
    const offs = [
      window.events.on('wa', (wa) => setS((p) => (p ? { ...p, wa } : p))),
      window.events.on('system', (system) => setS((p) => (p ? { ...p, system } : p))),
      window.events.on('update', (update) => setS((p) => (p ? { ...p, update } : p))),
      window.events.on('changed', load)
    ]
    const t = setInterval(load, 20000)
    return () => { offs.forEach((o) => o()); clearInterval(t) }
  }, [])
  return [s, load]
}

export const api: Api = new Proxy({} as Api, { get: (_t, k: string) => (...a: unknown[]) => (window.api as unknown as Record<string, (...x: unknown[]) => unknown>)[k](...a) })

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <label className="toggle"><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} /><span /></label>
}
export function Setting({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return <div className="set"><div><b>{title}</b>{desc && <span className="mute">{desc}</span>}</div>{children}</div>
}
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div><label>{label}</label>{children}{hint && <div className="hint">{hint}</div>}</div>
}
export function StrList({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  return <div>
    {items.map((it, i) => <div className="item" key={i}>
      <input type="text" value={it} placeholder={placeholder} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
      <button className="x" title="Remover" onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button></div>)}
    <button className="btn" onClick={() => onChange([...items, ''])}>+ Adicionar</button>
  </div>
}
export const fmtDate = (t: number) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function useToast(): [ReactNode, (m: string) => void] {
  const [m, setM] = useState('')
  useEffect(() => { if (!m) return; const t = setTimeout(() => setM(''), 3500); return () => clearTimeout(t) }, [m])
  return [m ? <div style={{ position: 'fixed', bottom: 20, right: 20, background: '#111827', color: '#fff', padding: '12px 18px', borderRadius: 12, zIndex: 50 }}>{m}</div> : null, setM]
}

/** Cartão de conexão do WhatsApp com QR Code (usado no assistente e em Configurações). */
export function ConnectCard({ wa }: { wa: WaStatus }) {
  if (wa.state === 'connected') return <div className="banner g">✅ WhatsApp conectado{wa.phone ? ` (número ${wa.phone})` : ''}.</div>
  return <div>
    {wa.state === 'qr' && wa.qr ? <div className="qr"><img src={wa.qr} alt="QR Code do WhatsApp" />
      <ol style={{ marginTop: 12 }}>
        <li>Abra o <b>WhatsApp</b> no celular.</li>
        <li>Toque em <b>Menu (⋮)</b> ou <b>Configurações</b> › <b>Dispositivos conectados</b>.</li>
        <li>Toque em <b>Conectar um dispositivo</b> e aponte a câmera para este QR Code.</li>
      </ol></div>
      : <div className="card" style={{ textAlign: 'center' }}>
        {wa.state === 'connecting' ? <p>Conectando… aguarde alguns segundos.</p> : <p>O WhatsApp ainda não está conectado.</p>}
        {wa.lastError && <p className="mute">{wa.lastError}</p>}
        {wa.state === 'disconnected' && <button className="btn pri big" onClick={() => api.waConnect()}>Gerar QR Code</button>}
      </div>}
  </div>
}
