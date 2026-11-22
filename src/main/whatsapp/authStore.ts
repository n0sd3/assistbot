import { safeStorage } from 'electron'
import { getDb } from '../db'

/**
 * Armazena a sessão do WhatsApp no SQLite, cifrada pelo Windows (DPAPI) via safeStorage.
 * Sem safeStorage disponível, grava sem cifra (marcador 0) para não perder a sessão.
 */
type Json = { replacer: (k: string, v: unknown) => unknown; reviver: (k: string, v: unknown) => unknown }

const enc = (text: string): Buffer => {
  if (safeStorage.isEncryptionAvailable()) return Buffer.concat([Buffer.from([1]), safeStorage.encryptString(text)])
  return Buffer.concat([Buffer.from([0]), Buffer.from(text, 'utf8')])
}
const dec = (b: Buffer): string => {
  const body = b.subarray(1)
  return b[0] === 1 ? safeStorage.decryptString(body) : body.toString('utf8')
}

export function clearAuth(): void { getDb().exec('DELETE FROM wa_auth') }

export async function useSqliteAuthState(
  initAuthCreds: () => unknown, BufferJSON: Json, proto: { Message: { AppStateSyncKeyData: { fromObject(o: object): unknown } } }
) {
  const db = getDb()
  const read = (key: string): unknown => {
    const r = db.prepare('SELECT value FROM wa_auth WHERE key=?').get(key) as { value: Uint8Array } | undefined
    if (!r) return null
    try { return JSON.parse(dec(Buffer.from(r.value)), BufferJSON.reviver) } catch { return null }
  }
  const write = (key: string, v: unknown): void => {
    db.prepare('INSERT INTO wa_auth(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .run(key, enc(JSON.stringify(v, BufferJSON.replacer)))
  }
  const del = (key: string): void => { db.prepare('DELETE FROM wa_auth WHERE key=?').run(key) }

  const creds = (read('creds') ?? initAuthCreds()) as Record<string, unknown>
  return {
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const out: Record<string, unknown> = {}
          for (const id of ids) {
            let v = read(`${type}-${id}`)
            if (type === 'app-state-sync-key' && v) v = proto.Message.AppStateSyncKeyData.fromObject(v as object)
            out[id] = v
          }
          return out
        },
        set: async (data: Record<string, Record<string, unknown>>) => {
          db.exec('BEGIN')
          try {
            for (const cat in data) for (const id in data[cat]) {
              const v = data[cat][id]
              if (v) write(`${cat}-${id}`, v); else del(`${cat}-${id}`)
            }
            db.exec('COMMIT')
          } catch (e) { db.exec('ROLLBACK'); throw e }
        }
      }
    },
    saveCreds: async () => write('creds', creds)
  }
}
