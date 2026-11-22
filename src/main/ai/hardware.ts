import { execFile } from 'node:child_process'
import { statfsSync } from 'node:fs'
import os from 'node:os'
import { app } from 'electron'
import type { GpuInfo, Hardware } from '@shared/ai'

const run = (cmd: string, args: string[], timeout = 8000): Promise<string> =>
  new Promise((res) => execFile(cmd, args, { timeout, windowsHide: true }, (e, out) => res(e ? '' : String(out))))

const vendorOf = (n: string): GpuInfo['vendor'] => (/nvidia|geforce|rtx|gtx|quadro/i.test(n) ? 'nvidia' : /amd|radeon/i.test(n) ? 'amd' : /intel/i.test(n) ? 'intel' : 'other')

async function detectGpus(): Promise<GpuInfo[]> {
  if (process.platform !== 'win32') return []
  const gpus: GpuInfo[] = []
  // NVIDIA: valor exato via nvidia-smi
  const smi = await run('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'])
  for (const line of smi.split(/\r?\n/).filter(Boolean)) {
    const [name, mem] = line.split(',').map((x) => x.trim())
    if (name && Number(mem) > 0) gpus.push({ name, vramMB: Number(mem), vendor: 'nvidia' })
  }
  // Demais: registro do Windows (AdapterRAM é limitado a 4 GB, então usamos qwMemorySize)
  const ps = `$ErrorActionPreference='SilentlyContinue'
Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0*' | Where-Object { $_.DriverDesc } | ForEach-Object { [pscustomobject]@{ n=$_.DriverDesc; v=$_.'HardwareInformation.qwMemorySize' } } | ConvertTo-Json -Compress`
  const out = (await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps])).trim()
  try {
    const j = out ? JSON.parse(out) : []
    for (const g of Array.isArray(j) ? j : [j]) {
      let bytes = 0
      if (Array.isArray(g.v)) bytes = g.v.reduce((a: number, b: number, i: number) => a + b * 256 ** i, 0)
      else bytes = Number(g.v) || 0
      const name = String(g.n)
      if (gpus.some((x) => x.vendor === 'nvidia') && vendorOf(name) === 'nvidia') continue
      if (/basic|remote|virtual|microsoft/i.test(name)) continue
      gpus.push({ name, vramMB: Math.round(bytes / 1048576), vendor: vendorOf(name) })
    }
  } catch { /* sem informação de GPU: usa CPU */ }
  return gpus
}

export async function detectHardware(): Promise<Hardware> {
  let freeDiskMB = 0
  try { const s = statfsSync(app.getPath('userData')); freeDiskMB = Math.floor((s.bavail * s.bsize) / 1048576) } catch { /* ignora */ }
  const cpus = os.cpus()
  return {
    totalRamMB: Math.round(os.totalmem() / 1048576), freeRamMB: Math.round(os.freemem() / 1048576),
    cpuModel: cpus[0]?.model?.trim() ?? 'desconhecido', logicalCores: cpus.length || 1, arch: process.arch,
    gpus: await detectGpus(), freeDiskMB, os: process.platform
  }
}
