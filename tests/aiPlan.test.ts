import { describe, it, expect } from 'vitest'
import { planFor, type Hardware } from '../src/shared/ai'

const hw = (o: Partial<Hardware>): Hardware => ({ totalRamMB: 16384, freeRamMB: 8000, cpuModel: 'x', logicalCores: 8, arch: 'x64', gpus: [], freeDiskMB: 50000, os: 'win32', ...o })

describe('plano de IA por hardware', () => {
  it('PC fraco (4 GB) desativa a IA', () => { expect(planFor(hw({ totalRamMB: 4096 })).usable).toBe(false) })
  it('8 GB sem GPU usa CPU, contexto pequeno', () => {
    const p = planFor(hw({ totalRamMB: 8192 }))
    expect(p).toMatchObject({ usable: true, backend: 'cpu', gpuLayers: 0 }); expect(p.ctx).toBeLessThanOrEqual(4096)
  })
  it('GPU com 8 GB usa Vulkan com tudo na placa', () => {
    const p = planFor(hw({ gpus: [{ name: 'RTX 3060', vramMB: 8192, vendor: 'nvidia' }] }))
    expect(p).toMatchObject({ backend: 'vulkan', gpuLayers: 99, speed: 'rapida', model: 'q2_0' })
  })
  it('GPU com 2 GB cai para CPU', () => {
    expect(planFor(hw({ gpus: [{ name: 'Intel UHD', vramMB: 1024, vendor: 'intel' }] })).backend).toBe('cpu')
  })
  it('pouco disco bloqueia', () => { expect(planFor(hw({ freeDiskMB: 1000 })).usable).toBe(false) })
  it('ARM não suportado', () => { expect(planFor(hw({ arch: 'arm64' })).usable).toBe(false) })
  it('16 GB e CPU forte usa 2 slots', () => { expect(planFor(hw({ totalRamMB: 32768, logicalCores: 16 })).parallel).toBe(2) })
})
