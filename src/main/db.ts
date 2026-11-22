import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { DEFAULT_CONFIG, DEFAULT_SETTINGS } from '@shared/defaults'
import type { AppSettings, BotConfig, ConversationRow, MessageRow, PickupRow, RequestRow, Session, Summary } from '@shared/types'

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

export function openDb(path = dbPath()): DatabaseSync {
  db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;')
  db.exec(SCHEMA)
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
export function addMessage(jid: string, fromMe: boolean, text: string, source: MessageRow['source'], waId?: string, ts = Date.now()): boolean {
  try {
    db.prepare('INSERT INTO messages(jid,from_me,text,ts,source,wa_id) VALUES(?,?,?,?,?,?)').run(jid, fromMe ? 1 : 0, text, ts, source, waId ?? null)
  } catch (e) {
    if (String(e).includes('UNIQUE')) return false
    throw e
  }
  db.prepare(`INSERT INTO conversations(jid,last_message,last_activity) VALUES(?,?,?)
    ON CONFLICT(jid) DO UPDATE SET last_message=excluded.last_message,last_activity=excluded.last_activity`).run(jid, text.slice(0, 200), ts)
  return true
}
export function getConv(jid: string): { status: string; humanUntil: number; session: Session | null } {
  const r = db.prepare('SELECT status,human_until,session FROM conversations WHERE jid=?').get(jid) as { status: string; human_until: number; session: string | null } | undefined
  return { status: r?.status ?? 'bot', humanUntil: r?.human_until ?? 0, session: r?.session ? (JSON.parse(r.session) as Session) : null }
}
export function setConv(jid: string, p: { status?: string; humanUntil?: number; session?: Session | null }): void {
  db.prepare('INSERT INTO conversations(jid,last_activity) VALUES(?,?) ON CONFLICT(jid) DO NOTHING').run(jid, Date.now())
  if (p.status !== undefined) db.prepare('UPDATE conversations SET status=? WHERE jid=?').run(p.status, jid)
  if (p.humanUntil !== undefined) db.prepare('UPDATE conversations SET human_until=? WHERE jid=?').run(p.humanUntil, jid)
  if (p.session !== undefined) db.prepare('UPDATE conversations SET session=? WHERE jid=?').run(p.session ? JSON.stringify(p.session) : null, jid)
}
export function listConversations(): ConversationRow[] {
  const rows = db.prepare(`SELECT c.jid,c.status,c.human_until,c.last_message,c.last_activity,COALESCE(u.name,'') AS name
    FROM conversations c LEFT JOIN customers u ON u.jid=c.jid ORDER BY c.last_activity DESC LIMIT 200`).all() as Record<string, unknown>[]
  return rows.map((r) => ({ jid: r.jid as string, name: (r.name as string) || phoneOf(r.jid as string), phone: phoneOf(r.jid as string),
    status: r.status as ConversationRow['status'], lastMessage: r.last_message as string, lastActivity: r.last_activity as number, humanUntil: r.human_until as number }))
}
export function listMessages(jid: string): MessageRow[] {
  const rows = db.prepare('SELECT id,jid,from_me,text,ts,source FROM messages WHERE jid=? ORDER BY ts,id LIMIT 500').all(jid) as Record<string, unknown>[]
  return rows.map((r) => ({ id: r.id as number, jid: r.jid as string, fromMe: r.from_me as number, text: r.text as string, ts: r.ts as number, source: r.source as MessageRow['source'] }))
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
