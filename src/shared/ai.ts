/** Modelo e binários fixados (versões testadas + SHA-256 conferido no download). */
export const AI_ASSETS = {
  llamaBuild: 'b12623',
  models: {
    // Opcional: medido em 21/11/2026, sem ganho sobre o Q2_0 (docs/QUANTIZACAO.md). Só ativar com arquivo hospedado
    // (url/sha256/size) e ganho comprovado; com available=true o plano passa a preferi-lo em PCs com folga.
    q4_0: { name: 'Bonsai 2 9B (Q4_0)', file: 'Ternary-Bonsai-2-9B-Q4_0.gguf', url: '', sha256: '', size: 0, approxMB: 5200, available: false },
    // Padrão.
    q2_0: {
      name: 'Bonsai 2 9B (ternário, Q2_0)', file: 'Ternary-Bonsai-2-9B-Q2_0.gguf', available: true, approxMB: 2440,
      url: 'https://huggingface.co/prism-ml/Ternary-Bonsai-2-9B-gguf/resolve/main/Ternary-Bonsai-2-9B-Q2_0.gguf',
      sha256: '1f884aa56aacd2bbbb2e4b7abaead2b1102b74a9c75a23fc33dab916813a384d', size: 2556640128
    }
  },
  backends: {
    cpu: { file: 'llama-b12623-bin-win-cpu-x64.zip', sha256: '2d2618679b677ff2719e52817f4c13a6720b35ed1873450a849ef9ad91b9543c', size: 25036817 },
    vulkan: { file: 'llama-b12623-bin-win-vulkan-x64.zip', sha256: '36ee2d2bbfed23c5b41e55ac258b42668fb0961dafdd3e382ce575d4772b2a02', size: 38871017 }
  }
} as const
export type Backend = keyof typeof AI_ASSETS.backends
export type ModelKey = keyof typeof AI_ASSETS.models
export const modelInfo = (k: ModelKey) => AI_ASSETS.models[k]

export interface GpuInfo { name: string; vramMB: number; vendor: 'nvidia' | 'amd' | 'intel' | 'other' }
export interface Hardware { totalRamMB: number; freeRamMB: number; cpuModel: string; logicalCores: number; arch: string; gpus: GpuInfo[]; freeDiskMB: number; os: string }

export interface AiPlan {
  usable: boolean
  backend: Backend
  model: ModelKey
  gpuLayers: number
  ctx: number
  threads: number
  parallel: number
  reason: string // explicação em português para o usuário
  speed: 'rapida' | 'media' | 'lenta'
}


/** Escolhe a configuração do llama.cpp a partir do hardware. Função pura (testável). */
export function planFor(hw: Hardware, override?: { backend?: Backend; ctx?: number; model?: ModelKey }): AiPlan {
  const ramGB = hw.totalRamMB / 1024
  const bestGpu0 = [...hw.gpus].sort((a, b) => b.vramMB - a.vramMB)[0]
  const bestGpu = bestGpu0
  const needDisk = (Math.max(AI_ASSETS.models.q2_0.size, AI_ASSETS.models.q4_0.available ? AI_ASSETS.models.q4_0.size : 0) + AI_ASSETS.backends.vulkan.size) / 1048576 + 500
  const gpuOk = !!bestGpu && bestGpu.vramMB >= 4096 && hw.arch === 'x64'
  const cores = Math.max(1, hw.logicalCores)
  const base = { usable: true, parallel: 1, model: 'q2_0' as ModelKey }

  if (hw.arch !== 'x64') return { ...base, usable: false, backend: 'cpu', gpuLayers: 0, ctx: 0, threads: 0, speed: 'lenta', reason: 'Este computador não é x64; a IA local não é suportada.' }
  if (hw.freeDiskMB && hw.freeDiskMB < needDisk) return { ...base, usable: false, backend: 'cpu', gpuLayers: 0, ctx: 0, threads: 0, speed: 'lenta', reason: `Pouco espaço em disco: precisa de cerca de ${(needDisk / 1024).toFixed(1)} GB livres.` }
  if (ramGB < 6 && !gpuOk) return { ...base, usable: false, backend: 'cpu', gpuLayers: 0, ctx: 0, threads: 0, speed: 'lenta', reason: `Memória insuficiente (${ramGB.toFixed(1)} GB). São necessários pelo menos 6 GB de RAM; o bot continua funcionando sem IA.` }

  let backend: Backend = gpuOk ? 'vulkan' : 'cpu'
  if (override?.backend) backend = override.backend
  const onGpu = backend === 'vulkan'
  // Q4_0 sempre que couber folgado; Q2_0 só em computador fraco.
  const q4 = AI_ASSETS.models.q4_0
  const q4Fits = onGpu ? (bestGpu?.vramMB ?? 0) >= q4.approxMB + 1800 : hw.totalRamMB >= q4.approxMB + 3500
  const model: ModelKey = q4.available && q4Fits && !override?.model ? 'q4_0' : override?.model ?? 'q2_0'
  const modelMB = AI_ASSETS.models[model].approxMB
  const memForCtx = onGpu ? Math.max(0, (bestGpu?.vramMB ?? 0) - modelMB - 600) : Math.max(0, hw.totalRamMB - modelMB - 2500)
  let ctx = memForCtx > 3500 ? 8192 : memForCtx > 1500 ? 4096 : 2048
  if (override?.ctx) ctx = override.ctx
  const threads = onGpu ? Math.max(2, Math.min(4, Math.floor(cores / 2))) : Math.max(2, Math.min(cores - 1, Math.floor(cores * 0.75)))
  const parallel = ramGB >= 16 && ctx >= 8192 ? 2 : 1
  const speed: AiPlan['speed'] = onGpu ? 'rapida' : cores >= 8 ? 'media' : 'lenta'
  const where = onGpu ? `na placa de vídeo (${bestGpu!.name}, ${(bestGpu!.vramMB / 1024).toFixed(0)} GB)` : `no processador (${cores} núcleos)`
  const reason = `${ramGB.toFixed(0)} GB de RAM: modelo ${model === 'q4_0' ? 'Q4_0 (melhor qualidade)' : 'Q2_0 (leve)'}, rodando ${where}, com contexto de ${ctx} e ${threads} threads.` +
    (speed === 'lenta' ? ' Pode demorar alguns segundos por resposta; se o bot ficar lento, desative a IA.' : '')
  return { usable: true, backend, model, gpuLayers: onGpu ? 99 : 0, ctx, threads, parallel, speed, reason }
}
