import { useEffect, useState } from 'react'
import type { AppSettings } from '@shared/types'
import { api, ConnectCard, Setting, Toggle, fmtDate, useToast, type AppState } from '../ui'

export function Configuracoes({ st, reload }: { st: AppState; reload: () => void }) {
  const [toast, say] = useToast()
  const [url, setUrl] = useState('')
  const [backups, setBackups] = useState<{ name: string; size: number; time: number }[]>([])
  useEffect(() => { void api.getUpdateUrl().then(setUrl); void api.listBackups().then(setBackups) }, [])
  const set = async (p: Partial<AppSettings>) => { await api.saveSettings({ ...st.settings, ...p }); reload() }
  const u = st.update
  return <div>
    <h1>Configurações</h1><p className="sub">Conexão, inicialização, backups e manutenção.</p>
    <div className="card"><h2>WhatsApp</h2><ConnectCard wa={st.wa} />
      <div className="row" style={{ marginTop: 10 }}>
        {st.wa.state !== 'disconnected' && <button className="btn fit" onClick={() => api.waDisconnect()}>Pausar conexão</button>}
        {st.wa.state === 'connected' && <button className="btn red fit" onClick={async () => { if (confirm('Desconectar este WhatsApp? Será preciso ler o QR Code de novo.')) await api.waLogout() }}>Desconectar / trocar número</button>}
        <span /></div>
      <p className="hint">Se a conexão cair, o AssistBot tenta reconectar sozinho. Se o celular desvincular o aparelho, será necessário ler um novo QR Code.</p></div>

    <div className="card"><h2>Funcionamento</h2>
      <Setting title="Abrir junto com o Windows" desc="O bot volta a funcionar sozinho quando o computador ligar."><Toggle on={st.settings.startWithWindows} onChange={(v) => set({ startWithWindows: v })} /></Setting>
      <Setting title="Continuar em segundo plano ao fechar a janela" desc="Ao clicar no X, o AssistBot vai para perto do relógio e segue atendendo. Para sair de vez: botão direito no ícone › Sair."><Toggle on={st.settings.keepRunningInTray} onChange={(v) => set({ keepRunningInTray: v })} /></Setting>
      <Setting title="Evitar suspensão do computador" desc="Enquanto o bot estiver ligado, o Windows não entra em suspensão por inatividade."><Toggle on={st.settings.preventSleep} onChange={(v) => set({ preventSleep: v })} /></Setting>
      <Setting title="Avisar quando precisar de uma pessoa" desc="Notificação do Windows quando um cliente pedir atendente ou o WhatsApp cair."><Toggle on={st.settings.notifyHuman} onChange={(v) => set({ notifyHuman: v })} /></Setting>
      <div className="banner a" style={{ marginTop: 12 }}>💡 Fechar a tampa do notebook, desligar ou suspender o computador faz o atendimento automático parar. Para um notebook, ajuste em Energia: “Quando eu fechar a tampa: Não fazer nada”.
        <button className="btn" onClick={() => api.openPowerSettings()}>Abrir ajustes de energia</button></div>
      <p className="hint">Computador desligado, suspenso ou sem internet = sem atendimento automático. As mensagens recebidas nesse período são respondidas só depois que o computador voltar (se forem recentes).</p></div>

    <div className="card"><h2>Backup dos dados</h2>
      <Setting title="Backup automático diário" desc="Guarda cópias dos atendimentos, coletas e configurações (sem a sessão do WhatsApp)."><Toggle on={st.settings.autoBackup} onChange={(v) => set({ autoBackup: v })} /></Setting>
      <div className="row" style={{ margin: '12px 0' }}>
        <button className="btn fit" onClick={async () => { const f = await api.backupNow(); say(f ? 'Backup criado.' : 'Falha ao criar backup.'); setBackups(await api.listBackups()) }}>Fazer backup agora</button>
        <button className="btn fit" onClick={async () => { const f = await api.exportBackup(); if (f) say('Backup salvo em ' + f) }}>Exportar para um arquivo…</button>
        <button className="btn fit" onClick={async () => { try { const f = await api.importBackup(); if (f) { say('Backup restaurado.'); reload() } } catch (e) { alert((e as Error).message) } }}>Restaurar de um arquivo…</button>
        <button className="btn fit" onClick={() => api.openFolder('backups')}>Abrir pasta</button><span /></div>
      {backups.length > 0 && <p className="hint">Último backup automático: {fmtDate(backups[0].time)} ({backups.length} guardados)</p>}</div>

    <div className="card"><h2>Atualizações</h2>
      <p>Versão instalada: <b>{st.system.version}</b> {u.state === 'none' && <span className="pill p-g">Você está na versão mais recente</span>}
        {u.state === 'downloading' && <span className="pill p-b">Baixando {u.version}…</span>}{u.state === 'error' && <span className="pill p-a">{u.message}</span>}</p>
      {u.state === 'ready' && <div className="banner g">Versão {u.version} pronta. <button className="btn pri" onClick={() => api.installUpdate()}>Reiniciar e atualizar</button></div>}
      <div className="row"><button className="btn fit" onClick={() => api.checkUpdate()}>Procurar atualização</button><span /></div>
      <details><summary>Avançado: endereço das atualizações</summary>
        <input type="text" value={url} placeholder="https://seu-site.com/assistbot/" onChange={(e) => setUrl(e.target.value)} onBlur={() => api.setUpdateUrl(url)} />
        <p className="hint">Informado por quem distribui o programa. O AssistBot só instala pacotes cujo hash SHA-512 confere com o arquivo latest.yml publicado.</p></details></div>

    <div className="card"><h2>Manutenção</h2>
      <p className="mute">Os dados ficam só neste computador, em: {st.system.dataFolder}. Proteção da sessão do WhatsApp: {st.system.encryption ? 'cifrada pelo Windows' : 'sem cifra do sistema (indisponível)'}.</p>
      <div className="row"><button className="btn fit" onClick={() => api.openFolder('data')}>Abrir pasta de dados</button><button className="btn fit" onClick={() => api.openFolder('logs')}>Abrir registros (suporte)</button>
        <button className="btn red fit" onClick={() => api.resetAll()}>Apagar todos os dados…</button><span /></div></div>

    <div className="card"><h2>Aviso importante</h2>
      <p className="mute">O AssistBot usa uma conexão <b>não oficial</b> com o WhatsApp (o mesmo mecanismo do WhatsApp Web). Isso não é endossado pela Meta e, embora raro com uso moderado, existe risco de a conta ser limitada ou banida. Recomendações: use um número dedicado ao negócio, não envie mensagens em massa, responda apenas a quem escreve primeiro e mantenha o celular com internet.</p></div>
    {toast}
  </div>
}
