import { useEffect, useState } from 'react'
import type { AiState } from '@shared/types'
import { api, Setting, Toggle } from '../ui'

const SPEED = { rapida: 'rápida', media: 'média', lenta: 'lenta' } as const

export function AiCard() {
  const [ai, setAi] = useState<AiState | null>(null)
  const [text, setText] = useState('quero arrumar meu notebook que não liga')
  const [out, setOut] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { void api.aiGetState().then(setAi); return window.events.on('ai', setAi) }, [])
  if (!ai) return null
  const { hardware: hw, plan, download: d } = ai
  const gb = (mb: number) => (mb / 1024).toFixed(0) + ' GB'
  return <div className="card"><h2>Inteligência artificial (local)</h2>
    <p className="mute">A IA entende respostas livres dos clientes (“meu note não liga”), responde perguntas sobre a loja e pré-preenche os dados. Roda <b>neste computador</b> (modelo Bonsai 2 9B), sem internet e sem mensalidade. O bot funciona normalmente sem ela.</p>
    {hw && plan && <div className={'banner ' + (plan.usable ? 'g' : 'a')} style={{ alignItems: 'flex-start' }}>
      <div><b>{plan.usable ? 'Configuração automática' : 'IA não recomendada para este computador'}</b><br />{plan.reason}
        <div className="hint">Detectado: {hw.cpuModel}, {hw.logicalCores} núcleos, {gb(hw.totalRamMB)} de RAM{hw.gpus.length ? ', placa de vídeo ' + hw.gpus.map((g) => g.name + (g.vramMB ? ' (' + gb(g.vramMB) + ')' : '')).join(', ') : ', sem placa de vídeo dedicada'}.{plan.usable && ' Velocidade estimada: ' + SPEED[plan.speed] + '.'}</div></div></div>}
    {d && <div style={{ margin: '12px 0' }}><div>{d.message}</div>
      <div style={{ background: '#e5e7eb', borderRadius: 8, height: 12, margin: '6px 0' }}><div style={{ width: (d.done / d.total * 100).toFixed(1) + '%', background: 'var(--g)', height: 12, borderRadius: 8 }} /></div>
      <span className="mute">{(d.done / 1048576).toFixed(0)} de {(d.total / 1048576).toFixed(0)} MB</span> <button className="btn" onClick={() => api.aiCancel()}>Cancelar</button></div>}
    {ai.lastError && <div className="banner r">{ai.lastError}</div>}
    {!ai.installed && !d && <button className="btn pri" disabled={!plan?.usable} onClick={() => api.aiInstall()}>Configurar automaticamente e baixar (~2,6 GB)</button>}
    {ai.installed && <>
      <Setting title="Usar IA no atendimento" desc={ai.running ? 'Carregada na memória agora.' : 'Carrega sozinha quando chega uma mensagem que precisa dela.'}><Toggle on={ai.enabled} onChange={(v) => api.aiSetEnabled(v)} /></Setting>
      <Setting title="Descarregar da memória após" desc="Libera RAM quando ninguém está falando com o bot.">
        <select style={{ width: 140 }} value={ai.idleMinutes} onChange={(e) => api.aiSetOptions({ idleMinutes: Number(e.target.value) })}>{[0, 5, 10, 30, 60].map((m) => <option key={m} value={m}>{m ? m + ' min' : 'nunca'}</option>)}</select></Setting>
      <div className="row" style={{ marginTop: 10 }}><input type="text" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn fit" disabled={busy} onClick={async () => { setBusy(true); setOut('Pensando… (a primeira vez carrega o modelo)'); try { setOut(await api.aiTest(text)) } finally { setBusy(false) } }}>Testar IA</button></div>
      {out && <p className="hint">{out}</p>}
      <details><summary>Avançado</summary>
        <div className="row"><div><label>Onde rodar</label><select value={ai.override.backend ?? 'auto'} onChange={(e) => api.aiSetOptions({ override: { ...ai.override, backend: e.target.value === 'auto' ? undefined : (e.target.value as 'cpu' | 'vulkan') } })}>
          <option value="auto">Automático (recomendado)</option><option value="cpu">Processador</option><option value="vulkan">Placa de vídeo</option></select></div>
        <div><label>Tamanho da memória da conversa</label><select value={ai.override.ctx ?? 0} onChange={(e) => api.aiSetOptions({ override: { ...ai.override, ctx: Number(e.target.value) || undefined } })}>
          <option value={0}>Automático</option>{[2048, 4096, 8192, 16384].map((n) => <option key={n} value={n}>{n}</option>)}</select></div></div>
        <button className="btn red" style={{ marginTop: 10 }} onClick={() => confirm('Remover o modelo e liberar ~2,6 GB?') && api.aiRemove()}>Remover IA do computador</button></details></>}
    <p className="hint">Download único do modelo (Hugging Face) e do motor llama.cpp (GitHub), com verificação de integridade SHA-256.</p>
  </div>
}
