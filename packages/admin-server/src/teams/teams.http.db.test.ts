import type { NestExpressApplication } from '@nestjs/platform-express'
import {
  CommonErrorCodes,
  CoreAuditActions,
  adminTeamCreateResultSchema,
  adminTeamTreeSchema,
  errorRespSchema,
  parseJSON,
  stringifyJSON,
  type AdminTeamNode,
} from '@ssworks/admin-shared'
import request, { type Response } from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAdminApp } from '../test-support/admin-app.js'
import { addToTeam, seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { outline } from '../test-support/teams.js'
import { TEAM_MESSAGES } from './errors.js'

// 실 MariaDB 의 팀 HTTP 계약(2e 스펙 §9-3 [1]) — admin-ui useTeamTree 가 기대는 3d §9 그대로.
// 🔴 bigint 가 든 본문은 stringifyJSON 으로 보낸다(supertest 의 .send(object) 는 bigint 에서 던진다). 팀 이름은 테스트마다
//    접두어로 가르고 대소문자만으로 가르지 않는다(ci 콜레이션).

let t: TestDatabase
let app: NestExpressApplication
let guarded: NestExpressApplication
let boss: SeededUser
let manager: SeededUser
let reader: SeededUser
let member: SeededUser
let memberRole: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  const bossRole = await seedRole(t.db, { roleName: '최고 관리자', permissions: ['*'] })
  const managerRole = await seedRole(t.db, {
    roleName: '팀 관리자',
    permissions: ['org.teams:read', 'org.teams:write'],
  })
  const readerRole = await seedRole(t.db, {
    roleName: '사용자 조회',
    permissions: ['org.users:read'],
  })
  memberRole = await seedRole(t.db, { roleName: '구성원', permissions: [] })
  boss = await seedUser(t.db, { roleNo: bossRole, userId: 'boss' })
  manager = await seedUser(t.db, { roleNo: managerRole, userId: 'team-manager' })
  reader = await seedUser(t.db, { roleNo: readerRole, userId: 'user-reader' })
  member = await seedUser(t.db, { roleNo: memberRole, userId: 'member' })
  const connection = { ...testDbServer(), database: t.name, connectionLimit: 4 }
  app = await bootAdminApp(connection)
  guarded = await bootAdminApp(connection, { reauth: true })
})

afterAll(async () => {
  await app?.close()
  await guarded?.close()
  await t?.drop()
})

type Agent = ReturnType<typeof request.agent>
type Pending = ReturnType<Agent['post']>

const data = (response: Response): unknown => parseJSON<{ data: unknown }>(response.text).data

function sendJson(pending: Pending, body: unknown): Pending {
  return pending.set('Content-Type', 'application/json').send(stringifyJSON(body))
}

/** 성공 봉투 { success: true, data } 를 풀고 data 의 키 집합이 정확히 keys 인지 잰다 */
function envelope(response: Response, keys: string[]): Record<string, unknown> {
  const body = parseJSON<{ success: boolean; data: Record<string, unknown> }>(response.text)
  expect(body.success).toBe(true)
  expect(Object.keys(body.data).sort()).toEqual([...keys].sort())
  return body.data
}

function expectError(response: Response, status: number, code: string, message?: string) {
  expect(response.status).toBe(status)
  const body = errorRespSchema.parse(response.body)
  expect(body.code).toBe(code)
  if (message !== undefined) expect(body.message).toBe(message)
  return body
}

const issuePaths = (details: unknown) =>
  (details as { issues: { path: unknown[] }[] }).issues.map((issue) => issue.path)

async function signIn(user: SeededUser, target: NestExpressApplication = app): Promise<Agent> {
  const agent = request.agent(target.getHttpServer())
  await agent
    .post('/admin/auth/login')
    .send({ userId: user.userId, password: user.password })
    .expect(200)
  return agent
}

async function tree(agent: Agent): Promise<AdminTeamNode[]> {
  const response = await agent.get('/admin/teams/tree').expect(200)
  envelope(response, ['items'])
  return adminTeamTreeSchema.parse(data(response)).items
}

async function createTeam(
  agent: Agent,
  teamName: string,
  parentTeamNo: bigint | null,
): Promise<bigint> {
  const response = await sendJson(agent.post('/admin/teams'), { teamName, parentTeamNo }).expect(
    201,
  )
  envelope(response, ['teamNo'])
  return adminTeamCreateResultSchema.parse(data(response)).teamNo
}

const pathsOf = async (agent: Agent, prefix: string) =>
  outline(await tree(agent)).filter((path) => path.startsWith(prefix))

describe('트리', () => {
  it('빈 저장소는 { items: [] } — 이 파일의 첫 테스트', async () => {
    const response = await (await signIn(boss)).get('/admin/teams/tree').expect(200)
    expect(envelope(response, ['items'])).toEqual({ items: [] })
  })

  it('🔴 users.read 만으로 트리 200 · 쓰기 403(⑥ P1) — 슬롯 없는 계정은 403 권한이 없습니다(details 없음)', async () => {
    const readerAgent = await signIn(reader)
    await tree(readerAgent)
    const denied = expectError(
      await sendJson(readerAgent.post('/admin/teams'), {
        teamName: 'ht-denied',
        parentTeamNo: null,
      }),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      '권한이 없습니다.',
    )
    expect(denied.details).toBeUndefined()
    expectError(
      await (await signIn(member)).get('/admin/teams/tree'),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })
})

describe('쓰기 — 3d §9', () => {
  it('만들기 201 { teamNo } · 루트 여럿 · 하위 팀 — 응답이 admin-shared 스키마로 읽힌다', async () => {
    const agent = await signIn(manager)
    const root = await createTeam(agent, 'ht-root', null)
    await createTeam(agent, 'ht-child', root)
    await createTeam(agent, 'ht-other', null)
    expect(await pathsOf(agent, 'ht-')).toEqual(['ht-root', 'ht-root/ht-child', 'ht-other'])
  })

  it('🔴 본문 검증 400 issues — 빈 이름 · 65자 · 숫자 아닌 parentTeamNo, 앞뒤 공백은 떼고 저장(Review Focus 2)', async () => {
    const agent = await signIn(manager)
    for (const teamName of ['   ', 'x'.repeat(65)]) {
      const body = expectError(
        await sendJson(agent.post('/admin/teams'), { teamName, parentTeamNo: null }),
        400,
        CommonErrorCodes.ERR_COMMON_VALIDATION,
      )
      expect(issuePaths(body.details)).toEqual([['teamName']])
    }
    const numeric = expectError(
      await agent
        .post('/admin/teams')
        .set('Content-Type', 'application/json')
        .send('{"teamName":"ht-numeric","parentTeamNo":5}'),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
    expect(issuePaths(numeric.details)).toEqual([['parentTeamNo']])
    await createTeam(agent, '  ht-trim  ', null)
    expect(await pathsOf(agent, 'ht-trim')).toEqual(['ht-trim'])
  })

  it('없는 상위 팀 404 · 이름 중복 409(대소문자 무시)', async () => {
    const agent = await signIn(manager)
    expectError(
      await sendJson(agent.post('/admin/teams'), { teamName: 'ht-orphan', parentTeamNo: 999_999n }),
      404,
      CommonErrorCodes.ERR_NO_TEAM,
      TEAM_MESSAGES.noParentTeam,
    )
    await createTeam(agent, 'ht-dup', null)
    expectError(
      await sendJson(agent.post('/admin/teams'), { teamName: 'HT-DUP', parentTeamNo: null }),
      409,
      CommonErrorCodes.ERR_DUPLICATE_TEAM_NAME,
      TEAM_MESSAGES.duplicateTeamName,
    )
  })

  it('이름 바꾸기 {} · 없는 팀 404 · 남의 이름 409', async () => {
    const agent = await signIn(manager)
    const team = await createTeam(agent, 'ht-rename', null)
    await createTeam(agent, 'ht-taken', null)
    const renamed = await sendJson(agent.patch(`/admin/teams/${team}`), {
      teamName: 'ht-renamed',
    }).expect(200)
    expect(envelope(renamed, [])).toEqual({})
    expect(await pathsOf(agent, 'ht-renamed')).toEqual(['ht-renamed'])
    expectError(
      await sendJson(agent.patch('/admin/teams/999998'), { teamName: 'ht-none' }),
      404,
      CommonErrorCodes.ERR_NO_TEAM,
      TEAM_MESSAGES.noTeam,
    )
    expectError(
      await sendJson(agent.patch(`/admin/teams/${team}`), { teamName: 'ht-taken' }),
      409,
      CommonErrorCodes.ERR_DUPLICATE_TEAM_NAME,
    )
  })

  it('이동 {} · 순환 400 ERR_TEAM_MOVE_CYCLE · 기준 형제 400 issues beforeTeamNo · 최상위로', async () => {
    const agent = await signIn(manager)
    const top = await createTeam(agent, 'mvh-top', null)
    const first = await createTeam(agent, 'mvh-first', top)
    const second = await createTeam(agent, 'mvh-second', top)
    const moved = await sendJson(agent.patch(`/admin/teams/${second}/move`), {
      parentTeamNo: top,
      beforeTeamNo: first,
    }).expect(200)
    expect(envelope(moved, [])).toEqual({})
    expect(await pathsOf(agent, 'mvh-')).toEqual([
      'mvh-top',
      'mvh-top/mvh-second',
      'mvh-top/mvh-first',
    ])
    expectError(
      await sendJson(agent.patch(`/admin/teams/${top}/move`), {
        parentTeamNo: first,
        beforeTeamNo: null,
      }),
      400,
      CommonErrorCodes.ERR_TEAM_MOVE_CYCLE,
      TEAM_MESSAGES.moveCycle,
    )
    const notSibling = expectError(
      await sendJson(agent.patch(`/admin/teams/${first}/move`), {
        parentTeamNo: top,
        beforeTeamNo: top,
      }),
      400,
      CommonErrorCodes.ERR_COMMON_VALIDATION,
      TEAM_MESSAGES.beforeNotSibling,
    )
    expect(issuePaths(notSibling.details)).toEqual([['beforeTeamNo']])
    await sendJson(agent.patch(`/admin/teams/${first}/move`), {
      parentTeamNo: null,
      beforeTeamNo: null,
    }).expect(200)
    expect(await pathsOf(agent, 'mvh-')).toEqual(['mvh-top', 'mvh-top/mvh-second', 'mvh-first'])
  })

  it('삭제 {} · 소속이 있으면 409 ERR_TEAM_HAS_MEMBERS + details.memberCount · 없는 팀 404', async () => {
    const agent = await signIn(manager)
    const busy = await createTeam(agent, 'dlh-busy', null)
    const busyChild = await createTeam(agent, 'dlh-busy-child', busy)
    const joined = await seedUser(t.db, { roleNo: memberRole, userId: 'dlh-joined' })
    await addToTeam(t.db, busyChild, joined.userNo)
    const conflict = expectError(
      await agent.delete(`/admin/teams/${busy}`),
      409,
      CommonErrorCodes.ERR_TEAM_HAS_MEMBERS,
      TEAM_MESSAGES.teamHasMembers,
    )
    expect(conflict.details).toEqual({ memberCount: 1 })
    const empty = await createTeam(agent, 'dlh-empty', null)
    const removed = await agent.delete(`/admin/teams/${empty}`).expect(200)
    expect(envelope(removed, [])).toEqual({})
    expectError(await agent.delete(`/admin/teams/${empty}`), 404, CommonErrorCodes.ERR_NO_TEAM)
  })

  it('🔴 reauth: true 앱에서도 팀 쓰기는 currentPassword 없이 통과한다(공통 3)', async () => {
    const agent = await signIn(manager, guarded)
    const response = await sendJson(agent.post('/admin/teams'), {
      teamName: 'ht-guarded',
      parentTeamNo: null,
    }).expect(201)
    envelope(response, ['teamNo'])
  })
})

describe('감사', () => {
  async function auditRows(action: string, targetRefNo: bigint) {
    return t.db
      .selectFrom('auditLogs')
      .selectAll()
      .where('action', '=', action)
      .where('targetRefNo', '=', targetRefNo)
      .orderBy('logNo', 'asc')
      .execute()
  }

  it('쓰기 넷이 행으로 — 대상 team · diff · meta 원문(⑦ A1)', async () => {
    const agent = await signIn(boss)
    const parent = await createTeam(agent, 'au-parent', null)
    const team = await createTeam(agent, 'au-team', parent)
    const other = await createTeam(agent, 'au-other', parent)
    const child = await createTeam(agent, 'au-child', team)
    await sendJson(agent.patch(`/admin/teams/${team}`), { teamName: 'au-team2' }).expect(200)
    await sendJson(agent.patch(`/admin/teams/${other}/move`), {
      parentTeamNo: parent,
      beforeTeamNo: team,
    }).expect(200)
    await agent.delete(`/admin/teams/${team}`).expect(200)

    const [created] = await auditRows(CoreAuditActions.TEAM_CREATE, team)
    expect(created).toMatchObject({ targetType: 'team', actorUserNo: boss.userNo, statusCode: 201 })
    expect(created?.meta).toEqual({
      before: {},
      after: { teamName: 'au-team', parentTeamNo: String(parent) },
    })
    const [renamed] = await auditRows(CoreAuditActions.TEAM_UPDATE, team)
    expect(renamed?.meta).toEqual({
      before: { teamName: 'au-team' },
      after: { teamName: 'au-team2' },
    })
    const [moved] = await auditRows(CoreAuditActions.TEAM_MOVE, other)
    expect(moved?.meta).toEqual({
      before: { parentTeamNo: String(parent), displayOrder: 1 },
      after: { parentTeamNo: String(parent), displayOrder: 0 },
    })
    const [deleted] = await auditRows(CoreAuditActions.TEAM_DELETE, team)
    expect(deleted?.meta).toEqual({
      before: { teamName: 'au-team2', parentTeamNo: String(parent) },
      after: {},
      descendants: [{ teamNo: String(child), teamName: 'au-child' }],
    })
  })

  it('하위 팀이 없는 삭제는 descendants 키가 없다 · 제자리 이동은 before = after', async () => {
    const agent = await signIn(boss)
    const alone = await createTeam(agent, 'au-alone', null)
    await sendJson(agent.patch(`/admin/teams/${alone}/move`), {
      parentTeamNo: null,
      beforeTeamNo: null,
    }).expect(200)
    const [moved] = await auditRows(CoreAuditActions.TEAM_MOVE, alone)
    const meta = moved?.meta as { before: unknown; after: unknown }
    expect(meta.after).toEqual(meta.before)
    await agent.delete(`/admin/teams/${alone}`).expect(200)
    const [deleted] = await auditRows(CoreAuditActions.TEAM_DELETE, alone)
    expect(Object.keys(deleted?.meta as Record<string, unknown>).sort()).toEqual([
      'after',
      'before',
    ])
  })
})
