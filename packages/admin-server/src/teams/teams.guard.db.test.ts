import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { holdGuard, underHeld } from '../test-support/concurrency.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
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
      const { waited, result } = await underHeld(t, holdGuard('teamTree'), write)
      expect(waited, name).toBe(true)
      if (!result.ok) throw result.error
    }
  })
})
