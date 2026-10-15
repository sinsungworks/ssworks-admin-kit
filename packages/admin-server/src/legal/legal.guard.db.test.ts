import { createConnection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedRole, seedUser } from '../test-support/auth.js'
import { lockWaitsIn, settle, sleep, type Settled } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { AdminLegalService } from './legal.service.js'

// 🔴 발행이 guardLocks 행 legalPublish 를 잡는지 직접 잰다(2e 스펙 ⑩ L1). 동시 발행 테스트(legal.race)는 시행본 행 잠금 ·
//    교착이 진 쪽을 409 로 끝내 가드가 빠져도 409 하나는 남는다(§14 R5-1) — 여기서는 원시 연결이 가드 행 하나만 쥐므로, 발행이
//    잠금 대기에 들어가는 것은 가드를 잡으려 했다는 뜻이다(2e-1 teams.guard 와 같은 모양).

let t: TestDatabase
let service: AdminLegalService
let actor: bigint

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminLegalService(t.db)
  const role = await seedRole(t.db, { roleName: '약관 가드', permissions: [] })
  actor = (await seedUser(t.db, { roleNo: role, userId: 'legal-guard' })).userNo
})

afterAll(async () => {
  await t?.drop()
})

/** 원시 연결이 가드 행만 쥔 채 run 을 시작한다 — run 이 잠금 대기에 들어갔는지(waited)와 풀린 뒤의 결과 */
async function underHeldGuard<T>(
  run: () => Promise<T>,
): Promise<{ waited: boolean; result: Settled<T> }> {
  const open = () => createConnection({ ...testDbServer(), database: t.name, timezone: 'Z' })
  const holder = await open()
  const observer = await open()
  try {
    await holder.beginTransaction()
    await holder.query(
      "select lock_name from guard_locks where lock_name = 'legalPublish' for update",
    )
    let finished = false
    const pending = settle(run()).then((result) => {
      finished = true
      return result
    })
    let waited = false
    for (let i = 0; i < 100 && !finished && !waited; i += 1) {
      waited = (await lockWaitsIn(observer, t.name)) > 0
      if (!waited) await sleep(25)
    }
    await holder.commit()
    return { waited, result: await pending }
  } finally {
    await holder.rollback().catch(() => undefined)
    await holder.end()
    await observer.end()
  }
}

describe('🔴 발행은 가드 행 legalPublish 를 잡는다(⑩ L1)', () => {
  it('첫 발행 · 다음 발행 — 가드를 쥔 동안 잠금 대기에 들어가고, 풀리면 성공한다', async () => {
    const kind = 'guard_kind'
    const first = await underHeldGuard(() =>
      service.publish({ kind, body: '첫 판', baseLegalDocNo: null }, actor),
    )
    expect(first.waited).toBe(true)
    if (!first.result.ok) throw first.result.error
    const firstNo = first.result.value.legalDocNo
    const next = await underHeldGuard(() =>
      service.publish({ kind, body: '둘째 판', baseLegalDocNo: firstNo }, actor),
    )
    expect(next.waited).toBe(true)
    if (!next.result.ok) throw next.result.error
  })

  it('읽기 셋은 가드를 잡지 않는다 — 가드를 쥔 동안에도 기다리지 않고 끝난다', async () => {
    const kind = 'guard_read'
    const { legalDocNo } = await service.publish(
      { kind, body: '읽기 판', baseLegalDocNo: null },
      actor,
    )
    const reads: [string, () => Promise<unknown>][] = [
      ['current', () => service.current(kind)],
      ['history', () => service.history(kind)],
      ['findOne', () => service.findOne(legalDocNo)],
    ]
    for (const [name, read] of reads) {
      const { waited, result } = await underHeldGuard(read)
      expect(waited, name).toBe(false)
      if (!result.ok) throw result.error
    }
  })
})
