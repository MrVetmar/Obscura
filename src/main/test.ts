import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { isAppInitialized, setupMasterPassword, unlockApp, getSessionKey } from './auth'
import { getDb } from './db'
import { CryptoService } from './crypto'

export async function runTests() {
  console.log('--- STARTING BACKEND TESTS ---')
  try {
    // 1. Reset state for testing
    const userDataPath = app.getPath('userData')
    const authPath = path.join(userDataPath, 'auth.json')
    const dbPath = path.join(userDataPath, 'obscura.db')
    const dataDir = path.join(userDataPath, 'data')
    
    if (fs.existsSync(authPath)) fs.unlinkSync(authPath)
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
    if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true })
    fs.mkdirSync(dataDir, { recursive: true })

    console.log('State reset. isAppInitialized:', isAppInitialized())

    // 2. Setup Password
    console.log('Setting up master password "testpass123"')
    await setupMasterPassword('testpass123')
    console.log('isAppInitialized after setup:', isAppInitialized())

    // 3. Create fake photo file
    const fakePhotoPath = path.join(app.getPath('temp'), 'fake-photo.jpg')
    fs.writeFileSync(fakePhotoPath, 'fake image data 12345')

    // 4. Simulate Import
    const { randomUUID } = require('crypto')
    const db = getDb()
    const id = randomUUID()
    const encFilePath = path.join(dataDir, `${id}.enc`)
    
    console.log('Encrypting fake photo...')
    await CryptoService.encryptFile(fakePhotoPath, encFilePath, getSessionKey())
    
    db.prepare('INSERT INTO photos (id, path, dateAdded) VALUES (?, ?, ?)').run(id, encFilePath, Date.now())
    console.log('Photo imported successfully.')

    // 5. Test Decryption stream
    console.log('Testing decryption stream...')
    const decStream = await CryptoService.decryptFileStream(encFilePath, getSessionKey())
    let decryptedData = ''
    for await (const chunk of decStream) {
      decryptedData += chunk.toString()
    }
    if (decryptedData !== 'fake image data 12345') {
      throw new Error('Decryption failed, data mismatch!')
    }
    console.log('Decryption successful.')

    // 6. Test Albums
    console.log('Creating album...')
    const albumId = randomUUID()
    db.prepare('INSERT INTO albums (id, name, createdAt) VALUES (?, ?, ?)').run(albumId, 'Test Album', Date.now())
    db.prepare('INSERT INTO photo_albums (photoId, albumId) VALUES (?, ?)').run(id, albumId)
    
    const albumsForPhoto = db.prepare('SELECT a.* FROM albums a JOIN photo_albums pa ON a.id = pa.albumId WHERE pa.photoId = ?').all(id)
    if (albumsForPhoto.length === 0 || albumsForPhoto[0].name !== 'Test Album') {
      throw new Error('Album relation failed')
    }
    console.log('Album test passed.')

    // 7. Test Tags
    console.log('Adding tag...')
    const tagId = randomUUID()
    db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(tagId, 'vacation')
    db.prepare('INSERT INTO photo_tags (photoId, tagId) VALUES (?, ?)').run(id, tagId)

    const searchRes = db.prepare(`
      SELECT p.* FROM photos p 
      WHERE p.id IN (SELECT pt.photoId FROM photo_tags pt JOIN tags t ON pt.tagId = t.id WHERE t.name LIKE ?)
    `).all('%vac%')

    if (searchRes.length === 0) {
      throw new Error('Tag search failed')
    }
    console.log('Tag search test passed.')

    console.log('--- ALL BACKEND TESTS PASSED SUCCESSFULLY ---')
  } catch (error) {
    console.error('--- BACKEND TESTS FAILED ---', error)
  }
}
