import { describe, it, expect } from 'vitest'
// Backend CJS module under api/ — imported here so it runs under the
// project's existing `vitest run` (which only discovers src/**/*.test.js).
import * as emailCrypto from '../../api/_lib/emailCrypto.js'

const { encrypt, decrypt, rotate, isEncrypted, makeKeyring } = emailCrypto

// Deterministic keyrings for tests (no env needed). 32-byte keys.
const KEY1 = Buffer.alloc(32, 1)
const KEY2 = Buffer.alloc(32, 2)
const kr1 = makeKeyring({ '1': KEY1 }, '1')
const kr2 = makeKeyring({ '1': KEY1, '2': KEY2 }, '2') // v2 current, v1 kept

describe('emailCrypto AES-256-GCM', () => {
  it('round-trips plaintext', () => {
    const secret = 'ya29.a0Af_refresh_token_value-1234567890'
    const env = encrypt(secret, kr1)
    expect(isEncrypted(env)).toBe(true)
    expect(env).not.toContain(secret)          // ciphertext must not leak plaintext
    expect(decrypt(env, kr1)).toBe(secret)
  })

  it('uses a different IV/ciphertext each time', () => {
    const a = encrypt('same-token', kr1)
    const b = encrypt('same-token', kr1)
    expect(a).not.toBe(b)                        // random IV → different envelope
    expect(decrypt(a, kr1)).toBe('same-token')
    expect(decrypt(b, kr1)).toBe('same-token')
  })

  it('rejects tampered ciphertext (auth tag)', () => {
    const env = encrypt('tamper-me', kr1)
    // Decode the packed payload, flip one byte in the IV|tag|ct region, and
    // re-pack. Any single-byte change must fail GCM authentication. (Editing
    // the base64 text directly is unreliable — trailing bits can be absorbed
    // by padding.)
    const sep = env.indexOf(':', 'enc:v'.length)
    const prefix = env.slice(0, sep + 1)
    const packed = Buffer.from(env.slice(sep + 1), 'base64')
    packed[Math.floor(packed.length / 2)] ^= 0xff
    const flipped = prefix + packed.toString('base64')
    expect(() => decrypt(flipped, kr1)).toThrow(/decryption failed/)
  })

  it('rejects wrong key', () => {
    const env = encrypt('secret', kr1)                 // encrypted under v1=KEY1
    const wrong = makeKeyring({ '1': KEY2 }, '1')      // same version label, different key
    expect(() => decrypt(env, wrong)).toThrow(/decryption failed/)
  })

  it('embeds and honors the key version', () => {
    const env = encrypt('v-check', kr2)                // current version is '2'
    expect(env.startsWith('enc:v2:')).toBe(true)
    expect(decrypt(env, kr2)).toBe('v-check')
    // a keyring without v2 cannot read it
    const onlyV1 = makeKeyring({ '1': KEY1 }, '1')
    expect(() => decrypt(env, onlyV1)).toThrow(/decryption failed/)
  })

  it('rotates an old-version envelope to the current version', () => {
    const oldEnv = encrypt('rotate-me', kr1)           // v1
    expect(oldEnv.startsWith('enc:v1:')).toBe(true)
    const newEnv = rotate(oldEnv, kr2)                 // → v2 (kr2 knows v1 to decrypt)
    expect(newEnv.startsWith('enc:v2:')).toBe(true)
    expect(decrypt(newEnv, kr2)).toBe('rotate-me')
  })

  it('seal() passes through when no key is configured (legacy safety)', () => {
    const emptyKr = { currentVersion: '1', keys: {} }
    expect(emailCrypto.seal('plain', emptyKr)).toBe('plain')     // no key → unchanged
    expect(emailCrypto.open('plain', kr1)).toBe('plain')         // legacy plaintext read
    const env = emailCrypto.seal('x', kr1)
    expect(isEncrypted(env)).toBe(true)
    expect(emailCrypto.open(env, kr1)).toBe('x')
  })
})
