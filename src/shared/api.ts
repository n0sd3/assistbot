import type { AiState, ContactInfo, StagedFile, AppSettings, BotConfig, ConversationRow, MessageRow, PickupRow, RequestRow, Role, SendRequest, SessionInfo, Summary, UpdateInfo, WaStatus } from './types'

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
  /** Envia texto, foto, vídeo, áudio, documento, localização ou contato. Retorna false se o usuário cancelou a escolha do arquivo. */
  send(jid: string, req: SendRequest): Promise<boolean>
  /** Abre o seletor de arquivos e devolve um token (o arquivo só é lido pelo processo principal ao enviar). */
  pickFile(kind: 'image' | 'video' | 'audio' | 'document'): Promise<StagedFile | null>
  /** Registra um arquivo arrastado para o chat. */
  stageFile(path: string): Promise<StagedFile | null>
  contactGet(jid: string): Promise<ContactInfo>
  contactSave(jid: string, p: { name?: string; notes?: string }): Promise<void>
  openMedia(rel: string): Promise<void>
  saveMediaAs(rel: string, name: string): Promise<boolean>
  sessionGet(): Promise<SessionInfo>
  login(userId: number, pin?: string): Promise<{ ok: boolean; error?: string }>
  logout(): Promise<void>
  userSave(u: { id?: number; name: string; role: Role; pin?: string | null }): Promise<void>
  userDelete(id: number): Promise<void>
  requests(): Promise<RequestRow[]>
  updateRequest(id: number, p: { status?: string; notes?: string }): Promise<void>
  pickups(): Promise<PickupRow[]>
  updatePickup(id: number, p: { status?: string; scheduledAt?: string; notes?: string }): Promise<void>
  backupNow(): Promise<string | undefined>
  exportBackup(): Promise<string | undefined>
  importBackup(): Promise<string | undefined>
  listBackups(): Promise<{ name: string; size: number; time: number }[]>
  openFolder(which: 'data' | 'backups' | 'logs' | 'media'): Promise<void>
  checkUpdate(): Promise<UpdateInfo>
  installUpdate(): Promise<void>
  getUpdateUrl(): Promise<string>
  setUpdateUrl(u: string): Promise<void>
  openPowerSettings(): Promise<void>
  aiGetState(): Promise<AiState>
  aiInstall(): Promise<void>
  aiCancel(): Promise<void>
  aiSetEnabled(on: boolean): Promise<void>
  aiSetOptions(o: { idleMinutes?: number; override?: { backend?: 'cpu' | 'vulkan'; ctx?: number; model?: 'q4_0' | 'q2_0' } }): Promise<void>
  aiTest(text: string): Promise<string>
  aiRemove(): Promise<void>
  finishSetup(): Promise<void>
  resetAll(): Promise<void>
}
export type ApiName = keyof Api
export interface Events {
  wa: WaStatus
  changed: null
  system: SystemInfo
  update: UpdateInfo
  ai: AiState
}
