export interface EquipmentType { name: string; keywords: string[]; askBrand: boolean }
export interface ServiceType { name: string; keywords: string[]; askPickup: boolean }
export interface PickupOption { label: string; needsAddress: boolean }
export interface FollowUp { id: string; text: string; equipments: string[]; services: string[] }
export interface DaySchedule { open: boolean; from: string; to: string }

export interface BotConfig {
  business: { name: string; address: string; hoursText: string; phone: string }
  schedule: DaySchedule[] // 0 = domingo
  equipmentTypes: EquipmentType[]
  services: ServiceType[]
  pickup: { enabled: boolean; options: PickupOption[] }
  followUps: FollowUp[]
  messages: {
    greeting: string; askName: string; askService: string; askEquipment: string
    askBrand: string; askProblem: string; askPickup: string; askAddress: string
    askAvailability: string; confirm: string; closing: string; outOfHours: string
    handoff: string; resume: string; invalid: string; correctPrompt: string
  }
  handoff: { keywords: string[]; pauseMinutesAfterHuman: number }
  behavior: {
    enabled: boolean
    outOfHoursMode: 'collect' | 'message_only'
    resumeAfterMinutes: number
    sessionExpireHours: number
  }
}

export interface Session {
  step: string
  data: Record<string, string>
  followUps: Record<string, string>
  followUpIndex: number
  correcting?: string
  lastActivity: number
  outOfHoursNotified?: boolean
  greeted?: boolean
}

export type EngineEvent = 'none' | 'completed' | 'handoff'
export interface EngineResult { session: Session; replies: string[]; event: EngineEvent }

export type ConnState = 'disconnected' | 'connecting' | 'qr' | 'connected'
export interface WaStatus { state: ConnState; qr?: string; phone?: string; since?: number; lastError?: string }

export interface ConversationRow {
  jid: string; name: string; phone: string; status: 'bot' | 'human' | 'needs_human' | 'done'
  lastMessage: string; lastActivity: number; humanUntil: number
}
export interface MessageRow { id: number; jid: string; fromMe: number; text: string; ts: number; source: 'client' | 'bot' | 'human' }
export interface RequestRow {
  id: number; jid: string; createdAt: number; status: 'novo' | 'em_andamento' | 'concluido' | 'cancelado'
  name: string; service: string; equipment: string; brandModel: string; problem: string
  details: string; pickup: string; address: string; availability: string; notes: string
}
export interface PickupRow {
  id: number; requestId: number; name: string; phone: string; address: string; availability: string
  status: 'pendente' | 'agendada' | 'coletada' | 'cancelada'; scheduledAt: string; notes: string
}
export interface Summary {
  newRequests: number; openPickups: number; needsHuman: number; conversationsToday: number; totalRequests: number
}
export interface AppSettings {
  setupDone: boolean; startWithWindows: boolean; keepRunningInTray: boolean
  preventSleep: boolean; autoBackup: boolean; notifyHuman: boolean; backupKeep: number
}
export interface UpdateInfo { state: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'none' | 'error'; version?: string; message?: string }
