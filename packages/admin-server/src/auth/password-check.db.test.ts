import type { KyselyPlugin } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedRole, seedUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { KyselyAuthRepository } from './kysely-auth.repository.js'
import { updateLoginState } from './password-check.js'

// 카운터의 원자성은 패키지가 맡는다(2f-2a 스펙 A10 — 2b 스펙 §14 R8 을 리포지토리에서 옮겼다).

let t: TestDatabase
let roleNo: bigint
let repo: KyselyAuthRepository

beforeAll(async () => {
  t = await createTestDatabase()
  roleNo = await seedRole(t.db, { roleName: '카운터', permissions: ['user:read'] })
  repo = new KyselyAuthRepository(t.db)
})

afterAll(async () => {
  await t?.drop()
})

describe('updateLoginState(db, repo, …)', () => {
  it('next 는 현재 행 값을 받고, 돌려준 상태가 저장된다', async () => {
    const user = await seedUser(t.db, { roleNo, loginFailCount: 2 })
    const lockUntil = new Date('2031-02-03T04:05:06.000Z')
    const state = await updateLoginState(t.db, repo, user.userNo, (current) => ({
      loginFailCount: current.loginFailCount + 1,
      lockUntil,
    }))
    expect(state).toEqual({ loginFailCount: 3, lockUntil })
    expect(await repo.findCredentialByNo(user.userNo)).toMatchObject({
      loginFailCount: 3,
      lockUntil,
    })
  })

  it('🔴 병렬 8건이 모두 센다 — lockCredential(update) 행 잠금(2b F2)', async () => {
    const user = await seedUser(t.db, { roleNo })
    await Promise.all(
      Array.from({ length: 8 }, () =>
        updateLoginState(t.db, repo, user.userNo, (current) => ({
          loginFailCount: current.loginFailCount + 1,
          lockUntil: null,
        })),
      ),
    )
    expect((await repo.findCredentialByNo(user.userNo))?.loginFailCount).toBe(8)
  })

  it('next 가 값을 바꾸지 않으면 UPDATE 를 보내지 않는다 — 카운터가 이미 { 0, null } 인 정상 경로', async () => {
    const user = await seedUser(t.db, { roleNo })
    const kinds: string[] = []
    const recorder: KyselyPlugin = {
      transformQuery: (args) => {
        kinds.push(args.node.kind)
        return args.node
      },
      transformResult: async (args) => args.result,
    }
    const recorded = t.db.withPlugin(recorder)

    const unchanged = await updateLoginState(recorded, repo, user.userNo, (current) => ({
      ...current,
    }))
    expect(unchanged).toEqual({ loginFailCount: 0, lockUntil: null })
    expect(kinds).toEqual(['SelectQueryNode'])

    kinds.length = 0
    const lockUntil = new Date('2031-02-03T04:05:06.000Z')
    await updateLoginState(recorded, repo, user.userNo, () => ({ loginFailCount: 5, lockUntil }))
    expect(kinds).toEqual(['SelectQueryNode', 'UpdateQueryNode'])

    // 같은 순간을 담은 다른 Date 객체도 "바뀌지 않음" 이다
    kinds.length = 0
    await updateLoginState(recorded, repo, user.userNo, (current) => ({
      loginFailCount: current.loginFailCount,
      lockUntil: new Date(lockUntil.getTime()),
    }))
    expect(kinds).toEqual(['SelectQueryNode'])
  })

  it('없는 사용자는 next({ 0, null }) 를 돌려주고 아무것도 쓰지 않는다', async () => {
    const state = await updateLoginState(t.db, repo, 999_999n, (current) => ({
      loginFailCount: current.loginFailCount + 1,
      lockUntil: null,
    }))
    expect(state).toEqual({ loginFailCount: 1, lockUntil: null })
    expect(await repo.findCredentialByNo(999_999n)).toBeNull()
  })
})
