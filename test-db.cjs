import Database from 'better-sqlite3-multiple-ciphers'
import path from 'path'
import fs from 'fs'

const authPath = path.join(process.env.APPDATA || '', 'obscura', 'auth.json')
const config = JSON.parse(fs.readFileSync(authPath, 'utf8'))
const salt = Buffer.from(config.salt, 'hex')
const crypto = require('crypto')

crypto.pbkdf2('1234', salt, 100000, 32, 'sha256', (err, key) => {
  const dbPath = path.join(process.env.APPDATA || '', 'obscura', 'data', 'obscura.db')
  const db = new Database(dbPath)
  db.pragma(`key = "x'${key.toString('hex')}'"`)
  db.pragma('foreign_keys = ON')

  try {
    const albums = db.prepare('SELECT * FROM smart_albums ORDER BY name ASC').all()
    console.log('Smart Albums:', albums)
  } catch (e) {
    console.error('Error selecting smart albums:', e)
  }
})
