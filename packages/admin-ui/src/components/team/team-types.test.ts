import { describe, expect, expectTypeOf, it } from 'vitest'
import type { AdminTeamNode, AdminTeamTree } from '@ssworks/admin-shared'
import type { UseTeamTreeOptions } from '../../composables/useTeamTree.js'

// 🔴 admin-ui 는 admin-shared 를 dist(발행 d.ts)로 읽는다 — 소비자가 보는 타입 그대로다. 재귀 스키마를 그대로 두면
//    d.ts 가 `children` 을 `/*elided*/ any` 로 지워 README 의 `api.get<AdminTeamTree>(…).then((r) => r.items)` 가
//    소비자 앱에서 컴파일되지 않았다(브라우저 확인 앱 빌드에서 발견). 이 파일의 검사는 `pnpm typecheck` 가 한다.
describe('admin-shared 팀 트리 타입 — 발행 d.ts', () => {
  it('AdminTeamTree 의 items 는 AdminTeamNode[] 다(children 까지)', () => {
    expectTypeOf<AdminTeamTree['items']>().toEqualTypeOf<AdminTeamNode[]>()
    expectTypeOf<AdminTeamTree['items'][number]['children']>().toEqualTypeOf<AdminTeamNode[]>()
  })

  it('README 의 load 어댑터 모양이 useTeamTree 에 그대로 들어간다', async () => {
    const tree: AdminTeamTree = { items: [] }
    const load: UseTeamTreeOptions['load'] = () => Promise.resolve(tree).then((r) => r.items)
    expect(await load()).toEqual([])
  })
})
