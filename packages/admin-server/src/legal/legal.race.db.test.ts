import { BusinessError } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import type { Connection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AdminDatabase } from '../database/types.js'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { settle, snapshotKysely, whileHeld, type Settled } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { legalContentHash } from './content-hash.js'
import { AdminLegalService } from './legal.service.js'

// 🔴 같은 종류 동시 발행(2e 스펙 ⑩ L1 · B15 · §14 R5). 원시 연결이 발행자 users 행을 X 로 쥔 채 두 발행을 시작한다 — INSERT
//    의 FK 검사(발행자 행 S 잠금)가 거기서 기다리므로, 가드가 없으면 두 시행본 읽기가 서로의 INSERT 앞에 놓인다(R5-1 의
//    "읽기 둘이 INSERT 앞" 순서). 가드가 있으면 둘째는 가드에서 기다린다 — 대기 둘을 본 뒤 커밋한다.
// 🔴 가드가 빠져도 진 쪽 409 는 남는다(교착 1213 → ERR_COMMON_CONFLICT) — 코드가 REVISION_CONFLICT 인지까지 잰다. 가드를
//    잡는지는 legal.guard 가 직접 잰다.

let t: TestDatabase
let actor: SeededUser
let renamed: SeededUser

beforeAll(async () => {
  t = await createTestDatabase()
  const role = await seedRole(t.db, { roleName: '약관 경합', permissions: [] })
  actor = await seedUser(t.db, { roleNo: role, userId: 'legal-race' })
  renamed = await seedUser(t.db, { roleNo: role, userId: 'legal-s1' })
})

afterAll(async () => {
  await t?.drop()
})

/** 발행자 users 행을 X 로 쥔다 — 발행 INSERT 의 FK 검사(S)가 여기서 기다린다 */
const holdPublisher = (userNo: bigint) => (connection: Connection) =>
  connection.query('select user_no from users where user_no = ? for update', [userNo])

const codeOf = (result: Settled<unknown>): string =>
  result.ok
    ? 'ok'
    : result.error instanceof BusinessError
      ? result.error.code
      : String(result.error)

async function rowCount(db: Kysely<AdminDatabase>, kind: string): Promise<number> {
  const rows = await db
    .selectFrom('legalDocuments')
    .select('legalDocNo')
    .where('kind', '=', kind)
    .execute()
  return rows.length
}

describe.each([false, true])('🔴 같은 종류 동시 발행 — 스냅샷 격리 %s', (snapshot) => {
  let db: Kysely<AdminDatabase>
  let service: AdminLegalService
  const suffix = snapshot ? 'on' : 'off'

  beforeAll(async () => {
    db = await snapshotKysely(t, snapshot)
    service = new AdminLegalService(db)
  })

  afterAll(async () => {
    await db?.destroy()
  })

  const publishBoth = (kind: string, base: bigint | null) => () =>
    Promise.all([
      settle(service.publish({ kind, body: 'A 판', baseLegalDocNo: base }, actor.userNo)),
      settle(service.publish({ kind, body: 'B 판', baseLegalDocNo: base }, actor.userNo)),
    ])

  it('(r1) 같은 기준 판 둘 — 하나는 발행, 하나는 409 ERR_COMMON_REVISION_CONFLICT', async () => {
    const kind = `race_r1_${suffix}`
    const first = await service.publish({ kind, body: '첫 판', baseLegalDocNo: null }, actor.userNo)
    const outcome = await whileHeld(
      t,
      holdPublisher(actor.userNo),
      publishBoth(kind, first.legalDocNo),
      { expectWait: true, waiters: 2 },
    )
    if (!outcome.ok) throw outcome.error
    expect(outcome.value.map(codeOf).sort()).toEqual(['ERR_COMMON_REVISION_CONFLICT', 'ok'])
    expect(await rowCount(db, kind)).toBe(2)
  })

  it('(r2) 첫 발행 둘(baseLegalDocNo: null) — 같다', async () => {
    const kind = `race_r2_${suffix}`
    const outcome = await whileHeld(t, holdPublisher(actor.userNo), publishBoth(kind, null), {
      expectWait: true,
      waiters: 2,
    })
    if (!outcome.ok) throw outcome.error
    expect(outcome.value.map(codeOf).sort()).toEqual(['ERR_COMMON_REVISION_CONFLICT', 'ok'])
    expect(await rowCount(db, kind)).toBe(1)
  })
})

describe('🔴 스냅샷 격리 ON — 발행 중에 발행자 행이 바뀌어도(B15 · §14 R5-5)', () => {
  it('(s1) 원시 연결이 발행자 users 행을 바꾼 채 → 발행이 FK 검사에서 기다렸다가 성공한다(1020 없음)', async () => {
    const db = await snapshotKysely(t, true)
    try {
      const service = new AdminLegalService(db)
      const kind = 'race_s1'
      const first = await service.publish(
        { kind, body: '첫 판', baseLegalDocNo: null },
        renamed.userNo,
      )
      const outcome = await whileHeld(
        t,
        (connection) =>
          connection.query('update users set user_name = ? where user_no = ?', [
            '바뀐 이름',
            renamed.userNo,
          ]),
        () =>
          service.publish(
            { kind, body: '둘째 판', baseLegalDocNo: first.legalDocNo },
            renamed.userNo,
          ),
        { expectWait: true },
      )
      if (!outcome.ok) throw outcome.error
      expect(outcome.value.contentHash).toBe(legalContentHash('둘째 판'))
      expect(await rowCount(db, kind)).toBe(2)
    } finally {
      await db.destroy()
    }
  })
})
