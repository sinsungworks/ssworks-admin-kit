import {
  BusinessError,
  CommonErrorCodes,
  adminLegalCurrentSchema,
  adminLegalDocumentSchema,
  adminLegalHistorySchema,
} from '@ssworks/admin-shared'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { transactionOnly } from '../test-support/accounts.js'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { legalContentHash } from './content-hash.js'
import { LEGAL_MESSAGES } from './errors.js'
import { AdminLegalService } from './legal.service.js'

// 약관 서비스(2e 스펙 §5-7 · §9-3 [2]) — 종류 검증은 파이프 몫이라 서비스는 아무 문자열이나 받는다. 테스트마다 고유한 종류
// 문자열(svc_…)을 써서 앞 테스트의 판에 기대지 않는다.

const REVISION = CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT
const CONFLICT = CommonErrorCodes.ERR_COMMON_CONFLICT
const LF = String.fromCharCode(10)
const CRLF = String.fromCharCode(13, 10)

let t: TestDatabase
let service: AdminLegalService
let actor: SeededUser
let role: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminLegalService(t.db)
  role = await seedRole(t.db, { roleName: '약관 서비스', permissions: [] })
  actor = await seedUser(t.db, { roleNo: role, userId: 'legal-actor', userName: '약관 담당' })
})

afterAll(async () => {
  await t?.drop()
})

const publishAs = (kind: string, body: string, baseLegalDocNo: bigint | null) =>
  service.publish({ kind, body, baseLegalDocNo }, actor.userNo)

/** 🔴 publishedAt 은 Kysely 로 넣을 수 없다(ColumnType<Date, never, never>) — 같은 초 시드는 원시 SQL(snake_case) */
async function seedAt(kind: string, body: string, publishedAt: string): Promise<bigint> {
  const result = await sql`
    insert into legal_documents (kind, body, content_hash, published_at, published_by_user_no)
    values (${kind}, ${body}, ${legalContentHash(body)}, ${publishedAt}, null)
  `.execute(t.db)
  return result.insertId as bigint
}

describe('읽기', () => {
  it('미발행이면 현재본 { item: null } · 이력 { items: [] }(3e D15)', async () => {
    expect(await service.current('svc_none')).toEqual({ item: null })
    expect(await service.history('svc_none')).toEqual({ items: [] })
  })

  it('발행 → 현재본 · 이력 · 단건 — 해시는 서버가 셈하고 publishedAt 은 ISO, 발행자 이름은 조인', async () => {
    const kind = 'svc_flow'
    const first = await publishAs(kind, '첫 판', null)
    expect(first.contentHash).toBe(legalContentHash('첫 판'))
    const current = await service.current(kind)
    expect(adminLegalCurrentSchema.parse(current)).toEqual(current)
    expect(current.item).toEqual({
      legalDocNo: first.legalDocNo,
      kind,
      body: '첫 판',
      contentHash: first.contentHash,
      publishedAt: current.item?.publishedAt,
      publishedByUserNo: actor.userNo,
      publishedByUserName: '약관 담당',
    })
    expect(new Date(current.item?.publishedAt ?? '').toISOString()).toBe(current.item?.publishedAt)

    const second = await publishAs(kind, '둘째 판', first.legalDocNo)
    expect((await service.current(kind)).item?.legalDocNo).toBe(second.legalDocNo)
    const history = await service.history(kind)
    expect(adminLegalHistorySchema.parse(history)).toEqual(history)
    expect(history.items.map((item) => item.legalDocNo)).toEqual([
      second.legalDocNo,
      first.legalDocNo,
    ])
    // 🔴 이력에 본문이 없다 — 목록이 문서 전량을 끌어오지 않게
    for (const item of history.items) expect(Object.keys(item)).not.toContain('body')
    const one = await service.findOne(first.legalDocNo)
    expect(adminLegalDocumentSchema.parse(one)).toEqual(one)
    expect(one).toMatchObject({ legalDocNo: first.legalDocNo, body: '첫 판' })
  })

  it('없는 번호 404 ERR_COMMON_NOT_FOUND', async () => {
    await expect(service.findOne(999_999_999n)).rejects.toMatchObject({
      code: CommonErrorCodes.ERR_COMMON_NOT_FOUND,
      message: LEGAL_MESSAGES.notFound,
    })
  })

  it('🔴 같은 초 두 판은 번호가 큰 쪽이 현재본 — publishedAt 이 먼저다(이력 · 발행 기준도 같은 두 키, gise 🔴)', async () => {
    const kind = 'svc_same_second'
    const a = await seedAt(kind, '같은 초 A', '2026-01-01 00:00:05')
    const b = await seedAt(kind, '같은 초 B', '2026-01-01 00:00:05')
    const late = await seedAt(kind, '큰 번호 · 이른 시각', '2026-01-01 00:00:00')
    const { item } = await service.current(kind)
    expect(item?.legalDocNo).toBe(b)
    expect(item?.publishedAt).toBe('2026-01-01T00:00:05.000Z')
    expect((await service.history(kind)).items.map((row) => row.legalDocNo)).toEqual([b, a, late])
    await expect(publishAs(kind, '새 판', late)).rejects.toMatchObject({ code: REVISION })
    const next = await publishAs(kind, '새 판', b)
    expect((await service.current(kind)).item?.legalDocNo).toBe(next.legalDocNo)
  })

  it('발행자 계정을 지워도 이력이 남는다 — publishedByUserNo · 이름 null(FK SET NULL)', async () => {
    const kind = 'svc_gone'
    const gone = await seedUser(t.db, { roleNo: role, userId: 'legal-gone', userName: '떠난 사람' })
    const { legalDocNo } = await service.publish(
      { kind, body: '떠나기 전 판', baseLegalDocNo: null },
      gone.userNo,
    )
    expect((await service.current(kind)).item?.publishedByUserName).toBe('떠난 사람')
    await t.db.deleteFrom('users').where('userNo', '=', gone.userNo).execute()
    expect((await service.history(kind)).items).toEqual([
      expect.objectContaining({ legalDocNo, publishedByUserNo: null, publishedByUserName: null }),
    ])
    expect(await service.findOne(legalDocNo)).toMatchObject({
      body: '떠나기 전 판',
      publishedByUserNo: null,
      publishedByUserName: null,
    })
  })
})

describe('발행', () => {
  it('🔴 시행본과 같은 본문 409 ERR_COMMON_CONFLICT — 옛 판과 같은 본문(되돌리기)은 된다(Review Focus 5)', async () => {
    const kind = 'svc_same'
    const v1 = await publishAs(kind, '본문 A', null)
    await expect(publishAs(kind, '본문 A', v1.legalDocNo)).rejects.toMatchObject({
      code: CONFLICT,
      message: LEGAL_MESSAGES.sameContent,
    })
    const v2 = await publishAs(kind, '본문 B', v1.legalDocNo)
    const v3 = await publishAs(kind, '본문 A', v2.legalDocNo)
    expect(v3.contentHash).toBe(v1.contentHash)
    expect((await service.history(kind)).items).toHaveLength(3)
  })

  it('🔴 끝 공백 · 줄바꿈만 다른 본문은 다른 판이다 — 트림 · 정규화하지 않는다(Review Focus 2)', async () => {
    const kind = 'svc_ws'
    const lf = ['첫 줄', '둘째 줄'].join(LF)
    const crlf = ['첫 줄', '둘째 줄'].join(CRLF)
    const v1 = await publishAs(kind, lf, null)
    const v2 = await publishAs(kind, crlf, v1.legalDocNo)
    const v3 = await publishAs(kind, `${crlf} `, v2.legalDocNo)
    expect(new Set([v1.contentHash, v2.contentHash, v3.contentHash]).size).toBe(3)
    expect((await service.findOne(v3.legalDocNo)).body).toBe(`${crlf} `)
  })

  it('🔴 낡은 기준 409 ERR_COMMON_REVISION_CONFLICT — 같은 본문이어도 기준 판 검사가 먼저(3e §9)', async () => {
    const kind = 'svc_stale'
    await expect(publishAs(kind, '첫 판', 999n)).rejects.toMatchObject({
      code: REVISION,
      message: LEGAL_MESSAGES.revisionConflict,
    })
    const v1 = await publishAs(kind, '첫 판', null)
    const v2 = await publishAs(kind, '둘째 판', v1.legalDocNo)
    // 시행본(둘째 판)과 같은 본문 + 낡은 기준 — CONFLICT 가 아니라 REVISION_CONFLICT
    await expect(publishAs(kind, '둘째 판', v1.legalDocNo)).rejects.toMatchObject({
      code: REVISION,
    })
    await expect(publishAs(kind, '셋째 판', null)).rejects.toMatchObject({ code: REVISION })
    expect((await service.history(kind)).items.map((item) => item.legalDocNo)).toEqual([
      v2.legalDocNo,
      v1.legalDocNo,
    ])
  })

  it('종류마다 따로 — 기준 판도 종류별이고, 다른 종류에는 같은 본문을 낼 수 있다', async () => {
    const termsLike = await publishAs('svc_kind_a', '공통 본문', null)
    const privacyLike = await publishAs('svc_kind_b', '공통 본문', null)
    expect(privacyLike.contentHash).toBe(termsLike.contentHash)
    await expect(publishAs('svc_kind_b', '다른 본문', termsLike.legalDocNo)).rejects.toMatchObject({
      code: REVISION,
    })
    expect((await service.current('svc_kind_a')).item?.legalDocNo).toBe(termsLike.legalDocNo)
  })

  it('mediumtext — 1,000,000자 한글 본문이 같게 왕복하고 해시가 맞다(Review Focus 1)', async () => {
    const body = '가'.repeat(1_000_000)
    const { legalDocNo, contentHash } = await publishAs('svc_big', body, null)
    const one = await service.findOne(legalDocNo)
    expect(one.body.length).toBe(1_000_000)
    expect(one.body === body).toBe(true)
    expect(contentHash).toBe(legalContentHash(body))
  })

  it('🔴 발행은 트랜잭션 밖에서 쿼리를 시작하지 않는다 — 검사와 쓰기가 한 트랜잭션(gise 는 밖이었다)', async () => {
    const inside = new AdminLegalService(transactionOnly(t.db))
    const result = await inside.publish(
      { kind: 'svc_trx', body: '트랜잭션 판', baseLegalDocNo: null },
      actor.userNo,
    )
    expect(result.contentHash).toBe(legalContentHash('트랜잭션 판'))
  })

  it('실패는 BusinessError 로 — 드라이버 오류가 아니다', async () => {
    const error = await publishAs('svc_err', '본문', 1n).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(BusinessError)
  })
})
