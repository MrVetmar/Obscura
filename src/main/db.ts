import Database from 'better-sqlite3-multiple-ciphers'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'

let db: any = null

export const getDbPath = () => {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'obscura.db')
}

export const initDb = (key: Buffer) => {
  const dbPath = getDbPath()
  
  // Ensure directory exists
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // Convert buffer key to hex string for PRAGMA key
  const hexKey = key.toString('hex')

  // Open database
  db = new Database(dbPath)
  
  // Set the encryption key using SQLCipher syntax (default cipher is sqlcipher)
  db.pragma(`key = "x'${hexKey}'"`)
  
  // Enable foreign key constraints to prevent orphan records
  db.pragma('foreign_keys = ON')
  
  // Verify if the key is correct by doing a simple query
  // If the key is wrong, this will throw an error (e.g., "file is not a database")
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS photos (
        id TEXT PRIMARY KEY, 
        path TEXT, 
        dateAdded INTEGER,
        isFavorite INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS albums (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        coverPhotoId TEXT,
        createdAt INTEGER
      );

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE
      );

      CREATE TABLE IF NOT EXISTS photo_albums (
        photoId TEXT,
        albumId TEXT,
        PRIMARY KEY (photoId, albumId),
        FOREIGN KEY (photoId) REFERENCES photos(id) ON DELETE CASCADE,
        FOREIGN KEY (albumId) REFERENCES albums(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS photo_tags (
        photoId TEXT,
        tagId TEXT,
        PRIMARY KEY (photoId, tagId),
        FOREIGN KEY (photoId) REFERENCES photos(id) ON DELETE CASCADE,
        FOREIGN KEY (tagId) REFERENCES tags(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS smart_albums (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        rules TEXT NOT NULL,
        createdAt INTEGER
      );

      CREATE TABLE IF NOT EXISTS people (
        id TEXT PRIMARY KEY,
        name TEXT,
        representativeFaceId TEXT
      );

      CREATE TABLE IF NOT EXISTS faces (
        id TEXT PRIMARY KEY,
        photoId TEXT NOT NULL,
        personId TEXT,
        embedding TEXT NOT NULL,
        boundingBox TEXT NOT NULL,
        FOREIGN KEY (photoId) REFERENCES photos(id) ON DELETE CASCADE,
        FOREIGN KEY (personId) REFERENCES people(id) ON DELETE SET NULL
      );
    `)

    // Migrations
    try { db.exec('ALTER TABLE photos ADD COLUMN isFavorite INTEGER DEFAULT 0') } catch (e) {}
    try { db.exec('ALTER TABLE photos ADD COLUMN originalHash TEXT') } catch (e) {}
    try { db.exec('ALTER TABLE photos ADD COLUMN deletedAt INTEGER') } catch (e) {}
    try { db.exec('ALTER TABLE photos ADD COLUMN isVideo INTEGER DEFAULT 0') } catch (e) {}
    
    // Phase 5 Migrations
    try { db.exec('ALTER TABLE photos ADD COLUMN caption TEXT DEFAULT ""') } catch (e) {}
    try { db.exec('ALTER TABLE photos ADD COLUMN originalName TEXT') } catch (e) {}
    try { db.exec('ALTER TABLE photos ADD COLUMN sizeBytes INTEGER DEFAULT 0') } catch (e) {}
    try { db.exec('ALTER TABLE photos ADD COLUMN isFaceScanned INTEGER DEFAULT 0') } catch (e) {}
  } catch (err) {
    console.error('Database initialization error:', err)
    db.close()
    db = null
    throw new Error('Invalid password or corrupted database')
  }

  return db
}

export const getDb = () => {
  if (!db) throw new Error('Database not initialized. Call initDb first.')
  return db
}

export const closeDb = () => {
  if (db) {
    db.close()
    db = null
  }
}
