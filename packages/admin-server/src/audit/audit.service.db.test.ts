import { Logger } from '@nestjs/common'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { AdminAuditService } from './audit.service.js'
import type { AuditInsert } from './entry.js'

let t: TestDatabase
let empty: TestDatabase

beforeAll(async () => {
  t = await createTestDatabase()
  empty = await createTestDatabase({ migrate: false })
})

afterAll(async () => {
  await t?.drop()
  await empty?.drop()
})

afterEach(() => {
  vi.restoreAllMocks()
})

const ENTRY: AuditInsert = {
  actorUserNo: 3n,
  sessionNo: 9n,
  action: 'session.revoke',
  targetType: 'session',
  targetRefNo: 12n,
  method: 'DELETE',
  path: '/api/admin/sessions/12',
  statusCode: 200,
  errorCode: null,
  ip: '10.0.0.1',
  userAgent: 'UA/1',
  meta: '{"revokedCount":1,"note":"비밀 아님"}',
}

describe('AdminAuditService.insert', () => {
  it('한 행을 넣는다 — meta 는 드라이버가 파싱해 돌려준다(2c 스펙 §14 R1-4)', async () => {
    await new AdminAuditService(t.db).insert(ENTRY)
    const row = await t.db.selectFrom('auditLogs').selectAll().executeTakeFirstOrThrow()
    expect(row).toMatchObject({
      actorUserNo: 3n,
      sessionNo: 9n,
      action: 'session.revoke',
      targetRefNo: 12n,
      statusCode: 200,
      errorCode: null,
      meta: { revokedCount: 1, note: '비밀 아님' },
    })
    expect(row.createAt).toBeInstanceOf(Date)
  })

  it('행위자 · 세션 · IP 가 없어도 넣는다(익명 로그인 실패)', async () => {
    await new AdminAuditService(t.db).insert({
      ...ENTRY,
      actorUserNo: null,
      sessionNo: null,
      ip: null,
      action: 'auth.login.fail',
      meta: null,
    })
    const row = await t.db
      .selectFrom('auditLogs')
      .selectAll()
      .where('action', '=', 'auth.login.fail')
      .executeTakeFirstOrThrow()
    expect(row).toMatchObject({ actorUserNo: null, sessionNo: null, ip: null, meta: null })
  })

  it('🔴 INSERT 가 실패해도 던지지 않고 경고 한 줄 — meta · IP · UA 는 싣지 않는다(B12)', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    await expect(new AdminAuditService(empty.db).insert(ENTRY)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0]?.[0])
    expect(message).toContain(
      '감사 기록 실패 — actor=3 action=session.revoke DELETE /api/admin/sessions/12 status=200:',
    )
    expect(message).not.toContain('비밀 아님')
    expect(message).not.toContain('10.0.0.1')
    expect(message).not.toContain('UA/1')
  })
})
