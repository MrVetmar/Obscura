import { app, shell, BrowserWindow, ipcMain, protocol, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { isAppInitialized, setupMasterPassword, unlockApp, lockApp, isLocked, getSessionKey } from './auth'
import { getDb } from './db'
import { CryptoService } from './crypto'
import fs from 'fs'
import path from 'path'
import { randomUUID, createHash } from 'crypto'
import { autoUpdater } from 'electron-updater'

// Register custom protocol
protocol.registerSchemesAsPrivileged([
  { scheme: 'obscura', privileges: { secure: true, standard: true, supportFetchAPI: true } }
])

let globalMainWindow: BrowserWindow | null = null

function setupAutoUpdater() {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    if (globalMainWindow) globalMainWindow.webContents.send('app-update-available', info)
  })

  autoUpdater.on('download-progress', (progressObj) => {
    if (globalMainWindow) globalMainWindow.webContents.send('app-download-progress', progressObj)
  })

  autoUpdater.on('update-downloaded', (info) => {
    if (globalMainWindow) globalMainWindow.webContents.send('app-update-downloaded', info)
  })

  autoUpdater.on('error', (err) => {
    console.error('Updater Error:', err)
  })
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  globalMainWindow = mainWindow

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.obscura.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  setupAutoUpdater()
  
  // Setup IPC handlers
  ipcMain.handle('check-for-updates', () => {
    autoUpdater.checkForUpdates()
  })
  
  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall()
  })
  
  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('check-initialized', () => isAppInitialized())
  
  ipcMain.handle('setup-password', async (_, password) => {
    try {
      await setupMasterPassword(password)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('unlock', async (_, password) => {
    try {
      const success = await unlockApp(password)
      return { success }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('lock', () => {
    lockApp()
    return true
  })

  ipcMain.handle('check-locked', () => isLocked())

  ipcMain.handle('import-photos', async (event, filePaths?: string[]) => {
    try {
      if (isLocked()) throw new Error('App is locked')
      
      let pathsToImport = filePaths
      if (!pathsToImport || pathsToImport.length === 0) {
        const result = await dialog.showOpenDialog({
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'Media', extensions: ['jpg', 'jpeg', 'png', 'heic', 'webp', 'mp4', 'mov', 'webm', 'mkv', 'avi'] }]
        })
        if (result.canceled) return { imported: 0, duplicates: 0 }
        pathsToImport = result.filePaths
      }
      
      const sharp = require('sharp')
      const ffmpeg = require('fluent-ffmpeg')
      const ffmpegStatic = require('ffmpeg-static')
      ffmpeg.setFfmpegPath(ffmpegStatic.replace('app.asar', 'app.asar.unpacked'))

      const dataDir = path.join(app.getPath('userData'), 'data')
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true })
      }

      const db = getDb()
      const key = getSessionKey()
      let importedCount = 0
      let duplicateCount = 0

      // Using transaction for faster inserts
      const insertStmt = db.prepare('INSERT INTO photos (id, path, dateAdded, originalHash, isVideo, originalName, sizeBytes) VALUES (?, ?, ?, ?, ?, ?, ?)')
      const checkHashStmt = db.prepare('SELECT id FROM photos WHERE originalHash = ?')
      
      const insertMany = db.transaction((photos: any[]) => {
        for (const p of photos) {
          insertStmt.run(p.id, p.path, p.dateAdded, p.originalHash, p.isVideo, p.originalName, p.sizeBytes)
        }
      })

      const photosToInsert: any[] = []
      const tempDir = app.getPath('temp')

      for (const file of pathsToImport) {
        let tempThumbPath = ''
        try {
          // Calculate SHA-256
          const fileBuffer = fs.readFileSync(file)
          const hash = createHash('sha256').update(fileBuffer).digest('hex')

          // Check duplicate
          if (checkHashStmt.get(hash)) {
            duplicateCount++
            continue
          }

          const id = randomUUID()
          const ext = path.extname(file).toLowerCase()
          const isVideo = ['.mp4', '.mov', '.webm', '.mkv', '.avi'].includes(ext)
          const originalName = path.basename(file)
          const sizeBytes = fs.statSync(file).size
          
          const encFilePath = path.join(dataDir, `${id}${ext}.enc`)
          const thumbEncFilePath = path.join(dataDir, `${id}.thumb.enc`)
          tempThumbPath = path.join(tempDir, `${id}_thumb.jpg`)
          
          // 1. Generate Thumbnail to temp file
          if (isVideo) {
            await new Promise<void>((resolve, reject) => {
              ffmpeg(file)
                .screenshots({
                  count: 1,
                  timemarks: ['00:00:00.000'],
                  folder: tempDir,
                  filename: `${id}_thumb.jpg`,
                  size: '400x?'
                })
                .on('end', () => resolve())
                .on('error', (err: any) => reject(err))
            })
          } else {
            await sharp(file).resize(400, 400, { fit: 'inside' }).jpeg({ quality: 80 }).toFile(tempThumbPath)
          }

          // 2. Encrypt both original and thumbnail
          await CryptoService.encryptFile(file, encFilePath, key)
          await CryptoService.encryptFile(tempThumbPath, thumbEncFilePath, key)
          
          photosToInsert.push({
            id,
            path: encFilePath,
            dateAdded: Date.now(),
            originalHash: hash,
            isVideo: isVideo ? 1 : 0,
            originalName,
            sizeBytes
          })
          importedCount++
        } catch (err) {
          console.error(`Failed to import ${file}:`, err)
        } finally {
          // Clean up temp thumbnail reliably
          try {
            if (fs.existsSync(tempThumbPath)) fs.unlinkSync(tempThumbPath)
          } catch (e) {}
        }
      }

      if (photosToInsert.length > 0) {
        insertMany(photosToInsert)
      }

      return { imported: importedCount, duplicates: duplicateCount }
    } catch (e: any) {
      console.error('Import failed:', e)
      throw e
    }
  })

  ipcMain.handle('get-photos', async (event, { query, albumId, smartAlbumId, trash, sortBy = 'dateAdded', sortOrder = 'DESC' }: { query?: string, albumId?: string, smartAlbumId?: string, trash?: boolean, sortBy?: string, sortOrder?: 'ASC' | 'DESC' } = {}) => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    // One-time backfill for old photos that don't have sizeBytes or originalName
    try {
      const missing = db.prepare('SELECT id, path FROM photos WHERE sizeBytes IS NULL OR sizeBytes = 0 OR originalName IS NULL').all() as any[]
      if (missing.length > 0) {
        const fs = require('fs')
        const updateStmt = db.prepare('UPDATE photos SET sizeBytes = ?, originalName = ? WHERE id = ?')
        db.transaction(() => {
          for (const m of missing) {
            let size = 0
            try {
              if (fs.existsSync(m.path)) {
                size = fs.statSync(m.path).size
              }
            } catch (e) {}
            updateStmt.run(size, 'Bilinmeyen Dosya', m.id)
          }
        })()
      }
    } catch (e) {
      console.error('Backfill failed:', e)
    }

    let sql = `
      SELECT p.* 
      FROM photos p
    `
    const params: any[] = []

    if (trash) {
      sql += ` WHERE p.deletedAt IS NOT NULL`
    } else {
      sql += ` WHERE p.deletedAt IS NULL`
    }

    if (albumId) {
      sql += ` AND p.id IN (SELECT photoId FROM photo_albums WHERE albumId = ?)`
      params.push(albumId)
    }
    
    if (smartAlbumId) {
      const smartAlbum = db.prepare('SELECT rules FROM smart_albums WHERE id = ?').get(smartAlbumId) as any
      if (smartAlbum && smartAlbum.rules) {
        try {
          const rules = JSON.parse(smartAlbum.rules)
          for (const rule of rules) {
            if (rule.type === 'favorite') {
              sql += ` AND p.isFavorite = 1`
            } else if (rule.type === 'video') {
              sql += ` AND p.isVideo = 1`
            } else if (rule.type === 'keyword') {
              sql += ` AND (p.caption LIKE ? OR p.originalName LIKE ?)`
              params.push(`%${rule.value}%`, `%${rule.value}%`)
            } else if (rule.type === 'tag') {
              sql += ` AND p.id IN (SELECT pt.photoId FROM photo_tags pt JOIN tags t ON pt.tagId = t.id WHERE t.name = ?)`
              params.push(rule.value)
            } else if (rule.type === 'dateRange') {
              sql += ` AND p.dateAdded >= ? AND p.dateAdded <= ?`
              params.push(rule.start, rule.end)
            }
          }
        } catch (e) {
          console.error('Failed to parse smart album rules:', e)
        }
      }
    }

    if (query) {
      // Search by tag name or caption or originalName
      sql += ` AND (
        p.id IN (SELECT pt.photoId FROM photo_tags pt JOIN tags t ON pt.tagId = t.id WHERE t.name LIKE ?)
        OR p.caption LIKE ?
        OR p.originalName LIKE ?
      )`
      params.push(`%${query}%`, `%${query}%`, `%${query}%`)
    }

    // Validation for sorting
    const allowedSortColumns = ['dateAdded', 'originalName', 'sizeBytes', 'isFavorite']
    const validSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'dateAdded'
    const validSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC'

    // If sorting by isFavorite, we want favorites first, then by dateAdded
    if (validSortBy === 'isFavorite') {
      sql += ` ORDER BY p.isFavorite DESC, p.dateAdded DESC`
    } else if (validSortBy === 'originalName') {
      // Handle NULL names by falling back to empty string
      sql += ` ORDER BY COALESCE(p.originalName, '') ${validSortOrder}, p.dateAdded DESC`
    } else if (validSortBy === 'sizeBytes') {
      // Handle NULL sizes by falling back to 0
      sql += ` ORDER BY COALESCE(p.sizeBytes, 0) ${validSortOrder}, p.dateAdded DESC`
    } else {
      sql += ` ORDER BY p.${validSortBy} ${validSortOrder}`
    }
    
    console.log(`[get-photos] sortBy: ${sortBy}, sortOrder: ${sortOrder}, final SQL: ${sql}`)
    
    const photos = db.prepare(sql).all(...params) as any[]
    const fs = require('fs/promises')
    
    await Promise.all(photos.map(async (p) => {
      const expectedThumb = p.path.replace(/\.[^.\\]+\.enc$/, '.thumb.enc')
      try {
        await fs.stat(expectedThumb)
        p.thumbPath = expectedThumb
      } catch (e) {
        p.thumbPath = p.path
      }
    }))
    
    return photos
  })

  // --- Albums ---
  ipcMain.handle('create-album', (event, name: string) => {
    try {
      if (isLocked()) throw new Error('App is locked')
      const db = getDb()
      const id = randomUUID()
      db.prepare('INSERT INTO albums (id, name, createdAt) VALUES (?, ?, ?)').run(id, name, Date.now())
      return id
    } catch (err) {
      console.error('Create album error:', err)
      throw err
    }
  })

  ipcMain.handle('get-albums', () => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    return db.prepare('SELECT * FROM albums ORDER BY name ASC').all()
  })

  ipcMain.handle('delete-album', (event, id: string) => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    db.prepare('DELETE FROM photo_albums WHERE albumId = ?').run(id)
    db.prepare('DELETE FROM albums WHERE id = ?').run(id)
    return true
  })

  // --- Smart Albums ---
  ipcMain.handle('create-smart-album', (event, name: string, rules: any[]) => {
    try {
      if (isLocked()) throw new Error('App is locked')
      const db = getDb()
      const id = randomUUID()
      db.prepare('INSERT INTO smart_albums (id, name, rules) VALUES (?, ?, ?)').run(id, name, JSON.stringify(rules))
      return id
    } catch (err) {
      console.error('Create smart album error:', err)
      throw err
    }
  })

  ipcMain.handle('get-smart-albums', () => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    const albums = db.prepare('SELECT * FROM smart_albums ORDER BY name ASC').all() as any[]
    return albums.map(a => ({
      ...a,
      rules: JSON.parse(a.rules || '[]')
    }))
  })

  ipcMain.handle('delete-smart-album', (event, id: string) => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    db.prepare('DELETE FROM smart_albums WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('add-photo-to-album', (event, photoId: string, albumId: string) => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    try {
      db.prepare('INSERT INTO photo_albums (photoId, albumId) VALUES (?, ?)').run(photoId, albumId)
    } catch (e) {
      // Ignore unique constraint error
    }
    return true
  })

  ipcMain.handle('remove-photo-from-album', (event, photoId: string, albumId: string) => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    db.prepare('DELETE FROM photo_albums WHERE photoId = ? AND albumId = ?').run(photoId, albumId)
    return true
  })

  // --- Tags ---
  ipcMain.handle('add-tag', (event, photoId: string, tagName: string) => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    
    const normalizedTag = tagName.toLowerCase().trim()
    if (!normalizedTag) return false

    // Check if tag exists
    let tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(normalizedTag) as any
    if (!tag) {
      const tagId = randomUUID()
      db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(tagId, normalizedTag)
      tag = { id: tagId }
    }

    try {
      db.prepare('INSERT INTO photo_tags (photoId, tagId) VALUES (?, ?)').run(photoId, tag.id)
    } catch (e) {
      // Ignore unique constraint error
    }
    return true
  })

  ipcMain.handle('remove-tag', (event, photoId: string, tagId: string) => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    db.prepare('DELETE FROM photo_tags WHERE photoId = ? AND tagId = ?').run(photoId, tagId)
    return true
  })

  ipcMain.handle('get-photo-tags', (event, photoId: string) => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    return db.prepare(`
      SELECT t.* FROM tags t 
      JOIN photo_tags pt ON t.id = pt.tagId 
      WHERE pt.photoId = ?
    `).all(photoId)
  })

  ipcMain.handle('get-photo-albums', (event, photoId: string) => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    return db.prepare(`
      SELECT a.* FROM albums a 
      JOIN photo_albums pa ON a.id = pa.albumId 
      WHERE pa.photoId = ?
    `).all(photoId)
  })

  // --- Favorites ---
  ipcMain.handle('toggle-favorite', (event, photoId: string, isFav: boolean) => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    db.prepare('UPDATE photos SET isFavorite = ? WHERE id = ?').run(isFav ? 1 : 0, photoId)
    return true
  })

  ipcMain.handle('update-caption', (event, photoId: string, caption: string) => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    db.prepare('UPDATE photos SET caption = ? WHERE id = ?').run(caption, photoId)
    return true
  })

  // --- Trash ---
  ipcMain.handle('move-to-trash', (event, photoId: string) => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    db.prepare('UPDATE photos SET deletedAt = ? WHERE id = ?').run(Date.now(), photoId)
    return true
  })

  ipcMain.handle('restore-from-trash', (event, photoId: string) => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    db.prepare('UPDATE photos SET deletedAt = NULL WHERE id = ?').run(photoId)
    return true
  })

  // --- Bulk Operations ---
  ipcMain.handle('bulk-add-tag', (event, photoIds: string[], tagName: string) => {
    if (isLocked() || photoIds.length === 0 || !tagName.trim()) return false
    const db = getDb()
    const name = tagName.trim()
    
    let tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as any
    if (!tag) {
      const id = randomUUID()
      db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(id, name)
      tag = { id }
    }
    
    const insertStmt = db.prepare('INSERT OR IGNORE INTO photo_tags (photoId, tagId) VALUES (?, ?)')
    db.transaction(() => {
      for (const photoId of photoIds) {
        insertStmt.run(photoId, tag.id)
      }
    })()
    return true
  })

  ipcMain.handle('bulk-add-to-album', (event, photoIds: string[], albumId: string) => {
    if (isLocked() || photoIds.length === 0 || !albumId) return false
    const db = getDb()
    
    const insertStmt = db.prepare('INSERT OR IGNORE INTO photo_albums (photoId, albumId) VALUES (?, ?)')
    db.transaction(() => {
      for (const photoId of photoIds) {
        insertStmt.run(photoId, albumId)
      }
    })()
    return true
  })

  ipcMain.handle('bulk-move-to-trash', (event, photoIds: string[]) => {
    if (isLocked() || photoIds.length === 0) return false
    const db = getDb()
    
    const updateStmt = db.prepare('UPDATE photos SET deletedAt = ? WHERE id = ?')
    const now = Date.now()
    db.transaction(() => {
      for (const photoId of photoIds) {
        updateStmt.run(now, photoId)
      }
    })()
    return true
  })

  ipcMain.handle('empty-trash', async () => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    const fs = require('fs')
    
    const trashedPhotos = db.prepare('SELECT id, path FROM photos WHERE deletedAt IS NOT NULL').all() as any[]
    for (const photo of trashedPhotos) {
      try {
        if (fs.existsSync(photo.path)) fs.unlinkSync(photo.path)
        const thumbPath = photo.path.replace(/\.[^.\\]+\.enc$/, '.thumb.enc')
        if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath)
      } catch (err) {
        console.error('Failed to delete file:', err)
      }
    }
    db.prepare('DELETE FROM photos WHERE deletedAt IS NOT NULL').run()
    return true
  })

  // --- Export & Backup ---
  ipcMain.handle('export-photos', async (event, photoIds: string[]) => {
    if (isLocked() || photoIds.length === 0) return false
    const db = getDb()
    const path = require('path')
    
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    
    if (result.canceled || result.filePaths.length === 0) return false
    const exportDir = result.filePaths[0]
    const key = getSessionKey()

    const placeholders = photoIds.map(() => '?').join(',')
    const photos = db.prepare(`SELECT id, path FROM photos WHERE id IN (${placeholders})`).all(...photoIds) as any[]

    let exported = 0
    for (const photo of photos) {
      try {
        const ext = photo.path.endsWith('.enc') ? path.extname(photo.path.replace('.enc', '')) || '.jpg' : '.jpg'
        let outPath = path.join(exportDir, `export_${photo.id}${ext}`)
        
        // Prevent overwrite
        let counter = 1
        const fs = require('fs')
        while (fs.existsSync(outPath)) {
          outPath = path.join(exportDir, `export_${photo.id}(${counter})${ext}`)
          counter++
        }
        
        const stream = await CryptoService.decryptFileStream(photo.path, key)
        const outStream = fs.createWriteStream(outPath)
        
        await new Promise((resolve, reject) => {
          stream.pipe(outStream)
          stream.on('end', resolve)
          stream.on('error', reject)
        })
        exported++
      } catch (err) {
        console.error('Export error for photo', photo.id, err)
      }
    }
    return exported
  })

  ipcMain.handle('export-video-clip', async (event, photoId: string, startTime: number, duration: number, format: 'mp4' | 'gif') => {
    if (isLocked()) return false
    const db = getDb()
    const fs = require('fs')
    const path = require('path')
    
    const photo = db.prepare('SELECT id, path FROM photos WHERE id = ? AND isVideo = 1').get(photoId) as any
    if (!photo) throw new Error('Video not found')

    const result = await dialog.showSaveDialog({
      title: 'Klibi Kaydet',
      defaultPath: `clip_${photo.id}.${format}`,
      filters: [{ name: format === 'mp4' ? 'Video' : 'GIF', extensions: [format] }]
    })
    
    if (result.canceled || !result.filePath) return false

    const savePath = result.filePath
    const tempVideoPath = path.join(app.getPath('temp'), `${photo.id}_temp_full.mp4`)
    const key = getSessionKey()

    try {
      // 1. Decrypt full video to temp path
      const stream = await CryptoService.decryptFileStream(photo.path, key)
      const outStream = fs.createWriteStream(tempVideoPath)
      await new Promise((resolve, reject) => {
        stream.pipe(outStream)
        stream.on('end', resolve)
        stream.on('error', reject)
      })

      // 2. Run ffmpeg
      const ffmpeg = require('fluent-ffmpeg')
      const ffmpegStatic = require('ffmpeg-static')
      ffmpeg.setFfmpegPath(ffmpegStatic.replace('app.asar', 'app.asar.unpacked'))

      await new Promise<void>((resolve, reject) => {
        let command = ffmpeg(tempVideoPath)
          .setStartTime(startTime)
          .setDuration(duration)

        if (format === 'gif') {
          // Add basic fps and scale for GIF to keep size reasonable
          command = command.fps(15).size('480x?')
        } else {
          // For MP4, copy codec to be fast if possible, but since we are clipping, we might need to re-encode
          // Let ffmpeg handle defaults
        }

        command
          .output(savePath)
          .on('end', () => resolve())
          .on('error', (err: any) => reject(err))
          .run()
      })
      
      return true
    } catch (err) {
      console.error('Export video clip error:', err)
      throw err
    } finally {
      // 3. Clean up temp video
      try {
        if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath)
      } catch (e) {}
    }
  })

  ipcMain.handle('get-unscanned-photos', async () => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    // Photos that are not deleted and not scanned (videos are now included by scanning their thumbnail)
    const photos = db.prepare('SELECT id, path, isVideo FROM photos WHERE deletedAt IS NULL AND isFaceScanned = 0').all() as any[]
    const fs = require('fs/promises')
    await Promise.all(photos.map(async (p) => {
      const expectedThumb = p.path.replace(/\.[^.\\]+\.enc$/, '.thumb.enc')
      try {
        await fs.stat(expectedThumb)
        p.thumbPath = expectedThumb
      } catch (e) {
        p.thumbPath = p.path
      }
    }))
    return photos
  })

  ipcMain.handle('reset-faces', () => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    db.transaction(() => {
      db.prepare('DELETE FROM faces').run()
      db.prepare('DELETE FROM people').run()
      db.prepare('UPDATE photos SET isFaceScanned = 0').run()
    })()
    return true
  })

  ipcMain.handle('save-faces', (event, photoId: string, facesData: any[]) => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    
    db.transaction(() => {
      // Mark photo as scanned
      db.prepare('UPDATE photos SET isFaceScanned = 1 WHERE id = ?').run(photoId)
      
      const insertFace = db.prepare('INSERT INTO faces (id, photoId, embedding, boundingBox) VALUES (?, ?, ?, ?)')
      for (const face of facesData) {
        insertFace.run(
          randomUUID(),
          photoId,
          JSON.stringify(face.descriptor), // Array of 128 floats
          JSON.stringify(face.box)         // {x, y, width, height}
        )
      }
    })()
    
    return true
  })

  ipcMain.handle('cluster-faces', () => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    
    const allFaces = db.prepare('SELECT id, photoId, personId, embedding FROM faces').all() as any[]
    const people = db.prepare('SELECT id, representativeFaceId FROM people').all() as any[]
    
    // Very simple clustering algorithm (Euclidean distance < 0.55)
    // In a real production app, consider DBSCAN or Chinese Whispers for 128D vectors.
    const euclideanDistance = (a: number[], b: number[]) => {
      return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0))
    }
    
    let newPeopleCount = 0
    let updatedFacesCount = 0

    db.transaction(() => {
      for (const face of allFaces) {
        if (face.personId) continue // already clustered
        
        const desc1 = JSON.parse(face.embedding)
        let matchedPersonId: string | null = null
        let minDistance = 0.58 // Increased threshold for better matching
        
        // Find closest person
        for (const person of people) {
          // Compare with all known faces of that person to find the closest match
          const personFaces = allFaces.filter(f => f.personId === person.id || f.id === person.representativeFaceId)
          
          let personMinDist = Infinity
          for (const pf of personFaces) {
            const desc2 = JSON.parse(pf.embedding)
            const dist = euclideanDistance(desc1, desc2)
            if (dist < personMinDist) personMinDist = dist
          }
          
          if (personMinDist < minDistance) {
            minDistance = personMinDist
            matchedPersonId = person.id
          }
        }
        
        if (matchedPersonId) {
          db.prepare('UPDATE faces SET personId = ? WHERE id = ?').run(matchedPersonId, face.id)
          face.personId = matchedPersonId // update in memory for next iterations
          updatedFacesCount++
        } else {
          // Create new person
          const newPersonId = randomUUID()
          newPeopleCount++
          const personName = `Bilinmeyen Kişi #${people.length + newPeopleCount}`
          
          db.prepare('INSERT INTO people (id, name, representativeFaceId) VALUES (?, ?, ?)').run(newPersonId, personName, face.id)
          db.prepare('UPDATE faces SET personId = ? WHERE id = ?').run(newPersonId, face.id)
          
          face.personId = newPersonId // update in memory
          people.push({ id: newPersonId, representativeFaceId: face.id })
        }
      }
    })()

    return { newPeopleCount, updatedFacesCount }
  })

  ipcMain.handle('get-people', () => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    // Return all people with their representative face photo path and bounding box
    const query = `
      SELECT p.id, p.name, p.representativeFaceId, f.photoId, f.boundingBox, ph.path as photoPath
      FROM people p
      JOIN faces f ON p.representativeFaceId = f.id
      JOIN photos ph ON f.photoId = ph.id
      ORDER BY p.name ASC
    `
    return db.prepare(query).all()
  })

  ipcMain.handle('get-person-photos', async (event, personId: string) => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    const query = `
      SELECT DISTINCT ph.* 
      FROM photos ph
      JOIN faces f ON f.photoId = ph.id
      WHERE f.personId = ?
      ORDER BY ph.dateAdded DESC
    `
    const photos = db.prepare(query).all(personId) as any[]
    const fs = require('fs/promises')
    await Promise.all(photos.map(async (p) => {
      const expectedThumb = p.path.replace(/\.[^.\\]+\.enc$/, '.thumb.enc')
      try {
        await fs.stat(expectedThumb)
        p.thumbPath = expectedThumb
      } catch (e) {
        p.thumbPath = p.path
      }
    }))
    return photos
  })

  ipcMain.handle('update-person-name', (event, personId: string, name: string) => {
    if (isLocked()) throw new Error('App is locked')
    const db = getDb()
    db.prepare('UPDATE people SET name = ? WHERE id = ?').run(name, personId)
    return true
  })

  ipcMain.handle('create-backup', async () => {
    if (isLocked()) return false
    const path = require('path')
    const archiver = require('archiver')
    
    const result = await dialog.showSaveDialog({
      title: 'Yedekleme Kaydet',
      defaultPath: `obscura_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.zip`,
      filters: [{ name: 'ZIP Archives', extensions: ['zip'] }]
    })
    
    if (result.canceled || !result.filePath) return false

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(result.filePath)
      const archive = archiver('zip', { zlib: { level: 9 } })
      
      output.on('close', () => resolve(true))
      archive.on('error', (err: any) => reject(err))
      
      archive.pipe(output)
      
      const userDataPath = app.getPath('userData')
      const dbPath = path.join(userDataPath, 'obscura.db')
      const dataDir = path.join(userDataPath, 'data')
      
      if (fs.existsSync(dbPath)) {
        archive.file(dbPath, { name: 'obscura.db' })
      }
      
      if (fs.existsSync(dataDir)) {
        archive.directory(dataDir, 'data')
      }
      
      archive.finalize()
    })
  })

  // Custom protocol to serve decrypted images
  protocol.handle('obscura', async (request) => {
    try {
      if (isLocked()) {
        return new Response('App is locked', { status: 403 })
      }
      // Replace 'obscura://local/' to handle Windows drive letters properly (Chromium URL host restrictions)
      const urlPath = request.url.replace('obscura://local/', '')
      const decodedPath = decodeURIComponent(urlPath)
      
      const key = getSessionKey()
      
      const fs = require('fs/promises')
      const stat = await fs.stat(decodedPath)
      const IV_LENGTH = 12
      const TAG_LENGTH = 16
      const plaintextSize = stat.size - IV_LENGTH - TAG_LENGTH

      const rangeHeader = request.headers.get('Range')
      let start = 0
      let end = plaintextSize - 1

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-')
        start = parseInt(parts[0], 10)
        end = parts[1] ? parseInt(parts[1], 10) : plaintextSize - 1
      }
      
      const stream = rangeHeader 
        ? await CryptoService.decryptPartialFileStream(decodedPath, key, start, end)
        : await CryptoService.decryptFileStream(decodedPath, key)
      
      const { Readable } = require('stream')
      const webStream = Readable.toWeb(stream)
      
      const path = require('path')
      const ext = path.extname(decodedPath.replace('.enc', '')).toLowerCase()
      let mimeType = 'image/jpeg'
      if (ext === '.png') mimeType = 'image/png'
      else if (ext === '.webp') mimeType = 'image/webp'
      else if (ext === '.mp4') mimeType = 'video/mp4'
      else if (ext === '.webm') mimeType = 'video/webm'
      else if (ext === '.mov') mimeType = 'video/quicktime'
      else if (ext === '.avi') mimeType = 'video/x-msvideo'
      
      if (rangeHeader) {
        return new Response(webStream, {
          status: 206,
          headers: { 
            'Content-Type': mimeType,
            'Accept-Ranges': 'bytes',
            'Content-Range': `bytes ${start}-${end}/${plaintextSize}`,
            'Content-Length': `${end - start + 1}`,
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
          }
        })
      } else {
        return new Response(webStream, {
          headers: { 
            'Content-Type': mimeType,
            'Accept-Ranges': 'bytes',
            'Content-Length': `${plaintextSize}`,
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
          }
        })
      }
    } catch (err: any) {
      console.error('Protocol handle error:', err)
      return new Response(err.message, { status: 500 })
    }
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Cleanup routine: Delete photos in trash older than 30 days
  const cleanupTrash = () => {
    try {
      const db = getDb()
      if (!db) return
      const fs = require('fs')
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
      const cutoff = Date.now() - THIRTY_DAYS_MS
      
      const oldTrashedPhotos = db.prepare('SELECT id, path FROM photos WHERE deletedAt IS NOT NULL AND deletedAt < ?').all(cutoff) as any[]
      for (const photo of oldTrashedPhotos) {
        try {
          if (fs.existsSync(photo.path)) fs.unlinkSync(photo.path)
          const thumbPath = photo.path.replace(/\.[^.\\]+\.enc$/, '.thumb.enc')
          if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath)
        } catch (err) {}
      }
      if (oldTrashedPhotos.length > 0) {
        db.prepare('DELETE FROM photos WHERE deletedAt IS NOT NULL AND deletedAt < ?').run(cutoff)
      }
    } catch (e) {
      console.error('Cleanup trash error:', e)
    }
  }

  // Run cleanup once on startup
  cleanupTrash()
})
