import { app } from 'electron'
import { appendFileSync, mkdirSync, statSync, renameSync } from 'node:fs'
import { join } from 'node:path'

function file(): string {
  const d = join(app.getPath('userData'), 'logs')
  mkdirSync(d, { recursive: true })
  const f = join(d, 'assistbot.log')
  try { if (statSync(f).size > 2_000_000) renameSync(f, f + '.old') } catch { /* não existe ainda */ }
  return f
}
function w(level: string, args: unknown[]): void {
  const line = `${new Date().toISOString()} [${level}] ${args.map((a) => (a instanceof Error ? a.stack : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`
  try { appendFileSync(file(), line) } catch { /* ignore */ }
  if (!app.isPackaged) console.log(line.trimEnd())
}
export const log = { info: (...a: unknown[]) => w('info', a), warn: (...a: unknown[]) => w('warn', a), error: (...a: unknown[]) => w('error', a) }
