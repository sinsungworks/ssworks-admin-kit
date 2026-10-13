import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runWriteTransaction } from '../database/run.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { addToTeam, seedRole, seedTeam, seedUser } from '../test-support/auth.js'
import { KyselyAuthRepository } from './kysely-auth.repository.js'
import { hashPassword, verifyPassword } from './password.js'

let t: TestDatabase
let repo: KyselyAuthRepository

beforeAll(async () => {
  t = await createTestDatabase()
  repo = new KyselyAuthRepository(t.db)
})

afterAll(async () => {
  await t?.drop()
})

describe('findCredentialByUserId · findCredentialByNo', () => {
  it('자격 증명 행 — 해시 · 잠금 두 컬럼 · 퇴사 · 강제 변경', async () => {
    const roleNo = await seedRole(t.db)
    const lockUntil = new Date('2030-01-01T00:00:00.000Z')
    const user = await seedUser(t.db, {
      roleNo,
      userId: 'cred-admin',
      loginFailCount: 2,
      lockUntil,
      isPasswordChangeRequired: true,
    })
    const byId = await repo.findCredentialByUserId('cred-admin')
    expect(byId).toMatchObject({
      userNo: user.userNo,
      resignAt: null,
      loginFailCount: 2,
      lockUntil,
      isPasswordChangeRequired: true,
    })
    expect(await verifyPassword(byId!.passwordHash, user.password)).toBe(true)
    expect(await repo.findCredentialByNo(user.userNo)).toEqual(byId)
    expect(await repo.findCredentialByUserId('nobody')).toBeNull()
    expect(await repo.findCredentialByNo(999_999n)).toBeNull()
  })

  it('🔴 아이디는 대소문자 · 끝 공백을 가리지 않는다(utf8mb4_unicode_ci · PAD SPACE), 앞 공백은 다른 아이디 — Review Focus 1', async () => {
    const roleNo = await seedRole(t.db)
    const user = await seedUser(t.db, { roleNo, userId: 'casey' })
    expect((await repo.findCredentialByUserId('CASEY'))?.userNo).toBe(user.userNo)
    expect((await repo.findCredentialByUserId('casey '))?.userNo).toBe(user.userNo)
    expect(await repo.findCredentialByUserId(' casey')).toBeNull()
  })
})

describe('findPrincipal', () => {
  it('역할 이름 · 권한 · 대표 팀(작은 teamNo) · 퇴사 · 강제 변경을 싣는다', async () => {
    const roleNo = await seedRole(t.db, {
      roleName: '운영자',
      permissions: ['user:read', 'team:read'],
    })
    const user = await seedUser(t.db, {
      roleNo,
      userId: 'principal-a',
      userName: '김운영',
      isPasswordChangeRequired: true,
    })
    const big = await seedTeam(t.db, '나중 팀')
    const small = await seedTeam(t.db, '먼저 팀')
    const first = small < big ? small : big
    await addToTeam(t.db, big, user.userNo)
    await addToTeam(t.db, small, user.userNo)

    const principal = await repo.findPrincipal(user.userNo)
    expect(principal).toEqual({
      userNo: user.userNo,
      userId: 'principal-a',
      userName: '김운영',
      roleNo,
      roleName: '운영자',
      teamNo: first,
      teamName: first === small ? '먼저 팀' : '나중 팀',
      permissions: ['user:read', 'team:read'],
      isPasswordChangeRequired: true,
      resignAt: null,
    })
  })

  it('팀이 없으면 teamNo · teamName 이 null', async () => {
    const roleNo = await seedRole(t.db)
    const user = await seedUser(t.db, { roleNo })
    expect(await repo.findPrincipal(user.userNo)).toMatchObject({ teamNo: null, teamName: null })
  })

  it('🔴 권한 JSON 이 배열이 아니면 [], 배열이면 문자열 원소만 — fail-closed', async () => {
    const objectRole = await seedRole(t.db, { permissions: { all: true } })
    const mixedRole = await seedRole(t.db, { permissions: [1, 'user:read', null, ['x']] })
    const a = await seedUser(t.db, { roleNo: objectRole })
    const b = await seedUser(t.db, { roleNo: mixedRole })
    expect((await repo.findPrincipal(a.userNo))?.permissions).toEqual([])
    expect((await repo.findPrincipal(b.userNo))?.permissions).toEqual(['user:read'])
  })

  it('없는 사용자는 null', async () => {
    expect(await repo.findPrincipal(999_999n)).toBeNull()
  })
})

describe('saveLoginState', () => {
  it('카운트와 잠금 시각을 쓴다', async () => {
    const roleNo = await seedRole(t.db)
    const user = await seedUser(t.db, { roleNo })
    const lockUntil = new Date('2031-02-03T04:05:06.000Z')
    await repo.saveLoginState(user.userNo, { loginFailCount: 5, lockUntil })
    expect(await repo.findCredentialByNo(user.userNo)).toMatchObject({
      loginFailCount: 5,
      lockUntil,
    })
    await repo.saveLoginState(user.userNo, { loginFailCount: 0, lockUntil: null })
    expect(await repo.findCredentialByNo(user.userNo)).toMatchObject({
      loginFailCount: 0,
      lockUntil: null,
    })
  })
})

describe('changePassword', () => {
  it('🔴 기대 해시가 다르면 0행 — 아무것도 바꾸지 않는다', async () => {
    const roleNo = await seedRole(t.db)
    const user = await seedUser(t.db, { roleNo, isPasswordChangeRequired: true, loginFailCount: 3 })
    const before = await repo.findCredentialByNo(user.userNo)
    const changed = await runWriteTransaction(t.db, (trx) =>
      repo.changePassword(trx, user.userNo, 'not-the-hash', 'new-hash'),
    )
    expect(changed).toBe(0)
    expect(await repo.findCredentialByNo(user.userNo)).toEqual(before)
  })

  it('기대 해시가 같으면 1행 — 해시 교체 · 플래그 해제 · 카운터 · 잠금 초기화', async () => {
    const roleNo = await seedRole(t.db)
    const user = await seedUser(t.db, {
      roleNo,
      isPasswordChangeRequired: true,
      loginFailCount: 4,
      lockUntil: new Date('2030-01-01T00:00:00.000Z'),
    })
    const before = (await repo.findCredentialByNo(user.userNo))!
    const newHash = await hashPassword('brand-new-pass')
    const changed = await runWriteTransaction(t.db, (trx) =>
      repo.changePassword(trx, user.userNo, before.passwordHash, newHash),
    )
    expect(changed).toBe(1)
    expect(await repo.findCredentialByNo(user.userNo)).toMatchObject({
      passwordHash: newHash,
      isPasswordChangeRequired: false,
      loginFailCount: 0,
      lockUntil: null,
    })
  })
})
