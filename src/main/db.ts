import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { DEFAULT_CONFIG, DEFAULT_SETTINGS } from '@shared/defaults'
import type { AppSettings, BotConfig, ContactInfo, ConversationRow, MessageRow, MsgKind, Role, UserRow, PickupRow, RequestRow, Session, Summary } from '@shared/types'

export const dataDir = (): string => {
  const d = join(app.getPath('userData'), 'dados')
  mkdirSync(d, { recursive: true })
  return d
}
export const dbPath = (): string => join(dataDir(), 'assistbot.db')

let db: DatabaseSync

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS wa_auth (key TEXT PRIMARY KEY, value BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS customers (jid TEXT PRIMARY KEY, name TEXT, phone TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS conversations (
  jid TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'bot', human_until INTEGER NOT NULL DEFAULT 0,
  last_message TEXT DEFAULT '', last_activity INTEGER NOT NULL DEFAULT 0, session TEXT);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, jid TEXT NOT NULL, from_me INTEGER NOT NULL, text TEXT NOT NULL,
  ts INTEGER NOT NULL, source TEXT NOT NULL, wa_id TEXT);
CREATE INDEX IF NOT EXISTS idx_msg_jid ON messages(jid, ts);
CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_waid ON messages(wa_id) WHERE wa_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, jid TEXT NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'novo',
  name TEXT, service TEXT, equipment TEXT, brand_model TEXT, problem TEXT, details TEXT, pickup TEXT,
  address TEXT, availability TEXT, notes TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS pickups (
  id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER NOT NULL, name TEXT, phone TEXT, address TEXT,
  availability TEXT, status TEXT NOT NULL DEFAULT 'pendente', scheduled_at TEXT DEFAULT '', notes TEXT DEFAULT '');
`

/** Migrações incrementais (PRAGMA user_version): dados existentes são preservados nas atualizações. */
const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'atendente',
     pin_hash TEXT, pin_salt TEXT, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
   ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'text';
   ALTER TABLE messages ADD COLUMN mime TEXT;
   ALTER TABLE messages ADD COLUMN media_path TEXT;
   ALTER TABLE messages ADD COLUMN media_name TEXT;
   ALTER TABLE messages ADD COLUMN user_id INTEGER;
   ALTER TABLE messages ADD COLUMN lat REAL;
   ALTER TABLE messages ADD COLUMN lng REAL;
   ALTER TABLE conversations ADD COLUMN assigned_to INTEGER;`,
  `ALTER TABLE customers ADD COLUMN notes TEXT DEFAULT '';`
]
function migrate(d: DatabaseSync): void {
  let v = Number((d.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
  while (v < MIGRATIONS.length) {
    d.exec('BEGIN')
    try { d.exec(MIGRATIONS[v]); v++; d.exec(`PRAGMA user_version = ${v}`); d.exec('COMMIT') } catch (e) { d.exec('ROLLBACK'); throw e }
  }
}

export function openDb(path = dbPath()): DatabaseSync {
  db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;')
  db.exec(SCHEMA)
  migrate(db)
  return db
}
export const getDb = (): DatabaseSync => db
export function closeDb(): void { try { db?.close() } catch { /* ignore */ } }

// ---------- kv / config / settings ----------
export function kvGet<T>(key: string, fallback: T): T {
  const r = db.prepare('SELECT value FROM kv WHERE key=?').get(key) as { value: string } | undefined
  if (!r) return fallback
  try { return JSON.parse(r.value) as T } catch { return fallback }
}
export function kvSet(key: string, value: unknown): void {
  db.prepare('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value))
}
export function getConfig(): BotConfig {
  const saved = kvGet<Partial<BotConfig>>('botConfig', {})
  return {
    ...DEFAULT_CONFIG, ...saved,
    business: { ...DEFAULT_CONFIG.business, ...saved.business },
    messages: { ...DEFAULT_CONFIG.messages, ...saved.messages },
    quickReplies: saved.quickReplies ?? DEFAULT_CONFIG.quickReplies,
    handoff: { ...DEFAULT_CONFIG.handoff, ...saved.handoff },
    behavior: { ...DEFAULT_CONFIG.behavior, ...saved.behavior },
    pickup: { ...DEFAULT_CONFIG.pickup, ...saved.pickup }
  }
}
export const saveConfig = (c: BotConfig): void => kvSet('botConfig', c)
export const getSettings = (): AppSettings => ({ ...DEFAULT_SETTINGS, ...kvGet<Partial<AppSettings>>('settings', {}) })
export const saveSettings = (s: AppSettings): void => kvSet('settings', s)

// ---------- clientes / conversas / mensagens ----------
export const phoneOf = (jid: string): string => jid.split('@')[0].split(':')[0]

export function upsertCustomer(jid: string, name?: string): void {
  db.prepare('INSERT INTO customers(jid,name,phone,created_at) VALUES(?,?,?,?) ON CONFLICT(jid) DO UPDATE SET name=COALESCE(NULLIF(?,\'\'),name)')
    .run(jid, name ?? '', phoneOf(jid), Date.now(), name ?? '')
}
export const customerName = (jid: string): string | undefined =>
  ((db.prepare('SELECT name FROM customers WHERE jid=?').get(jid) as { name: string } | undefined)?.name) || undefined

/** Retorna false se a mensagem (por id do WhatsApp) já foi processada: evita respostas duplicadas. */
export interface MsgExtra { kind?: MsgKind; mime?: string; mediaPath?: string; mediaName?: string; userId?: number; lat?: number; lng?: number }
const PREVIEW: Record<string, string> = { image: '📷 Foto', video: '🎥 Vídeo', audio: '🎵 Áudio', voice: '🎤 Mensagem de voz', document: '📄 Documento', sticker: '🏷️ Figurinha', location: '📍 Localização', contact: '👤 Contato', other: '' }
export function addMessage(jid: string, fromMe: boolean, text: string, source: MessageRow['source'], waId?: string, ts = Date.now(), x: MsgExtra = {}): boolean {
  const kind = x.kind ?? 'text'
  try {
    db.prepare('INSERT INTO messages(jid,from_me,text,ts,source,wa_id,kind,mime,media_path,media_name,user_id,lat,lng) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(jid, fromMe ? 1 : 0, text, ts, source, waId ?? null, kind, x.mime ?? null, x.mediaPath ?? null, x.mediaName ?? null, x.userId ?? null, x.lat ?? null, x.lng ?? null)
  } catch (e) {
    if (String(e).includes('UNIQUE')) return false
    throw e
  }
  db.prepare(`INSERT INTO conversations(jid,last_message,last_activity) VALUES(?,?,?)
    ON CONFLICT(jid) DO UPDATE SET last_message=excluded.last_message,last_activity=excluded.last_activity`).run(jid, (text || PREVIEW[kind] || '').slice(0, 200), ts)
  return true
}
export function getConv(jid: string): { status: string; humanUntil: number; session: Session | null } {
  const r = db.prepare('SELECT status,human_until,session FROM conversations WHERE jid=?').get(jid) as { status: string; human_until: number; session: string | null } | undefined
  return { status: r?.status ?? 'bot', humanUntil: r?.human_until ?? 0, session: r?.session ? (JSON.parse(r.session) as Session) : null }
}
export function setConv(jid: string, p: { status?: string; humanUntil?: number; session?: Session | null; assignedTo?: number | null }): void {
  db.prepare('INSERT INTO conversations(jid,last_activity) VALUES(?,?) ON CONFLICT(jid) DO NOTHING').run(jid, Date.now())
  if (p.status !== undefined) db.prepare('UPDATE conversations SET status=? WHERE jid=?').run(p.status, jid)
  if (p.humanUntil !== undefined) db.prepare('UPDATE conversations SET human_until=? WHERE jid=?').run(p.humanUntil, jid)
  if (p.assignedTo !== undefined) db.prepare('UPDATE conversations SET assigned_to=? WHERE jid=?').run(p.assignedTo, jid)
  if (p.session !== undefined) db.prepare('UPDATE conversations SET session=? WHERE jid=?').run(p.session ? JSON.stringify(p.session) : null, jid)
}
export function listConversations(): ConversationRow[] {
  const rows = db.prepare(`SELECT c.jid,c.status,c.human_until,c.last_message,c.last_activity,COALESCE(u.name,'') AS name,
    COALESCE((SELECT name FROM users WHERE id=c.assigned_to),'') AS assigned,
    COALESCE((SELECT from_me FROM messages WHERE jid=c.jid ORDER BY ts DESC,id DESC LIMIT 1),1) AS last_from_me,
    COALESCE((SELECT kind FROM messages WHERE jid=c.jid ORDER BY ts DESC,id DESC LIMIT 1),'text') AS last_kind
    FROM conversations c LEFT JOIN customers u ON u.jid=c.jid ORDER BY c.last_activity DESC LIMIT 300`).all() as Record<string, unknown>[]
  return rows.map((r) => ({ jid: r.jid as string, name: (r.name as string) || phoneOf(r.jid as string), phone: phoneOf(r.jid as string),
    status: r.status as ConversationRow['status'], lastMessage: r.last_message as string, lastActivity: r.last_activity as number, humanUntil: r.human_until as number, assignedName: r.assigned as string,
    unanswered: r.last_from_me === 0, lastKind: ((r.last_kind as string) || 'text') as MsgKind }))
}
export function listMessages(jid: string): MessageRow[] {
  const rows = db.prepare(`SELECT m.id,m.jid,m.from_me,m.text,m.ts,m.source,m.kind,m.mime,m.media_path,m.media_name,m.lat,m.lng,COALESCE(u.name,'') AS uname
    FROM messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.jid=? ORDER BY m.ts,m.id LIMIT 500`).all(jid) as Record<string, unknown>[]
  return rows.map((r) => ({ id: r.id as number, jid: r.jid as string, fromMe: r.from_me as number, text: r.text as string, ts: r.ts as number, source: r.source as MessageRow['source'],
    kind: ((r.kind as string) || 'text') as MsgKind, mime: (r.mime as string) ?? '', mediaPath: (r.media_path as string) ?? '', mediaName: (r.media_name as string) ?? '',
    userName: r.uname as string, lat: (r.lat as number) ?? undefined, lng: (r.lng as number) ?? undefined }))
}
export function conversationSessionData(jid: string): Session | null { return getConv(jid).session }

// ---------- solicitações / coletas ----------
export function createRequest(jid: string, s: Session, cfg: BotConfig): number {
  const d = s.data
  const details = cfg.followUps.filter((f) => s.followUps[f.id]).map((f) => `${f.text} ${s.followUps[f.id]}`).join('\n')
  const info = db.prepare(`INSERT INTO requests(jid,created_at,name,service,equipment,brand_model,problem,details,pickup,address,availability)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(jid, Date.now(), d.name ?? '', d.service ?? '', d.equipment ?? '', d.brand ?? '', d.problem ?? '', details, d.pickup ?? '', d.address ?? '', d.availability ?? '')
  const id = Number(info.lastInsertRowid)
  if (d.address) {
    db.prepare('INSERT INTO pickups(request_id,name,phone,address,availability) VALUES(?,?,?,?,?)').run(id, d.name ?? '', phoneOf(jid), d.address, d.availability ?? '')
  }
  return id
}
const mapReq = (r: Record<string, unknown>): RequestRow => ({
  id: r.id as number, jid: r.jid as string, createdAt: r.created_at as number, status: r.status as RequestRow['status'],
  name: (r.name as string) ?? '', service: (r.service as string) ?? '', equipment: (r.equipment as string) ?? '', brandModel: (r.brand_model as string) ?? '',
  problem: (r.problem as string) ?? '', details: (r.details as string) ?? '', pickup: (r.pickup as string) ?? '', address: (r.address as string) ?? '',
  availability: (r.availability as string) ?? '', notes: (r.notes as string) ?? ''
})
export const listRequests = (): RequestRow[] => (db.prepare('SELECT * FROM requests ORDER BY id DESC LIMIT 300').all() as Record<string, unknown>[]).map(mapReq)
export function updateRequest(id: number, p: { status?: string; notes?: string }): void {
  if (p.status) db.prepare('UPDATE requests SET status=? WHERE id=?').run(p.status, id)
  if (p.notes !== undefined) db.prepare('UPDATE requests SET notes=? WHERE id=?').run(p.notes, id)
}
export function listPickups(): PickupRow[] {
  const rows = db.prepare('SELECT * FROM pickups ORDER BY id DESC LIMIT 300').all() as Record<string, unknown>[]
  return rows.map((r) => ({ id: r.id as number, requestId: r.request_id as number, name: (r.name as string) ?? '', phone: (r.phone as string) ?? '',
    address: (r.address as string) ?? '', availability: (r.availability as string) ?? '', status: r.status as PickupRow['status'],
    scheduledAt: (r.scheduled_at as string) ?? '', notes: (r.notes as string) ?? '' }))
}
export function updatePickup(id: number, p: { status?: string; scheduledAt?: string; notes?: string }): void {
  if (p.status) db.prepare('UPDATE pickups SET status=? WHERE id=?').run(p.status, id)
  if (p.scheduledAt !== undefined) db.prepare('UPDATE pickups SET scheduled_at=? WHERE id=?').run(p.scheduledAt, id)
  if (p.notes !== undefined) db.prepare('UPDATE pickups SET notes=? WHERE id=?').run(p.notes, id)
}
export function getSummary(): Summary {
  const one = (sql: string, ...a: number[]): number => Number((db.prepare(sql).get(...a) as { c: number }).c)
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
  return {
    newRequests: one("SELECT COUNT(*) c FROM requests WHERE status='novo'"),
    openPickups: one("SELECT COUNT(*) c FROM pickups WHERE status IN ('pendente','agendada')"),
    needsHuman: one("SELECT COUNT(*) c FROM conversations WHERE status IN ('needs_human','human')"),
    conversationsToday: one('SELECT COUNT(*) c FROM conversations WHERE last_activity>=?', startOfDay.getTime()),
    totalRequests: one('SELECT COUNT(*) c FROM requests')
  }
}

// ---------- usuários ----------
const mapUser = (r: Record<string, unknown>): UserRow => ({ id: r.id as number, name: r.name as string, role: r.role as Role, hasPin: !!r.pin_hash })
export const listUsers = (): UserRow[] => (db.prepare('SELECT * FROM users WHERE active=1 ORDER BY id').all() as Record<string, unknown>[]).map(mapUser)
export const getUser = (id: number): UserRow | undefined => { const r = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(id) as Record<string, unknown> | undefined; return r ? mapUser(r) : undefined }
export const getUserSecret = (id: number): { hash: string; salt: string } | undefined => {
  const r = db.prepare('SELECT pin_hash,pin_salt FROM users WHERE id=? AND active=1').get(id) as { pin_hash: string | null; pin_salt: string | null } | undefined
  return r?.pin_hash && r.pin_salt ? { hash: r.pin_hash, salt: r.pin_salt } : undefined
}
export function saveUser(u: { id?: number; name: string; role: Role; pin?: { hash: string; salt: string } | null }): number {
  if (u.id) {
    db.prepare('UPDATE users SET name=?, role=? WHERE id=?').run(u.name, u.role, u.id)
    if (u.pin !== undefined) db.prepare('UPDATE users SET pin_hash=?, pin_salt=? WHERE id=?').run(u.pin?.hash ?? null, u.pin?.salt ?? null, u.id)
    return u.id
  }
  return Number(db.prepare('INSERT INTO users(name,role,pin_hash,pin_salt,created_at) VALUES(?,?,?,?,?)').run(u.name, u.role, u.pin?.hash ?? null, u.pin?.salt ?? null, Date.now()).lastInsertRowid)
}
export const deactivateUser = (id: number): void => { db.prepare('UPDATE users SET active=0 WHERE id=?').run(id) }

// ---------- contato ----------
export function getContact(jid: string): ContactInfo {
  const c = db.prepare('SELECT name,phone,notes,created_at FROM customers WHERE jid=?').get(jid) as { name: string; phone: string; notes: string; created_at: number } | undefined
  const conv = listConversations().find((x) => x.jid === jid)
  const count = Number((db.prepare('SELECT COUNT(*) c FROM messages WHERE jid=?').get(jid) as { c: number }).c)
  const sess = getConv(jid).session
  const collected: Record<string, string> = {}
  if (sess) {
    const d = sess.data
    const rows: [string, string | undefined][] = [['Nome', d.name], ['Serviço', d.service], ['Equipamento', d.equipment], ['Marca/modelo', d.brand], ['Problema', d.problem], ['Entrega', d.pickup], ['Endereço', d.address], ['Disponibilidade', d.availability]]
    for (const [k, v] of rows) if (v) collected[k] = v
  }
  return { jid, name: c?.name || conv?.name || phoneOf(jid), phone: c?.phone || phoneOf(jid), notes: c?.notes ?? '', firstSeen: c?.created_at ?? 0, messageCount: count,
    status: conv?.status ?? 'bot', assignedName: conv?.assignedName ?? '', collected, requests: listRequests().filter((r) => r.jid === jid) }
}
export function saveContact(jid: string, p: { name?: string; notes?: string }): void {
  db.prepare('INSERT INTO customers(jid,name,phone,created_at,notes) VALUES(?,?,?,?,?) ON CONFLICT(jid) DO NOTHING').run(jid, p.name ?? '', phoneOf(jid), Date.now(), '')
  if (p.name !== undefined) db.prepare('UPDATE customers SET name=? WHERE jid=?').run(p.name.trim(), jid)
  if (p.notes !== undefined) db.prepare('UPDATE customers SET notes=? WHERE jid=?').run(p.notes, jid)
}
