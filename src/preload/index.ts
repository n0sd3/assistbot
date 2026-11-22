import { contextBridge, ipcRenderer } from 'electron'
import type { Api, Events } from '../shared/api'

const names = [
  'getState', 'saveConfig', 'saveSettings', 'setBotEnabled', 'waConnect', 'waDisconnect', 'waLogout', 'conversations', 'messages',
  'takeOver', 'release', 'sendManual', 'requests', 'updateRequest', 'pickups', 'updatePickup', 'backupNow', 'exportBackup',
  'importBackup', 'listBackups', 'openFolder', 'checkUpdate', 'installUpdate', 'getUpdateUrl', 'setUpdateUrl', 'openPowerSettings',
  'aiGetState', 'aiInstall', 'aiCancel', 'aiSetEnabled', 'aiSetOptions', 'aiTest', 'aiRemove', 'finishSetup', 'resetAll'
] as const
const api = Object.fromEntries(names.map((n) => [n, (...a: unknown[]) => ipcRenderer.invoke('api:' + n, ...a)])) as unknown as Api

contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('events', {
  on<K extends keyof Events>(ev: K, cb: (v: Events[K]) => void): () => void {
    const h = (_e: unknown, v: Events[K]) => cb(v)
    ipcRenderer.on('ev:' + ev, h)
    return () => ipcRenderer.removeListener('ev:' + ev, h)
  }
})
