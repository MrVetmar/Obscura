import crypto from 'crypto'
import argon2 from 'argon2'
import fs from 'fs'
import { pipeline } from 'stream/promises'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16
const KEY_LENGTH = 32

export class CryptoService {
  /**
   * Derives a 32-byte key from a password and salt using Argon2id
   */
  static async deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      raw: true,
      salt: salt,
      hashLength: KEY_LENGTH,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4
    })
  }

  /**
   * Generates a random salt
   */
  static generateSalt(length: number = 16): Buffer {
    return crypto.randomBytes(length)
  }

  /**
   * Encrypts a file and writes [IV][AuthTag][Ciphertext] to the output path
   */
  static async encryptFile(inputPath: string, outputPath: string, key: Buffer): Promise<void> {
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    const inputStream = fs.createReadStream(inputPath)
    
    // We write to a temporary file first to prevent data corruption on crash
    const tempOutputPath = outputPath + '.tmp'
    const outputStream = fs.createWriteStream(tempOutputPath)

    // Write IV at the beginning
    outputStream.write(iv)

    await pipeline(inputStream, cipher, outputStream)

    // After pipeline finishes, we can get the auth tag from the cipher
    const authTag = cipher.getAuthTag()
    
    // Append the Auth Tag at the end of the file
    await fs.promises.appendFile(tempOutputPath, authTag)

    // Atomically move the complete file to the final destination
    await fs.promises.rename(tempOutputPath, outputPath)
  }

  /**
   * Decrypts a file on the fly and returns a Readable stream of the plaintext.
   * Assumes the file format is [IV(12)][Ciphertext][AuthTag(16)]
   */
  static async decryptFileStream(inputPath: string, key: Buffer): Promise<NodeJS.ReadableStream> {
    const stat = await fs.promises.stat(inputPath)
    if (stat.size < IV_LENGTH + TAG_LENGTH) {
      throw new Error('File too small to be encrypted.')
    }

    // Read IV (first 12 bytes)
    const fd = await fs.promises.open(inputPath, 'r')
    const ivBuf = Buffer.alloc(IV_LENGTH)
    await fd.read(ivBuf, 0, IV_LENGTH, 0)

    // Read AuthTag (last 16 bytes)
    const tagBuf = Buffer.alloc(TAG_LENGTH)
    await fd.read(tagBuf, 0, TAG_LENGTH, stat.size - TAG_LENGTH)
    
    await fd.close()

    const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuf)
    decipher.setAuthTag(tagBuf)

    // Read ciphertext stream (skip IV at start, and skip AuthTag at end)
    const ciphertextLength = stat.size - IV_LENGTH - TAG_LENGTH
    const inputStream = fs.createReadStream(inputPath, {
      start: IV_LENGTH,
      end: IV_LENGTH + ciphertextLength - 1
    })

    return inputStream.pipe(decipher)
  }

  /**
   * Decrypts a specific byte range of the file.
   * Leverages AES-256-CTR mode compatibility with AES-256-GCM to allow fast seeking without authenticating the tag.
   */
  static async decryptPartialFileStream(inputPath: string, key: Buffer, start: number, end: number): Promise<NodeJS.ReadableStream> {
    const stat = await fs.promises.stat(inputPath)
    if (stat.size < IV_LENGTH + TAG_LENGTH) throw new Error('File too small')

    // Read IV (first 12 bytes)
    const fd = await fs.promises.open(inputPath, 'r')
    const ivBuf = Buffer.alloc(IV_LENGTH)
    await fd.read(ivBuf, 0, IV_LENGTH, 0)
    await fd.close()

    // Calculate CTR mode parameters
    const blockOffset = Math.floor(start / 16)
    const byteOffset = start % 16
    
    // Construct new 16-byte IV for CTR mode (GCM appends a 4-byte counter starting at 2)
    const counterBuf = Buffer.alloc(4)
    counterBuf.writeUInt32BE(2 + blockOffset, 0)
    const ctrIv = Buffer.concat([ivBuf, counterBuf])
    
    const decipher = crypto.createDecipheriv('aes-256-ctr', key, ctrIv)
    
    // Calculate file offsets
    const fileStart = IV_LENGTH + (blockOffset * 16)
    const fileEnd = IV_LENGTH + end
    
    const inputStream = fs.createReadStream(inputPath, {
      start: fileStart,
      end: fileEnd
    })

    // Slicer transform to discard the initial 'byteOffset' bytes
    const { Transform } = require('stream')
    let bytesToDiscard = byteOffset
    
    const slicer = new Transform({
      transform(chunk, encoding, callback) {
        if (bytesToDiscard > 0) {
          if (chunk.length <= bytesToDiscard) {
            bytesToDiscard -= chunk.length
            callback()
          } else {
            const sliced = chunk.slice(bytesToDiscard)
            bytesToDiscard = 0
            this.push(sliced)
            callback()
          }
        } else {
          this.push(chunk)
          callback()
        }
      }
    })

    return inputStream.pipe(decipher).pipe(slicer)
  }
}

