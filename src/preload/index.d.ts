import { ElectronAPI } from '@electron-toolkit/preload'

export interface IApi {
  checkInitialized: () => Promise<boolean>
  setupPassword: (password: string) => Promise<{ success: boolean, error?: string }>
  unlock: (password: string) => Promise<{ success: boolean, error?: string, lockoutRemaining?: number }>
  lock: () => Promise<boolean>
  checkLocked: () => Promise<boolean>
  getSecurityLogs: () => Promise<any[]>
  importPhotos: (filePaths?: string[]) => Promise<{ imported: number, duplicates: number }>
  getPhotos: (filters?: { query?: string, albumId?: string }) => Promise<any[]>
  createAlbum: (name: string) => Promise<string>
  getAlbums: () => Promise<any[]>
  deleteAlbum: (id: string) => Promise<boolean>

  createSmartAlbum: (name: string, rules: any[]) => Promise<string>
  getSmartAlbums: () => Promise<any[]>
  deleteSmartAlbum: (id: string) => Promise<boolean>
  exportVideoClip: (photoId: string, startTime: number, duration: number, format: 'mp4' | 'gif') => Promise<boolean>

  addPhotoToAlbum: (photoId: string, albumId: string) => Promise<boolean>
  removePhotoFromAlbum: (photoId: string, albumId: string) => Promise<boolean>
  
  // Face Scanning & People
  getUnscannedPhotos: () => Promise<any[]>
  resetFaces: () => Promise<boolean>
  saveFaces: (photoId: string, facesData: any[]) => Promise<boolean>
  clusterFaces: () => Promise<{newPeopleCount: number, updatedFacesCount: number}>
  getPeople: () => Promise<any[]>
  getPersonPhotos: (personId: string) => Promise<any[]>
  updatePersonName: (personId: string, name: string) => Promise<boolean>
  mergePeople: (targetPersonId: string, sourcePersonIds: string[]) => Promise<boolean>
  deletePerson: (personId: string) => Promise<boolean>
  removeFaceFromPerson: (photoId: string, personId: string) => Promise<boolean>

  addTag: (photoId: string, tagName: string) => Promise<boolean>
  removeTag: (photoId: string, tagId: string) => Promise<boolean>
  updateCaption: (photoId: string, caption: string) => Promise<boolean>
  getPhotoTags: (photoId: string) => Promise<any[]>
  getPhotoAlbums: (photoId: string) => Promise<any[]>
  toggleFavorite: (photoId: string, isFav: boolean) => Promise<boolean>
  moveToTrash: (photoId: string) => Promise<boolean>
  restoreFromTrash: (photoId: string) => Promise<boolean>
  emptyTrash: () => Promise<boolean>

  bulkAddTag: (photoIds: string[], tagName: string) => Promise<boolean>
  bulkAddToAlbum: (photoIds: string[], albumId: string) => Promise<boolean>
  bulkMoveToTrash: (photoIds: string[]) => Promise<boolean>

  exportPhotos: (photoIds: string[]) => Promise<number | false>
  createBackup: () => Promise<boolean>

  // Auto Updater
  checkForUpdates: () => Promise<void>
  installUpdate: () => Promise<void>
  getAppVersion: () => Promise<string>
  onUpdateAvailable: (callback: (info: any) => void) => void
  onDownloadProgress: (callback: (progress: any) => void) => void
  onUpdateDownloaded: (callback: (info: any) => void) => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: IApi
  }
}
