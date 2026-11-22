import type { AppSettings, BotConfig, ConversationRow, MessageRow, PickupRow, RequestRow, Summary, UpdateInfo, WaStatus } from './types'

export interface SystemInfo {
  version: string; online: boolean; dataFolder: string; encryption: boolean; botActive: boolean
  offlineGaps: { from: number; to: number }[]; platform: string
}
export interface Api {
  getState(): Promise<{ config: BotConfig; settings: AppSettings; wa: WaStatus; system: SystemInfo; summary: Summary }>
  saveConfig(c: BotConfig): Promise<void>
  saveSettings(s: AppSettings): Promise<void>
  setBotEnabled(on: boolean): Promise<void>
  waConnect(): Promise<void>
  waDisconnect(): Promise<void>
  waLogout(): Promise<void>
  conversations(): Promise<ConversationRow[]>
  messages(jid: string): Promise<MessageRow[]>
  takeOver(jid: string): Promise<void>
  release(jid: string): Promise<void>
  sendManual(jid: string, text: string): Promise<void>
  requests(): Promise<RequestRow[]>
  updateRequest(id: number, p: { status?: string; notes?: string }): Promise<void>
  pickups(): Promise<PickupRow[]>
  updatePickup(id: number, p: { status?: string; scheduledAt?: string; notes?: string }): Promise<void>
  backupNow(): Promise<string | undefined>
  exportBackup(): Promise<string | undefined>
  importBackup(): Promise<string | undefined>
  listBackups(): Promise<{ name: string; size: number; time: number }[]>
  openFolder(which: 'data' | 'backups' | 'logs'): Promise<void>
  checkUpdate(): Promise<UpdateInfo>
  installUpdate(): Promise<void>
  getUpdateUrl(): Promise<string>
  setUpdateUrl(u: string): Promise<void>
  openPowerSettings(): Promise<void>
  finishSetup(): Promise<void>
  resetAll(): Promise<void>
}
export type ApiName = keyof Api
export interface Events {
  wa: WaStatus
  changed: null
  system: SystemInfo
  update: UpdateInfo
}
