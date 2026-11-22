import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export function hashPin(pin: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex')
  return { salt, hash: scryptSync(pin, salt, 32).toString('hex') }
}
export function verifyPin(pin: string, hash: string, salt: string): boolean {
  const a = Buffer.from(scryptSync(pin, salt, 32).toString('hex')); const b = Buffer.from(hash)
  return a.length === b.length && timingSafeEqual(a, b)
}
/** Limita tentativas: 5 erros bloqueiam o usuário por 30 s. */
export class Throttle {
  private fails = new Map<number, { n: number; until: number }>()
  check(id: number, now = Date.now()): number { const f = this.fails.get(id); return f && f.until > now ? Math.ceil((f.until - now) / 1000) : 0 }
  fail(id: number, now = Date.now()): void { const f = this.fails.get(id) ?? { n: 0, until: 0 }; f.n++; if (f.n >= 5) { f.until = now + 30_000; f.n = 0 } this.fails.set(id, f) }
  ok(id: number): void { this.fails.delete(id) }
}
