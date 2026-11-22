import { describe, it, expect } from 'vitest'
import { jitterMs } from '../src/main/whatsapp/jitter'
describe('atraso aleatório', () => {
  it('fica entre 2 e 5 segundos', () => {
    expect(jitterMs(2000, 5000, () => 0)).toBe(2000)
    expect(jitterMs(2000, 5000, () => 0.999999)).toBe(5000)
    for (let i = 0; i < 500; i++) { const v = jitterMs(); expect(v).toBeGreaterThanOrEqual(2000); expect(v).toBeLessThanOrEqual(5000) }
  })
})
