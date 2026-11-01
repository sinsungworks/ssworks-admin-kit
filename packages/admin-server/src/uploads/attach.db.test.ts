import { CommonErrorCodes, uploadUrl } from '@ssworks/admin-shared'
import type { Generated, Transaction } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AdminDatabase } from '../database/types.js'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { failure } from '../test-support/errors.js'
import { seedUpload } from '../test-support/uploads.js'
import { attachUploads, syncUploads } from './attach.js'
import type { AdminUploadsService } from './uploads.service.js'

// 첨부 도우미(스펙 U8 · U9) — 트랜잭션 안에서 부른다. 잠금 순서의 마지막.

let t: TestDatabase
let me: SeededUser
let other: SeededUser
const MEDIA = '/media'
const img = (key: string) => `![](${uploadUrl(key, MEDIA)})`

beforeAll(async () => {
  t = await createTestDatabase()
  const role = await seedRole(t.db, { roleName: '첨부', permissions: [] })
  me = await seedUser(t.db, { roleNo: role, userId: 'attach-me' })
  other = await seedUser(t.db, { roleNo: role, userId: 'attach-other' })
})

afterAll(async () => {
  await t?.drop()
})

const inTrx = <T>(fn: (trx: Transaction<AdminDatabase>) => Promise<T>) =>
  t.db.transaction().execute(fn)

async function rowOf(key: string) {
  return t.db
    .selectFrom('uploads')
    .select(['refType', 'refId', 'attachedAt', 'deletedAt'])
    .where('storageKey', '=', key)
    .executeTakeFirstOrThrow()
}

describe('attachUploads', () => {
  it('본인 미첨부 키를 그 문서에 붙인다 — refType · refId · attachedAt, 본문에 없는 키는 그대로', async () => {
    const a = await seedUpload(t.db, { uploadedByUserNo: me.userNo })
    const b = await seedUpload(t.db, { uploadedByUserNo: me.userNo })
    const result = await inTrx((trx) =>
      attachUploads(
        trx,
        {
          markdown: `${img(a.key)}\n\n${img(a.key)}`,
          purpose: 'legal',
          refType: 'legalDocument',
          refId: 7n,
          actorUserNo: me.userNo,
        },
        { mediaPath: MEDIA },
      ),
    )
    expect(result).toEqual({ attached: 1, keys: [a.key] })
    expect(await rowOf(a.key)).toMatchObject({ refType: 'legalDocument', refId: 7n })
    expect((await rowOf(a.key)).attachedAt).toBeInstanceOf(Date)
    expect(await rowOf(b.key)).toMatchObject({ refType: null, refId: null, attachedAt: null })
  })

  it('이미 같은 refType 에 붙은 키는 통과하고 refId 는 그대로(약관 새 판이 앞 판 그림을 다시 씀)', async () => {
    const a = await seedUpload(t.db, {
      uploadedByUserNo: other.userNo,
      refType: 'legalDocument',
      refId: 1n,
    })
    const result = await inTrx((trx) =>
      attachUploads(
        trx,
        {
          markdown: img(a.key),
          purpose: 'legal',
          refType: 'legalDocument',
          refId: 2n,
          actorUserNo: me.userNo,
        },
        { mediaPath: MEDIA },
      ),
    )
    expect(result.attached).toBe(0)
    expect(await rowOf(a.key)).toMatchObject({ refType: 'legalDocument', refId: 1n })
  })

  it('그림 없는 본문 · 우리 경로가 아닌 그림은 아무것도 하지 않는다', async () => {
    expect(
      await inTrx((trx) =>
        attachUploads(
          trx,
          {
            markdown: '글자뿐 ![x](https://example.com/a.png)',
            purpose: 'legal',
            refType: 'legalDocument',
            refId: 1n,
            actorUserNo: me.userNo,
          },
          { mediaPath: MEDIA },
        ),
      ),
    ).toEqual({ attached: 0, keys: [] })
  })

  it('🔴 404 — 남의 미첨부 · 지움 표시 · 다른 용도 · 다른 refType 에 첨부됨 · 없는 키. 트랜잭션은 롤백(아무 행도 안 바뀐다)', async () => {
    const mine = await seedUpload(t.db, { uploadedByUserNo: me.userNo })
    const cases = [
      await seedUpload(t.db, { uploadedByUserNo: other.userNo }),
      await seedUpload(t.db, { uploadedByUserNo: me.userNo, deletedAt: new Date() }),
      await seedUpload(t.db, { uploadedByUserNo: me.userNo, purpose: 'notice' }),
      await seedUpload(t.db, { uploadedByUserNo: me.userNo, refType: 'notice', refId: 3n }),
      { key: 'legal/2026/11/' + 'Z'.repeat(32) + '.webp' },
    ]
    for (const bad of cases) {
      const error = await failure(
        inTrx((trx) =>
          attachUploads(
            trx,
            {
              markdown: `${img(mine.key)}\n\n${img(bad.key)}`,
              purpose: 'legal',
              refType: 'legalDocument',
              refId: 9n,
              actorUserNo: me.userNo,
            },
            { mediaPath: MEDIA },
          ),
        ),
      )
      expect(error.code, bad.key).toBe(CommonErrorCodes.ERR_UPLOAD_NOT_FOUND)
      expect(await rowOf(mine.key)).toMatchObject({ refType: null })
    }
  })

  it('🔴 본문당 장수 초과는 409 ERR_UPLOAD_LIMIT(details.limit) — 잠그기 전에', async () => {
    const keys = await Promise.all(
      [1, 2, 3].map(() => seedUpload(t.db, { uploadedByUserNo: me.userNo })),
    )
    const error = await failure(
      inTrx((trx) =>
        attachUploads(
          trx,
          {
            markdown: keys.map((k) => img(k.key)).join('\n\n'),
            purpose: 'legal',
            refType: 'legalDocument',
            refId: 1n,
            actorUserNo: me.userNo,
          },
          { mediaPath: MEDIA, maxPerBody: 2 },
        ),
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_UPLOAD_LIMIT)
    expect(error.details).toEqual({ limit: 2 })
  })
})

describe('syncUploads(제자리 수정 문서)', () => {
  it('붙이고, 이 문서에 붙어 있었는데 본문에서 빠진 키는 지움 표시 — 남은 키 · 다른 문서 키는 그대로', async () => {
    const kept = await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      purpose: 'notice',
      refType: 'notice',
      refId: 10n,
    })
    const dropped = await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      purpose: 'notice',
      refType: 'notice',
      refId: 10n,
    })
    const elsewhere = await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      purpose: 'notice',
      refType: 'notice',
      refId: 11n,
    })
    const fresh = await seedUpload(t.db, { uploadedByUserNo: me.userNo, purpose: 'notice' })
    const result = await inTrx((trx) =>
      syncUploads(
        trx,
        {
          markdown: `${img(kept.key)}\n\n${img(fresh.key)}`,
          purpose: 'notice',
          refType: 'notice',
          refId: 10n,
          actorUserNo: me.userNo,
        },
        { mediaPath: MEDIA },
      ),
    )
    expect(result).toEqual({ attached: 1, detached: 1, keys: [kept.key, fresh.key] })
    expect((await rowOf(dropped.key)).deletedAt).toBeInstanceOf(Date)
    expect((await rowOf(kept.key)).deletedAt).toBeNull()
    expect((await rowOf(elsewhere.key)).deletedAt).toBeNull()
    expect(await rowOf(fresh.key)).toMatchObject({ refType: 'notice', refId: 10n })
  })

  it('🔴 다른 문서(같은 refType · 다른 refId)에 붙은 키는 404 — 아무 행도 안 바뀐다(엄격 — 리뷰 Important 3)', async () => {
    const own = await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      purpose: 'notice',
      refType: 'notice',
      refId: 20n,
    })
    const foreign = await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      purpose: 'notice',
      refType: 'notice',
      refId: 21n,
    })
    const error = await failure(
      inTrx((trx) =>
        syncUploads(
          trx,
          {
            markdown: img(foreign.key),
            purpose: 'notice',
            refType: 'notice',
            refId: 20n,
            actorUserNo: me.userNo,
          },
          { mediaPath: MEDIA },
        ),
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_UPLOAD_NOT_FOUND)
    expect(await rowOf(foreign.key)).toMatchObject({
      refType: 'notice',
      refId: 21n,
      deletedAt: null,
    })
    expect(await rowOf(own.key)).toMatchObject({ refType: 'notice', refId: 20n, deletedAt: null })
  })

  it('빈 본문은 그 문서에 붙은 키를 모두 지움 표시 — detached 는 그 수, 다른 문서는 그대로', async () => {
    const one = await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      purpose: 'notice',
      refType: 'notice',
      refId: 30n,
    })
    const two = await seedUpload(t.db, {
      uploadedByUserNo: other.userNo,
      purpose: 'notice',
      refType: 'notice',
      refId: 30n,
    })
    const neighbor = await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      purpose: 'notice',
      refType: 'notice',
      refId: 31n,
    })
    const result = await inTrx((trx) =>
      syncUploads(
        trx,
        { markdown: '', purpose: 'notice', refType: 'notice', refId: 30n, actorUserNo: me.userNo },
        { mediaPath: MEDIA },
      ),
    )
    expect(result).toEqual({ attached: 0, detached: 2, keys: [] })
    expect((await rowOf(one.key)).deletedAt).toBeInstanceOf(Date)
    expect((await rowOf(two.key)).deletedAt).toBeInstanceOf(Date)
    expect((await rowOf(neighbor.key)).deletedAt).toBeNull()
  })

  it('🔴 같은 refId 라도 다른 refType 에 붙은 키는 404', async () => {
    const post = await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      purpose: 'notice',
      refType: 'post',
      refId: 40n,
    })
    const error = await failure(
      inTrx((trx) =>
        syncUploads(
          trx,
          {
            markdown: img(post.key),
            purpose: 'notice',
            refType: 'notice',
            refId: 40n,
            actorUserNo: me.userNo,
          },
          { mediaPath: MEDIA },
        ),
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_UPLOAD_NOT_FOUND)
    expect(await rowOf(post.key)).toMatchObject({ refType: 'post', refId: 40n, deletedAt: null })
  })
})

// 🔴 컴파일 회귀 — 쓰는 쪽 Database(코어 + 자기 표)의 Transaction 이 그대로 들어가야 한다(리뷰 Important 1)
type ConsumerDatabase = AdminDatabase & { notices: { noticeNo: Generated<bigint>; body: string } }
export function consumerTransactionCompiles(
  trx: Transaction<ConsumerDatabase>,
  service: AdminUploadsService,
) {
  return Promise.all([
    attachUploads(trx, {
      markdown: '',
      purpose: 'notice',
      refType: 'notice',
      refId: 1n,
      actorUserNo: 1n,
    }),
    service.sync(trx, {
      markdown: '',
      purpose: 'notice',
      refType: 'notice',
      refId: 1n,
      actorUserNo: 1n,
    }),
  ])
}
