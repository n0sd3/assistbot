import { describe, it, expect } from 'vitest'
import { hashPin, verifyPin, Throttle } from '../src/main/pin'
describe('PIN e bloqueio', () => {
  it('confere PIN certo e errado', () => { const h = hashPin('1234'); expect(verifyPin('1234', h.hash, h.salt)).toBe(true); expect(verifyPin('1235', h.hash, h.salt)).toBe(false) })
  it('não guarda o PIN em texto', () => { const h = hashPin('1234'); expect(h.hash).not.toContain('1234') })
  it('bloqueia 30 s após 5 erros e libera depois', () => {
    const t = new Throttle(); for (let i = 0; i < 5; i++) t.fail(1, 1000)
    expect(t.check(1, 2000)).toBeGreaterThan(0); expect(t.check(1, 32000)).toBe(0); t.ok(1)
  })
})
