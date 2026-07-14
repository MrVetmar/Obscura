import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { CryptoService } from './crypto'
import { initDb, closeDb } from './db'
import { existsSync } from 'fs'

const CONFIG_FILE = 'auth.json'

interface AuthConfig {
  salt: string // hex
  verificationHash: string // hex (hash of password for quick verification)
}

let sessionKey: Buffer | null = null

export const getAuthPath = () => path.join(app.getPath('userData'), CONFIG_FILE)

export const isAppInitialized = (): boolean => {
  return existsSync(getAuthPath())
}

export const setupMasterPassword = async (password: string): Promise<void> => {
  if (isAppInitialized()) {
    throw new Error('App is already initialized')
  }

  // Generate salt
  const salt = CryptoService.generateSalt(16)
  
  // Derive key for encryption/decryption (32 bytes)
  const key = await CryptoService.deriveKey(password, salt)
  
  // Create a verification hash (using a different salt to avoid exposing the main salt if possible, or just hash the key)
  // We can just hash the derived key to verify it next time without accessing DB
  const verifySalt = CryptoService.generateSalt(16)
  const verificationHash = await CryptoService.deriveKey(key.toString('hex'), verifySalt)

  const config: AuthConfig = {
    salt: salt.toString('hex'),
    verificationHash: verifySalt.toString('hex') + ':' + verificationHash.toString('hex')
  }

  await fs.writeFile(getAuthPath(), JSON.stringify(config), 'utf-8')

  // Initialize DB with the derived key
  initDb(key)
  
  // Save key in memory
  sessionKey = key
}

export const unlockApp = async (password: string): Promise<boolean> => {
  if (!isAppInitialized()) {
    throw new Error('App is not initialized')
  }

  const configData = await fs.readFile(getAuthPath(), 'utf-8')
  const config: AuthConfig = JSON.parse(configData)

  const salt = Buffer.from(config.salt, 'hex')
  
  // Derive key
  const key = await CryptoService.deriveKey(password, salt)

  // Verify key against verificationHash
  const [vSaltHex, vHashHex] = config.verificationHash.split(':')
  const verifySalt = Buffer.from(vSaltHex, 'hex')
  const expectedHash = await CryptoService.deriveKey(key.toString('hex'), verifySalt)

  if (expectedHash.toString('hex') !== vHashHex) {
    return false // Wrong password
  }

  // Initialize DB
  try {
    initDb(key)
    sessionKey = key
    return true
  } catch (err) {
    console.error('Failed to init DB:', err)
    return false
  }
}

export const lockApp = () => {
  sessionKey = null
  closeDb()
}

export const getSessionKey = (): Buffer => {
  if (!sessionKey) throw new Error('App is locked')
  return sessionKey
}

export const isLocked = (): boolean => {
  return sessionKey === null
}
