import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { CryptoService } from './crypto'
import { initDb, closeDb } from './db'
import { existsSync } from 'fs'

const CONFIG_FILE = 'auth.json'
const SECURITY_FILE = 'security.json'

interface AuthConfig {
  salt: string // hex
  verificationHash: string // hex (hash of password for quick verification)
}

export interface SecurityLog {
  timestamp: number
  type: 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'LOCKOUT'
  details?: string
}

export interface SecurityState {
  failedAttempts: number
  lockoutUntil: number | null
  logs: SecurityLog[]
}

const defaultSecurityState: SecurityState = {
  failedAttempts: 0,
  lockoutUntil: null,
  logs: []
}

export const getSecurityPath = () => path.join(app.getPath('userData'), SECURITY_FILE)

const loadSecurityState = async (): Promise<SecurityState> => {
  try {
    if (existsSync(getSecurityPath())) {
      const data = await fs.readFile(getSecurityPath(), 'utf-8')
      return JSON.parse(data)
    }
  } catch (e) {
    console.error('Failed to load security state', e)
  }
  return defaultSecurityState
}

const saveSecurityState = async (state: SecurityState) => {
  // Keep only the last 100 logs
  if (state.logs.length > 100) {
    state.logs = state.logs.slice(-100)
  }
  await fs.writeFile(getSecurityPath(), JSON.stringify(state, null, 2), 'utf-8')
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

export const unlockApp = async (password: string): Promise<{ success: boolean, error?: string, lockoutRemaining?: number }> => {
  if (!isAppInitialized()) {
    throw new Error('App is not initialized')
  }

  const securityState = await loadSecurityState()
  const now = Date.now()

  if (securityState.lockoutUntil && securityState.lockoutUntil > now) {
    const remaining = Math.ceil((securityState.lockoutUntil - now) / 1000)
    return { success: false, error: 'Too many failed attempts.', lockoutRemaining: remaining }
  } else if (securityState.lockoutUntil && securityState.lockoutUntil <= now) {
    // Lockout expired, reset failed attempts
    securityState.lockoutUntil = null
    securityState.failedAttempts = 0
    await saveSecurityState(securityState)
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
    securityState.failedAttempts += 1
    
    if (securityState.failedAttempts >= 5) {
      securityState.lockoutUntil = now + 60 * 1000 // 1 minute lockout
      securityState.logs.push({ timestamp: now, type: 'LOCKOUT', details: 'Brute-force protection activated (1 min)' })
      await saveSecurityState(securityState)
      return { success: false, error: 'Too many failed attempts.', lockoutRemaining: 60 }
    } else {
      securityState.logs.push({ timestamp: now, type: 'LOGIN_FAILED', details: `Attempt ${securityState.failedAttempts}/5` })
      await saveSecurityState(securityState)
      return { success: false, error: 'Invalid password' }
    }
  }

  // Initialize DB
  try {
    initDb(key)
    sessionKey = key
    
    // Successful login
    securityState.failedAttempts = 0
    securityState.lockoutUntil = null
    securityState.logs.push({ timestamp: now, type: 'LOGIN_SUCCESS' })
    await saveSecurityState(securityState)

    return { success: true }
  } catch (err) {
    console.error('Failed to init DB:', err)
    return { success: false, error: 'Database error' }
  }
}

export const getSecurityLogs = async (): Promise<SecurityLog[]> => {
  const state = await loadSecurityState()
  return state.logs
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
