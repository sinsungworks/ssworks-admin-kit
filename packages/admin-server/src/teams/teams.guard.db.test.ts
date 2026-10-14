import { createConnection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { lockWaitsIn, settle, sleep, type Settled } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { AdminTeamsService } from './teams.service.js'

// 🔴 팀 쓰기 넷이 guardLocks 행 teamTree 를 잡는지 직접 잰다(2e 스펙 ① G1 · B5). 다른 경합 테스트는 팀 · closure 행 잠금이
//    줄을 세워 가드가 빠져도 초록일 수 있다 — 여기서는 원시 연결이 가드 행 하나만 쥐므로, 쓰기가 잠금 대기에 들어가는 것은
//    가드를 잡으려 했다는 뜻이다.

let t: TestDatabase
let service: AdminTeamsService

beforeAll(async () => {
  t = await createTestDatabase()
  service = new AdminTeamsService(t.db)
})

afterAll(async () => {
  await t?.drop()
})

/** 원시 연결이 가드 행만 쥔 채 write 를 시작한다 — write 가 잠금 대기에 들어갔는지(waited)와 풀린 뒤의 결과 */
async function underHeldGuard(
  write: () => Promise<unknown>,
): Promise<{ waited: boolean; result: Settled<unknown> }> {
  const open = () => createConnection({ ...testDbServer(), database: t.name, timezone: 'Z' })
  const holder = await open()
  const observer = await open()
  try {
    await holder.beginTransaction()
    await holder.query("select lock_name from guard_locks where lock_name = 'teamTree' for update")
    let finished = false
    const pending = settle(write()).then((result) => {
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

describe('🔴 팀 쓰기 넷은 가드 행을 잡는다(① G1 · B5)', () => {
  it('만들기 · 이름 바꾸기 · 이동 · 삭제 — 가드를 쥔 동안 잠금 대기에 들어가고, 풀리면 성공한다', async () => {
    const root = (await service.create({ teamName: 'gw-root', parentTeamNo: null })).teamNo
    const other = (await service.create({ teamName: 'gw-other', parentTeamNo: null })).teamNo
    const writes: [string, () => Promise<unknown>][] = [
      ['create', () => service.create({ teamName: 'gw-new', parentTeamNo: root })],
      ['rename', () => service.rename(other, { teamName: 'gw-renamed' })],
      ['move', () => service.move(other, { parentTeamNo: root, beforeTeamNo: null })],
      ['remove', () => service.remove(other)],
    ]
    for (const [name, write] of writes) {
      const { waited, result } = await underHeldGuard(write)
      expect(waited, name).toBe(true)
      if (!result.ok) throw result.error
    }
  })
})
