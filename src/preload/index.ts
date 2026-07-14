import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  checkInitialized: () => ipcRenderer.invoke('check-initialized'),
  setupPassword: (password: string) => ipcRenderer.invoke('setup-password', password),
  unlock: (password: string) => ipcRenderer.invoke('unlock', password),
  lock: () => ipcRenderer.invoke('lock'),
  checkLocked: () => ipcRenderer.invoke('check-locked'),
  getSecurityLogs: () => ipcRenderer.invoke('get-security-logs'),
  importPhotos: (filePaths?: string[]) => ipcRenderer.invoke('import-photos', filePaths),
  getPhotos: (filters?: { query?: string, albumId?: string }) => ipcRenderer.invoke('get-photos', filters),
  createAlbum: (name: string) => ipcRenderer.invoke('create-album', name),
  getAlbums: () => ipcRenderer.invoke('get-albums'),
  deleteAlbum: (id: string) => ipcRenderer.invoke('delete-album', id),
  
  createSmartAlbum: (name: string, rules: any[]) => ipcRenderer.invoke('create-smart-album', name, rules),
  getSmartAlbums: () => ipcRenderer.invoke('get-smart-albums'),
  deleteSmartAlbum: (id: string) => ipcRenderer.invoke('delete-smart-album', id),
  exportVideoClip: (photoId: string, startTime: number, duration: number, format: 'mp4' | 'gif') => ipcRenderer.invoke('export-video-clip', photoId, startTime, duration, format),

  
  addPhotoToAlbum: (photoId: string, albumId: string) => ipcRenderer.invoke('add-photo-to-album', photoId, albumId),
  removePhotoFromAlbum: (photoId: string, albumId: string) => ipcRenderer.invoke('remove-photo-from-album', photoId, albumId),
  
  // Face Scanning & People
  getUnscannedPhotos: () => ipcRenderer.invoke('get-unscanned-photos'),
  resetFaces: () => ipcRenderer.invoke('reset-faces'),
  saveFaces: (photoId: string, facesData: any[]) => ipcRenderer.invoke('save-faces', photoId, facesData),
  clusterFaces: () => ipcRenderer.invoke('cluster-faces'),
  getPeople: () => ipcRenderer.invoke('get-people'),
  getPersonPhotos: (personId: string) => ipcRenderer.invoke('get-person-photos', personId),
  updatePersonName: (personId: string, name: string) => ipcRenderer.invoke('update-person-name', personId, name),
  mergePeople: (targetPersonId: string, sourcePersonIds: string[]) => ipcRenderer.invoke('merge-people', targetPersonId, sourcePersonIds),
  deletePerson: (personId: string) => ipcRenderer.invoke('delete-person', personId),
  removeFaceFromPerson: (photoId: string, personId: string) => ipcRenderer.invoke('remove-face-from-person', photoId, personId),

  addTag: (photoId: string, tagName: string) => ipcRenderer.invoke('add-tag', photoId, tagName),
  removeTag: (photoId: string, tagId: string) => ipcRenderer.invoke('remove-tag', photoId, tagId),
  updateCaption: (photoId: string, caption: string) => ipcRenderer.invoke('update-caption', photoId, caption),
  getPhotoTags: (photoId: string) => ipcRenderer.invoke('get-photo-tags', photoId),
  getPhotoAlbums: (photoId: string) => ipcRenderer.invoke('get-photo-albums', photoId),
  toggleFavorite: (photoId: string, isFav: boolean) => ipcRenderer.invoke('toggle-favorite', photoId, isFav),
  moveToTrash: (photoId: string) => ipcRenderer.invoke('move-to-trash', photoId),
  restoreFromTrash: (photoId: string) => ipcRenderer.invoke('restore-from-trash', photoId),
  emptyTrash: () => ipcRenderer.invoke('empty-trash'),
  
  bulkAddTag: (photoIds: string[], tagName: string) => ipcRenderer.invoke('bulk-add-tag', photoIds, tagName),
  bulkAddToAlbum: (photoIds: string[], albumId: string) => ipcRenderer.invoke('bulk-add-to-album', photoIds, albumId),
  bulkMoveToTrash: (photoIds: string[]) => ipcRenderer.invoke('bulk-move-to-trash', photoIds),
  
  exportPhotos: (photoIds: string[]) => ipcRenderer.invoke('export-photos', photoIds),
  createBackup: () => ipcRenderer.invoke('create-backup'),

  // Auto Updater
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateAvailable: (callback: (info: any) => void) => {
    ipcRenderer.removeAllListeners('app-update-available')
    ipcRenderer.on('app-update-available', (_event, info) => callback(info))
  },
  onDownloadProgress: (callback: (progress: any) => void) => {
    ipcRenderer.removeAllListeners('app-download-progress')
    ipcRenderer.on('app-download-progress', (_event, progress) => callback(progress))
  },
  onUpdateDownloaded: (callback: (info: any) => void) => {
    ipcRenderer.removeAllListeners('app-update-downloaded')
    ipcRenderer.on('app-update-downloaded', (_event, info) => callback(info))
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
