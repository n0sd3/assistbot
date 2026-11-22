import { app } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { closeDb, dataDir, dbPath, getDb, openDb } from './db'
import { log } from './logger'

export const backupDir = (): string => { const d = join(app.getPath('userData'), 'backups'); mkdirSync(d, { recursive: true }); return d }

const stamp = (): string => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)

/** Backup consistente do banco (VACUUM INTO) — não interrompe o bot. */
export function backupTo(file: string): void {
  if (existsSync(file)) rmSync(file)
  getDb().exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
  // a sessão do WhatsApp nunca vai para o backup (fica protegida só neste computador)
  const t = new DatabaseSync(file)
  t.exec('DELETE FROM wa_auth; VACUUM;')
  t.close()
}
export function autoBackup(keep: number): string | undefined {
  try {
    const f = join(backupDir(), `assistbot-${stamp()}.db`)
    backupTo(f)
    const files = readdirSync(backupDir()).filter((x) => x.endsWith('.db')).map((n) => ({ n, t: statSync(join(backupDir(), n)).mtimeMs })).sort((a, b) => b.t - a.t)
    for (const old of files.slice(Math.max(1, keep))) rmSync(join(backupDir(), old.n))
    return f
  } catch (e) { log.error('Backup automático falhou', e); return undefined }
}
export function listBackups(): { name: string; size: number; time: number }[] {
  return readdirSync(backupDir()).filter((x) => x.endsWith('.db')).map((n) => {
    const s = statSync(join(backupDir(), n)); return { name: n, size: s.size, time: s.mtimeMs }
  }).sort((a, b) => b.time - a.time)
}
/** Restaura um backup. Valida o arquivo antes e guarda uma cópia do banco atual. */
export function restoreFrom(file: string): void {
  const test = openDbReadonlyCheck(file)
  if (!test) throw new Error('O arquivo selecionado não é um backup válido do AssistBot.')
  const safety = join(backupDir(), `antes-de-restaurar-${stamp()}.db`)
  backupTo(safety)
  const auth = getDb().prepare('SELECT key,value FROM wa_auth').all() as { key: string; value: Uint8Array }[]
  closeDb()
  for (const ext of ['', '-wal', '-shm']) { try { rmSync(dbPath() + ext) } catch { /* ignore */ } }
  copyFileSync(file, dbPath())
  const d = openDb()
  const ins = d.prepare('INSERT OR REPLACE INTO wa_auth(key,value) VALUES(?,?)')
  for (const r of auth) ins.run(r.key, r.value)
}
function openDbReadonlyCheck(file: string): boolean {
  try {
    const t = new DatabaseSync(file, { readOnly: true })
    const r = t.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name IN ('kv','requests','conversations')").get() as { c: number }
    t.close()
    return r.c === 3
  } catch { return false }
}
export const dataFolder = dataDir
