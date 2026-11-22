import { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, nativeImage, net, powerMonitor, powerSaveBlocker, protocol, shell } from 'electron'
import { basename } from 'node:path'
import { copyFileSync, readFileSync, statSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { MAX_MEDIA, mediaDir, resolveMedia } from './media'
import { hashPin, Throttle, verifyPin } from './pin'
import { mimeFor, vcard } from './whatsapp/parse'
import type { Role, SendRequest, StagedFile, UserRow } from '@shared/types'
import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import { join } from 'node:path'
import QRCode from 'qrcode'
import * as db from './db'
import { BotManager } from './bot/manager'
import { BaileysTransport } from './whatsapp/baileysTransport'
import { autoBackup, backupTo, backupDir, dataFolder, listBackups, restoreFrom } from './services'
import { log } from './logger'
import type { Api, SystemInfo } from '@shared/api'
import type { AiState, UpdateInfo, WaStatus } from '@shared/types'
import { planFor, type Hardware } from '@shared/ai'
import { detectHardware } from './ai/hardware'
import { installBackend, installModel, installedModel, removeAll, serverPath } from './ai/installer'
import { LlamaServer } from './ai/server'
import { LlamaProvider } from './ai/provider'
import { AI_ASSETS } from '@shared/ai'
import { safeStorage } from 'electron'

const HIDDEN = process.argv.includes('--hidden')
protocol.registerSchemesAsPrivileged([{ scheme: 'assistbot-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

// ---------- usuários (sessão da interface; o bot funciona sem ninguém logado) ----------
let currentUserId = 0
const throttle = new Throttle()
const currentUser = (): UserRow | null => (currentUserId ? db.getUser(currentUserId) ?? null : null)
const ADMIN_ONLY = new Set(['saveConfig', 'saveSettings', 'waConnect', 'waDisconnect', 'waLogout', 'backupNow', 'exportBackup', 'importBackup', 'listBackups',
  'checkUpdate', 'installUpdate', 'setUpdateUrl', 'getUpdateUrl', 'aiInstall', 'aiCancel', 'aiSetEnabled', 'aiSetOptions', 'aiRemove', 'resetAll', 'userSave', 'userDelete', 'openPowerSettings'])
const staged = new Map<string, { path: string; name: string; mime: string; kind: StagedFile['kind'] }>()
const kindOf = (mime: string): StagedFile['kind'] => (mime.startsWith('image/') && !/gif/.test(mime) ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'document')
function stage(path: string, forced?: StagedFile['kind']): StagedFile {
  const st = statSync(path); if (!st.isFile()) throw new Error('Escolha um arquivo.')
  if (st.size > MAX_MEDIA) throw new Error('O arquivo passa de 100 MB, limite do WhatsApp.')
  const name = basename(path); const mime = mimeFor(name); const kind = forced ?? kindOf(mime)
  const token = randomUUID(); staged.set(token, { path, name, mime, kind })
  if (staged.size > 50) staged.delete(staged.keys().next().value as string)
  return { token, name, size: st.size, kind, mime }
}
const PICK: Record<string, { name: string; extensions: string[] }[]> = {
  image: [{ name: 'Fotos', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }], video: [{ name: 'Vídeos', extensions: ['mp4', 'mov', '3gp'] }],
  audio: [{ name: 'Áudios', extensions: ['ogg', 'opus', 'mp3', 'm4a', 'aac', 'amr', 'wav'] }], document: [{ name: 'Todos os arquivos', extensions: ['*'] }]
}
let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let wa: WaStatus = { state: 'disconnected' }
let online = true
let blocker: number | undefined
let upd: UpdateInfo = { state: 'idle' }
let gaps: { from: number; to: number }[] = []
const transport = new BaileysTransport()
let manager: BotManager
// ---------- IA local (llama.cpp + Bonsai) ----------
interface AiCfg { enabled: boolean; idleMinutes: number; override: AiState['override'] }
const aiCfg = (): AiCfg => ({ enabled: false, idleMinutes: 10, override: {}, ...db.kvGet<Partial<AiCfg>>('ai', {}) })
let hardware: Hardware | undefined
let aiDownload: AiState['download']
let aiError: string | undefined
let aiAbort: AbortController | undefined
const aiPlan = () => planFor(hardware ?? { totalRamMB: 0, freeRamMB: 0, cpuModel: '', logicalCores: 1, arch: process.arch, gpus: [], freeDiskMB: 0, os: process.platform }, aiCfg().override)
const aiInstalled = () => !!installedModel() && !!(serverPath('cpu') || serverPath('vulkan'))
const llama = new LlamaServer(aiPlan, () => aiCfg().idleMinutes)
const aiProvider = new LlamaProvider(llama, () => aiCfg().enabled && aiInstalled() && aiPlan().usable)
async function aiState(): Promise<AiState> {
  hardware ??= await detectHardware()
  const c = aiCfg()
  return { enabled: c.enabled, installed: aiInstalled(), running: llama.running, hardware, plan: aiPlan(), download: aiDownload, lastError: aiError, idleMinutes: c.idleMinutes, override: c.override }
}
const pushAi = async () => send('ai', await aiState())
llama.onChange = () => void pushAi()
async function aiInstallAll() {
  hardware ??= await detectHardware()
  const plan = aiPlan()
  if (!plan.usable) { aiError = plan.reason; return pushAi() }
  aiError = undefined; aiAbort = new AbortController()
  const total = AI_ASSETS.models[plan.model].size + AI_ASSETS.backends[plan.backend].size
  let base = 0
  const step = (stage: string, msg: string) => (done: number) => { aiDownload = { stage, done: base + done, total, message: msg }; void pushAi() }
  try {
    await installBackend(plan.backend, step('motor', 'Baixando o motor de IA…'), aiAbort.signal)
    if (plan.backend === 'vulkan') await installBackend('cpu', () => {}, aiAbort.signal) // reserva caso a placa de vídeo falhe
    base = AI_ASSETS.backends[plan.backend].size
    await installModel(plan.model, step('modelo', `Baixando o modelo de IA (${(AI_ASSETS.models[plan.model].size / 1073741824).toFixed(1)} GB)… pode demorar`), aiAbort.signal)
    const c = aiCfg(); db.kvSet('ai', { ...c, enabled: true })
  } catch (e) {
    aiError = (e as Error).name === 'AbortError' ? 'Download cancelado. Ao tentar de novo, continua de onde parou.' : String((e as Error).message)
  } finally { aiDownload = undefined; aiAbort = undefined; void pushAi() }
}

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0) }
app.on('second-instance', () => showWindow())

const asset = (n: string) => join(__dirname, '../../resources', n)
const send = (ev: string, v: unknown) => { if (win && !win.isDestroyed()) win.webContents.send('ev:' + ev, v) }
const botActive = () => db.getConfig().behavior.enabled && wa.state === 'connected'

function system(): SystemInfo {
  return { version: app.getVersion(), online, dataFolder: dataFolder(), encryption: safeStorage.isEncryptionAvailable(), botActive: botActive(), offlineGaps: gaps, platform: process.platform }
}
function refresh() {
  send('system', system())
  updateTray()
  applySleepPolicy()
}

function showWindow() {
  if (!win || win.isDestroyed()) createWindow()
  win!.show(); win!.focus()
}

function createWindow() {
  const demoSize = process.env['ASSISTBOT_DEMO_SIZE']?.split('x').map(Number)
  win = new BrowserWindow({
    width: demoSize?.[0] ?? 1280, height: demoSize?.[1] ?? 820, minWidth: 1000, minHeight: 640, show: false, title: 'AssistBot', backgroundColor: '#f6f7f9', autoHideMenuBar: true,
    icon: asset('icon.png'),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  Menu.setApplicationMenu(null)
  win.once('ready-to-show', () => { if (!HIDDEN || !db.getSettings().setupDone) win?.show() })
  win.on('close', (e) => {
    if (quitting) return
    if (db.getSettings().keepRunningInTray) {
      e.preventDefault(); win?.hide()
      if (!db.kvGet('trayHintShown', false)) {
        db.kvSet('trayHintShown', true)
        new Notification({ title: 'AssistBot continua ativo', body: 'O atendimento automático segue funcionando em segundo plano. Para abrir, clique no ícone perto do relógio. Para sair de vez, use o botão direito > Sair.' }).show()
      }
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) void shell.openExternal(url); return { action: 'deny' } })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function updateTray() {
  if (!tray) return
  const active = botActive()
  tray.setImage(nativeImage.createFromPath(asset(active ? 'tray-on.png' : 'tray-off.png')))
  const status = wa.state === 'connected' ? (active ? 'Atendimento automático ATIVO' : 'WhatsApp conectado — bot desligado') : 'WhatsApp desconectado'
  tray.setToolTip('AssistBot — ' + status)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: status, enabled: false }, { type: 'separator' },
    { label: 'Abrir AssistBot', click: () => showWindow() },
    { label: db.getConfig().behavior.enabled ? 'Pausar atendimento automático' : 'Ativar atendimento automático', click: () => { setBot(!db.getConfig().behavior.enabled) } },
    { type: 'separator' }, { label: 'Sair do AssistBot', click: () => { quitting = true; app.quit() } }
  ]))
}

function setBot(on: boolean) {
  const c = db.getConfig(); c.behavior.enabled = on; db.saveConfig(c)
  send('changed', null); refresh()
}

function applySleepPolicy() {
  const want = db.getSettings().preventSleep && db.getConfig().behavior.enabled
  if (want && blocker === undefined) blocker = powerSaveBlocker.start('prevent-app-suspension')
  if (!want && blocker !== undefined) { powerSaveBlocker.stop(blocker); blocker = undefined }
}

function applyAutoStart() {
  const s = db.getSettings()
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: s.startWithWindows, args: ['--hidden'] })
}

function notify(title: string, body: string, kind: 'human' | 'request') {
  if (kind === 'human' && !db.getSettings().notifyHuman) return
  const n = new Notification({ title, body, icon: asset('icon.png') })
  n.on('click', () => showWindow())
  n.show()
}

function setupUpdater() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { autoUpdater } = require('electron-updater') as typeof import('electron-updater')
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  const set = (u: UpdateInfo) => { upd = u; send('update', u) }
  autoUpdater.on('checking-for-update', () => set({ state: 'checking' }))
  autoUpdater.on('update-available', (i) => set({ state: 'downloading', version: i.version }))
  autoUpdater.on('update-not-available', () => set({ state: 'none' }))
  autoUpdater.on('update-downloaded', (i) => set({ state: 'ready', version: i.version }))
  autoUpdater.on('error', (e) => set({ state: 'error', message: String(e?.message ?? e).slice(0, 200) }))
  const check = async (): Promise<UpdateInfo> => {
    const url = db.kvGet('updateUrl', '')
    if (!app.isPackaged) return { state: 'error', message: 'Atualizações só funcionam no programa instalado.' }
    if (!url) return { state: 'error', message: 'Endereço de atualização não configurado.' }
    autoUpdater.setFeedURL({ provider: 'generic', url })
    try { await autoUpdater.checkForUpdates() } catch (e) { set({ state: 'error', message: String((e as Error).message).slice(0, 200) }) }
    return upd
  }
  return { check, install: () => { quitting = true; autoUpdater.quitAndInstall(true, true) } }
}

function registerIpc(updater: ReturnType<typeof setupUpdater>) {
  const h: { [K in keyof Api]: (...a: Parameters<Api[K]>) => ReturnType<Api[K]> | Awaited<ReturnType<Api[K]>> } = {
    getState: () => ({ config: db.getConfig(), settings: db.getSettings(), wa: process.env['ASSISTBOT_DEMO'] ? { state: 'connected', phone: '5511999990000' } : wa, system: system(), summary: db.getSummary() }),
    saveConfig: (c) => { db.saveConfig(c); refresh() },
    saveSettings: (s) => { db.saveSettings(s); applyAutoStart(); refresh() },
    setBotEnabled: (on) => setBot(on),
    waConnect: () => transport.start(),
    waDisconnect: () => transport.stop(),
    waLogout: () => transport.logout(),
    conversations: () => db.listConversations(),
    messages: (jid) => db.listMessages(jid),
    takeOver: (jid) => manager.takeOver(jid, currentUser()),
    release: (jid) => manager.release(jid),
    send: async (jid, req: SendRequest) => {
      const u = currentUser()
      if (req.type === 'text') { if (!req.text.trim()) return false; await manager.sendFromUser(jid, { type: 'text', text: req.text }, u); return true }
      if (req.type === 'location') { await manager.sendFromUser(jid, { type: 'location', lat: req.lat, lng: req.lng, name: req.name }, u); return true }
      if (req.type === 'contact') { await manager.sendFromUser(jid, { type: 'contact', name: req.name, vcard: vcard(req.name, req.phone) }, u); return true }
      const f = staged.get(req.token)
      if (!f) throw new Error('O anexo expirou. Escolha o arquivo de novo.')
      await manager.sendFromUser(jid, { type: 'media', kind: f.kind, data: readFileSync(f.path), mime: f.mime, fileName: f.name, caption: req.caption, ptt: f.kind === 'audio' && /ogg|opus/i.test(f.mime) }, u, { mediaName: f.name })
      staged.delete(req.token)
      return true
    },
    pickFile: async (kind) => {
      const r = await dialog.showOpenDialog(win!, { title: 'Escolher arquivo', properties: ['openFile'], filters: PICK[kind] })
      return r.canceled || !r.filePaths[0] ? null : stage(r.filePaths[0], kind)
    },
    stageFile: (path) => { try { return stage(path) } catch (e) { throw e } },
    contactGet: (jid) => db.getContact(jid),
    contactSave: (jid, p) => { db.saveContact(jid, p); send('changed', null) },
    openMedia: async (rel) => { const p = resolveMedia(rel); if (p) await shell.openPath(p) },
    saveMediaAs: async (rel, name) => {
      const p = resolveMedia(rel); if (!p) return false
      const r = await dialog.showSaveDialog(win!, { defaultPath: name || basename(p) })
      if (r.canceled || !r.filePath) return false
      copyFileSync(p, r.filePath); return true
    },
    sessionGet: () => ({ user: currentUser(), users: db.listUsers(), lastUserId: db.kvGet('lastUserId', 0) }),
    login: (id, pin) => {
      const wait = throttle.check(id)
      if (wait) return { ok: false, error: `Muitas tentativas. Aguarde ${wait} s.` }
      const sec = db.getUserSecret(id)
      if (sec && !(pin && verifyPin(pin, sec.hash, sec.salt))) { throttle.fail(id); return { ok: false, error: 'PIN incorreto.' } }
      if (!db.getUser(id)) return { ok: false, error: 'Usuário não encontrado.' }
      throttle.ok(id); currentUserId = id; db.kvSet('lastUserId', id); return { ok: true }
    },
    logout: () => { currentUserId = 0 },
    userSave: (u) => {
      const name = u.name.trim(); if (!name) throw new Error('Informe o nome.')
      if (u.id) {
        const was = db.getUser(u.id)
        if (was?.role === 'admin' && u.role !== 'admin' && db.listUsers().filter((x) => x.role === 'admin').length <= 1) throw new Error('Precisa existir pelo menos um administrador.')
      }
      const pin = u.pin === undefined ? undefined : u.pin ? hashPin(u.pin) : null
      const id = db.saveUser({ id: u.id, name, role: u.role as Role, pin })
      if (!u.id && !currentUserId) currentUserId = id // primeiro usuário (assistente) já entra logado
      send('changed', null)
    },
    userDelete: (id) => {
      const u = db.getUser(id); if (!u) return
      if (id === currentUserId) throw new Error('Você não pode remover o usuário que está usando.')
      if (u.role === 'admin' && db.listUsers().filter((x) => x.role === 'admin').length <= 1) throw new Error('Precisa existir pelo menos um administrador.')
      db.deactivateUser(id); send('changed', null)
    },
    requests: () => db.listRequests(),
    updateRequest: (id, p) => { db.updateRequest(id, p); send('changed', null) },
    pickups: () => db.listPickups(),
    updatePickup: (id, p) => { db.updatePickup(id, p); send('changed', null) },
    backupNow: () => autoBackup(db.getSettings().backupKeep),
    exportBackup: async () => {
      const r = await dialog.showSaveDialog(win!, { title: 'Salvar cópia de segurança', defaultPath: `AssistBot-backup-${new Date().toISOString().slice(0, 10)}.db`, filters: [{ name: 'Backup AssistBot', extensions: ['db'] }] })
      if (r.canceled || !r.filePath) return undefined
      backupTo(r.filePath); return r.filePath
    },
    importBackup: async () => {
      const r = await dialog.showOpenDialog(win!, { title: 'Escolher backup para restaurar', properties: ['openFile'], filters: [{ name: 'Backup AssistBot', extensions: ['db'] }] })
      if (r.canceled || !r.filePaths[0]) return undefined
      const c = await dialog.showMessageBox(win!, { type: 'warning', buttons: ['Restaurar', 'Cancelar'], defaultId: 1, cancelId: 1, message: 'Restaurar este backup?', detail: 'Os dados atuais (atendimentos, coletas e configurações) serão substituídos. Uma cópia dos dados atuais será guardada antes.' })
      if (c.response !== 0) return undefined
      restoreFrom(r.filePaths[0]); send('changed', null); refresh(); return r.filePaths[0]
    },
    listBackups: () => listBackups(),
    openFolder: async (w) => { await shell.openPath(w === 'backups' ? backupDir() : w === 'media' ? mediaDir() : w === 'logs' ? join(app.getPath('userData'), 'logs') : dataFolder()) },
    checkUpdate: () => updater.check(),
    installUpdate: () => updater.install(),
    getUpdateUrl: () => db.kvGet('updateUrl', ''),
    setUpdateUrl: (u) => db.kvSet('updateUrl', u.trim()),
    openPowerSettings: async () => { await shell.openExternal('ms-settings:powersleep') },
    aiGetState: () => aiState(),
    aiInstall: () => { void aiInstallAll() },
    aiCancel: () => { aiAbort?.abort() },
    aiSetEnabled: async (on) => { db.kvSet('ai', { ...aiCfg(), enabled: on }); if (!on) llama.stop(); await pushAi() },
    aiSetOptions: async (o) => { const c = aiCfg(); db.kvSet('ai', { ...c, ...o, override: o.override ?? c.override }); llama.stop(); await pushAi() },
    aiTest: async (text) => {
      const t0 = Date.now()
      const r = await aiProvider.interpret({ question: 'Qual serviço você precisa?', options: db.getConfig().services.map((x) => x.name), text, cfg: db.getConfig() })
      return r ? `${r.intent}: ${r.value || r.reply || '—'} (${((Date.now() - t0) / 1000).toFixed(1)} s)` : 'A IA não respondeu. Veja os registros.'
    },
    aiRemove: async () => { llama.stop(); removeAll(); db.kvSet('ai', { ...aiCfg(), enabled: false }); await pushAi() },
    finishSetup: () => { const s = db.getSettings(); s.setupDone = true; db.saveSettings(s); applyAutoStart(); refresh() },
    resetAll: async () => {
      const c = await dialog.showMessageBox(win!, { type: 'warning', buttons: ['Apagar tudo', 'Cancelar'], defaultId: 1, cancelId: 1, message: 'Apagar todos os dados?', detail: 'Isso remove atendimentos, coletas, configurações e desconecta o WhatsApp. Não pode ser desfeito.' })
      if (c.response !== 0) return
      await transport.logout()
      for (const t of ['kv', 'wa_auth', 'customers', 'conversations', 'messages', 'requests', 'pickups']) db.getDb().exec(`DELETE FROM ${t}`)
      send('changed', null); refresh()
    }
  }
  for (const k of Object.keys(h) as (keyof Api)[]) {
    ipcMain.handle('api:' + k, async (_e, ...args) => {
      // sem nenhum usuário cadastrado (primeira execução) tudo é liberado para o assistente inicial
      if (ADMIN_ONLY.has(k) && db.listUsers().length > 0 && currentUser()?.role !== 'admin') throw new Error('Ação permitida só para administradores.')
      return (h[k] as (...a: unknown[]) => unknown)(...args)
    })
  }
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.assistbot.app')
  db.openDb()
  protocol.handle('assistbot-media', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname.slice(1)); const abs = resolveMedia(rel)
    return abs ? net.fetch(pathToFileURL(abs).toString()) : new Response('não encontrado', { status: 404 })
  })
  // lacunas: períodos em que o computador/app ficou desligado ou suspenso
  const last = db.kvGet<number>('heartbeat', 0)
  gaps = db.kvGet('gaps', [] as { from: number; to: number }[])
  if (last && Date.now() - last > 5 * 60_000) { gaps = [{ from: last, to: Date.now() }, ...gaps].slice(0, 5); db.kvSet('gaps', gaps) }
  setInterval(() => db.kvSet('heartbeat', Date.now()), 60_000)

  manager = new BotManager(transport, { notify, changed: () => { send('changed', null); refresh() } }, aiProvider)
  transport.onStatus(async (s) => {
    wa = { ...s, qr: s.qr ? await QRCode.toDataURL(s.qr, { margin: 1, width: 320 }) : undefined }
    send('wa', wa); refresh()
    if (s.state === 'disconnected' && s.lastError && db.getConfig().behavior.enabled)
      notify('WhatsApp desconectado', s.lastError, 'human')
  })
  const updater = setupUpdater()
  registerIpc(updater)
  createWindow()
  tray = new Tray(nativeImage.createFromPath(asset('tray-off.png')))
  tray.on('click', () => showWindow())
  updateTray()
  applyAutoStart()
  applySleepPolicy()

  // reconecta sozinho se já houve sessão salva
  if (db.getDb().prepare('SELECT 1 FROM wa_auth LIMIT 1').get()) void transport.start()

  powerMonitor.on('resume', () => { log.info('Computador acordou'); if (wa.state !== 'connected' && wa.state !== 'qr') void transport.start() })
  powerMonitor.on('suspend', () => log.info('Computador vai suspender'))
  setInterval(() => {
    const o = net.isOnline()
    if (o !== online) { online = o; refresh(); if (o && wa.state === 'disconnected' && db.getDb().prepare('SELECT 1 FROM wa_auth LIMIT 1').get()) void transport.start() }
  }, 15_000)
  // backup diário automático
  const day = new Date().toISOString().slice(0, 10)
  if (db.getSettings().autoBackup && db.kvGet('lastAutoBackup', '') !== day) { autoBackup(db.getSettings().backupKeep); db.kvSet('lastAutoBackup', day) }
  setInterval(() => { const d = new Date().toISOString().slice(0, 10); if (db.getSettings().autoBackup && db.kvGet('lastAutoBackup', '') !== d) { autoBackup(db.getSettings().backupKeep); db.kvSet('lastAutoBackup', d) } }, 3600_000)
  if (app.isPackaged) setTimeout(() => void updater.check(), 30_000)
})

app.on('window-all-closed', () => { /* continua na bandeja */ })
app.on('before-quit', () => { llama.stop(); quitting = true; db.kvSet('heartbeat', Date.now()) })
process.on('uncaughtException', (e) => log.error('uncaughtException', e))
process.on('unhandledRejection', (e) => log.error('unhandledRejection', e))
