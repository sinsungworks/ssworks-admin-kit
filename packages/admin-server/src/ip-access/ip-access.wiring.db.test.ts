import type { NestExpressApplication } from '@nestjs/platform-express'
import { CommonErrorCodes, errorRespSchema, stringifyJSON } from '@ssworks/admin-shared'
import request, { type Response } from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import { bootAdminApp } from '../test-support/admin-app.js'
import { seedRole, seedTeam, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { resetIpRules, seedIpRule } from '../test-support/ip-access.js'

// 표시 토큰 IP_ACCESS_ENABLED 가 Nest DI 로 역할 · 사용자 서비스에 닿는지(2f-1 스펙 P3 · P5 · §9-2 s2). 리터럴 ipAware 로 만든
// 서비스 테스트(super-admin.ip.db.test.ts)는 이것을 못 잰다 — 모듈 exports 에서 토큰이 빠지거나 서비스의
// @Optional() @Inject(IP_ACCESS_ENABLED) 가 사라져도 셈이 조용히 "IP 를 모르는" 셈으로 돌아가 그쪽 테스트는 그대로 초록이다.
// 🔴 두 케이스 모두 IP 를 아는 셈이면 409, 모르는 셈이면 200 이 되게 짠다. 🔴 전권자 셈은 DB 전역 상태라 이 파일이 자기 DB 를
// 갖는다(전권자는 R 과 U 둘뿐). 요청 주소는 정규화 뒤 127.0.0.1 이다(supertest 듀얼스택 — §14 R1-④).

const LOCAL = '127.0.0.1'

let t: TestDatabase
let app: NestExpressApplication
let rRole: bigint
let uRole: bigint
let reachable: SeededUser
let pinned: SeededUser

beforeAll(async () => {
  t = await createTestDatabase()
  uRole = await seedRole(t.db, { roleName: 'wire-u', permissions: ['*'] })
  rRole = await seedRole(t.db, { roleName: 'wire-r', permissions: ['*'] })
  // R: 요청자(user 규칙에 묶임 → "어디서나 닿는" 전권자가 아니다) · U: 규칙 없음 → global 층, 유일한 도달 가능 전권자
  pinned = await seedUser(t.db, { roleNo: rRole, userId: 'wire-r' })
  reachable = await seedUser(t.db, { roleNo: uRole, userId: 'wire-u' })
  app = await bootAdminApp({ ...testDbServer(), database: t.name, connectionLimit: 4 })
})

afterAll(async () => {
  await app?.close()
  await t?.drop()
})

beforeEach(async () => {
  await resetIpRules(t.db)
  await seedIpRule(t.db, { scopeType: 'user', scopeRefNo: pinned.userNo, cidr: `${LOCAL}/32` })
})

async function signInPinned() {
  const agent = request.agent(app.getHttpServer())
  await agent
    .post('/admin/auth/login')
    .send({ userId: pinned.userId, password: pinned.password })
    .expect(200)
  return agent
}

function expectLastSuperAdmin(response: Response): void {
  expect(response.status).toBe(409)
  const body = errorRespSchema.parse(response.body)
  expect(body.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
  expect(body.message).toBe(ACCOUNT_MESSAGES.lastSuperAdmin)
}

describe('표시 토큰 → 잔존 셈 (HTTP)', () => {
  it('🔴 사용자 — 도달 가능한 유일한 전권자를 팀 규칙이 있는 팀으로 옮기면 409, 소속 그대로(시나리오 B)', async () => {
    const team = await seedTeam(t.db, 'wire-team')
    await seedIpRule(t.db, { scopeType: 'team', scopeRefNo: team, cidr: '10.0.0.0/8' })
    const agent = await signInPinned()
    const response = await agent
      .patch(`/admin/users/${reachable.userNo}`)
      .set('Content-Type', 'application/json')
      .send(stringifyJSON({ teamNo: team, revision: 0 }))
    expectLastSuperAdmin(response)
    const rows = await t.db
      .selectFrom('teamUserMap')
      .select('teamNo')
      .where('userNo', '=', reachable.userNo)
      .execute()
    expect(rows).toEqual([])
  })

  it('🔴 역할 — 도달 가능한 유일한 전권자의 역할에서 * 를 빼면 409, 권한 그대로', async () => {
    const agent = await signInPinned()
    const response = await agent
      .patch(`/admin/roles/${uRole}`)
      .set('Content-Type', 'application/json')
      .send(stringifyJSON({ permissions: [], revision: 0 }))
    expectLastSuperAdmin(response)
    const role = await t.db
      .selectFrom('roles')
      .select(['permissions', 'revision'])
      .where('roleNo', '=', uRole)
      .executeTakeFirstOrThrow()
    expect(role.revision).toBe(0)
    expect(JSON.stringify(role.permissions)).toContain('*')
  })
})
