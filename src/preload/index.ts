import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { Api, Events } from '../shared/api'

const names = [
  'getState', 'saveConfig', 'saveSettings', 'setBotEnabled', 'waConnect', 'waDisconnect', 'waLogout', 'conversations', 'messages',
  'takeOver', 'release', 'send', 'pickFile', 'stageFile', 'contactGet', 'contactSave', 'openMedia', 'saveMediaAs', 'sessionGet', 'login', 'logout', 'userSave', 'userDelete', 'requests', 'updateRequest', 'pickups', 'updatePickup', 'backupNow', 'exportBackup',
  'importBackup', 'listBackups', 'openFolder', 'checkUpdate', 'installUpdate', 'getUpdateUrl', 'setUpdateUrl', 'openPowerSettings',
  'aiGetState', 'aiInstall', 'aiCancel', 'aiSetEnabled', 'aiSetOptions', 'aiTest', 'aiRemove', 'finishSetup', 'resetAll'
] as const
const api = Object.fromEntries(names.map((n) => [n, (...a: unknown[]) => ipcRenderer.invoke('api:' + n, ...a)])) as unknown as Api

contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('files', { pathFor: (f: File): string => webUtils.getPathForFile(f) })
contextBridge.exposeInMainWorld('events', {
  on<K extends keyof Events>(ev: K, cb: (v: Events[K]) => void): () => void {
    const h = (_e: unknown, v: Events[K]) => cb(v)
    ipcRenderer.on('ev:' + ev, h)
    return () => ipcRenderer.removeListener('ev:' + ev, h)
  }
})
