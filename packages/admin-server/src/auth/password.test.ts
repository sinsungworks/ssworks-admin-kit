import { describe, expect, it } from 'vitest'
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password.js'

const ARGON2ID_PREFIX = '$argon2id$v=19$m=65536,t=3,p=4$'

describe('hashPassword · verifyPassword', () => {
  it('argon2id m=65536 · t=3 · p=4 로 해시하고 같은 입력만 맞다', async () => {
    const encoded = await hashPassword('correct horse 비번')
    expect(encoded.startsWith(ARGON2ID_PREFIX)).toBe(true)
    expect(await verifyPassword(encoded, 'correct horse 비번')).toBe(true)
    expect(await verifyPassword(encoded, 'correct horse 비번 ')).toBe(false)
    expect(await verifyPassword(encoded, 'Correct horse 비번')).toBe(false)
  })

  it('같은 비밀번호도 매번 다른 해시다(솔트)', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'))
  })

  it('🔴 더미 해시는 같은 매개변수다 — 없는 계정도 같은 비용을 치른다', async () => {
    expect(DUMMY_PASSWORD_HASH.startsWith(ARGON2ID_PREFIX)).toBe(true)
    for (const input of ['', 'password', '1234', 'admin']) {
      expect(await verifyPassword(DUMMY_PASSWORD_HASH, input)).toBe(false)
    }
  })

  it('🔴 깨진 해시는 던진다 — 데이터 손상이 조용히 "비밀번호 틀림" 이 되지 않는다', async () => {
    await expect(verifyPassword('garbage', 'x')).rejects.toThrow()
  })
})
