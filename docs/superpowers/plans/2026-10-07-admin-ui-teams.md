# admin-ui 조직(팀 트리 · 팀 인원) (PR #3d) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin-shared 에 팀 스키마 · 트리 순수 함수를, admin-ui 에 he-tree 위의 `TeamTree` · 흐름 composable `useTeamTree` · `TeamMoveDialog` · 2열 인원 목록 `TeamUserList` 를 넣는다.

**Architecture:** 계약(스키마 · 정렬 · 평탄화 · 검색 · 이동 계산)은 admin-shared 의 순수 코드다. `TeamTree` 는 정렬한 **내부 사본**을 he-tree `Draggable` 에 넘겨 그리고 이벤트만 낸다(서버를 모른다). `useTeamTree` 가 조회 · 응답 경합 · 쓰기 넷(`useWriteFlow` 관문) · 재조회 · 선택 정리 · 입력칸 상태를 맡아 `v-bind` 용 바인딩을 낸다. `TeamUserList` 는 `load` 어댑터로 쪽 나눔 조회를 하고 목록 끝 버튼(IntersectionObserver)으로 다음 쪽을 붙인다.

**Tech Stack:** Vue 3.5 · Vuetify 4 · `@he-tree/vue` 2.10.5 · zod 4.6 · vitest 4 + happy-dom · @vue/test-utils · pnpm 12

**Spec:** `docs/superpowers/specs/2026-10-07-admin-ui-teams-design.md`

## Global Constraints

- 새 의존은 `@he-tree/vue` `^2.10.5` 하나(admin-ui 필수 peer + devDependency). admin-ui 소스가 import 하는 외부 패키지는 `vue` · `vue-router` · `vuetify` · `pinia` · `@ssworks/admin-shared` · `axios` · `@he-tree/vue` 뿐(`peer-deps.test.ts` 가 잰다). admin-shared 는 `zod` 만.
- 🔴 he-tree 의 노드 상태 타입(`Stat`, `@he-tree/tree-utils`)을 공개 타입에 내보내지 않는다. `@he-tree/tree-utils` 를 의존으로 들이지 않는다(스펙 D14). 컴포넌트 안에서는 필요한 필드만 적은 지역 인터페이스를 쓴다.
- 🔴 he-tree CSS 를 import 하지 않는다. 필요한 규칙은 `TeamTree.vue` `<style scoped>` 의 `:deep()` 로 옮긴다(스펙 D15).
- `import type` 을 분리한다(eslint `consistent-type-imports`). 내부 상대 import 는 `.js` 확장자. `.vue` 는 그대로.
- SFC 는 Vuetify 컴포넌트를 `vuetify/components` 에서 명시 import 한다. 스타일은 `<style scoped>` 순수 CSS, 색은 Vuetify 토큰(`rgb(var(--v-theme-primary))` · `rgba(var(--v-border-color), var(--v-border-opacity))`).
- `console.log` 금지 — `console.warn` · `console.error` 만.
- 정본에서 가져온 파일은 머리 주석에 `정본: <프로젝트> <경로>` 와 `바꾼 점:` 을 적는다. `🔴` 주석은 "지우면 사고가 나는 이유" 다.
- 반환 형태는 ref 묶음 · `ComputedRef` 바인딩이다. `reactive()` 로 감싸 돌려주지 않는다.
- `v-model` 은 기본 `modelValue` 하나.
- `:loading` 은 클릭을 안 막는다 — 제출 · 동작 버튼은 늘 `:disabled` 와 한 벌.
- Boolean prop 에 `undefined` 기본값을 주지 않는다. 함수 prop 은 메서드 꼴(`canAct?(node, action): boolean`)로 적는다.
- 테스트: DOM 이 필요한 파일 머리에 `// @vitest-environment happy-dom`. VDialog · VMenu 를 여는 테스트는 모듈 최상단에서 `installVisualViewport()`. `data-testid` 를 심지 않는다 — 글자 · `name` · `aria-label` · `aria-level` 로 찾는다.
- admin-shared 를 고친 뒤에는 `pnpm --filter @ssworks/admin-shared build` 를 돌려야 admin-ui 에 보인다.
- 🔴 파일을 python · sed 같은 스크립트로 다시 쓰지 않는다(개행이 뒤집힌다). Edit/Write 도구만.
- 포맷: prettier(세미콜론 없음 · 작은따옴표 · 100자). 커밋 전 `pnpm exec prettier --write <파일들>`.
- Windows 에서도 돈다 — `/dev/null` 금지.
- 커밋 메시지: 한국어 conventional commits, 끝 줄 `Co-Authored-By: Claude <noreply@anthropic.com>`.
- 테스트 실행은 저장소 루트에서 `pnpm exec vitest run <경로>`.
- 문구는 스펙 §4 의 한국어 문구를 글자 그대로 쓴다.
- zod API 는 플랜에 적힌 그대로 쓴다(3c 에서 `z.iso.datetime()` 을 `z.string().datetime()` 으로 바꿔 쓴 일이 있었다).

## Review Focus

- **한글 입력 중 Enter** — 조합을 확정하는 Enter(`isComposing`)를 저장으로 받으면 마지막 글자가 빠진 이름이 나간다. 저장하지 않아야 한다 → Task 4 테스트 "🔴 한글 조합 중 Enter 는 저장이 아니다".
- **입력칸이 열린 채 재조회로 트리가 다시 그려짐** — 다시 그리는 순간의 포커스 빠짐을 "바깥 누르기 저장"으로 받으면 안 되고, 친 글자 · 오류가 남아야 한다 → Task 4 테스트 "실패 문구를 보이고, nodes 가 바뀌어도 …".
- **검색으로 걸러진 화면에서 ↑↓** — 숨은 형제와 자리가 바뀌면 안 된다 → Task 4 테스트 "검색 중에는 ↑↓ 가 잠긴다".
- **2열에서 팀을 빨리 바꿀 때** — 앞 팀의 다음 쪽 응답이 새 팀 목록 끝에 붙으면 안 된다 → Task 7 테스트 "🔴 다음 쪽을 기다리는 사이 팀이 바뀌면 …".
- **드래그를 확인창에서 취소** — 트리가 놓기 전 모양으로 돌아가고, 접어 둔 팀은 접힌 채여야 한다 → Task 6 테스트 "확인을 취소하면 …" + Task 4 테스트 "resetKey 가 바뀌면 …".
- **자기 하위 팀 밑으로 옮기기** — 순환을 만드는 선택지가 보이면 안 되고, 기존 서버용 변환도 그런 요청을 거부해야 한다 → Task 3 테스트 `moveTargets` · `toDisplayOrderMove` 오류.

## 파일 지도

| 파일                                                                                                                   | 책임                                                     | Task |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---- |
| `packages/admin-ui/package.json` · `vite.config.ts`                                                                    | he-tree 필수 peer · dev · external                       | 1    |
| `packages/admin-ui/src/components/team/he-tree.render.test.ts`                                                         | he-tree 계약(TeamTree 가 기대는 라이브러리 동작) 고정    | 1    |
| `packages/admin-shared/src/teams.ts` · `teams.test.ts`                                                                 | 팀 스키마 · 타입(스펙 §4-1)                              | 2    |
| `packages/admin-shared/src/team-tree.ts` · `team-tree.test.ts`                                                         | 정렬 · 평탄화 · 검색 · 자리 · 이동 계산 · 들여쓰기(§4-2) | 3    |
| `packages/admin-ui/src/components/team/team-tree.ts`                                                                   | `TeamAction` · `TeamEdit` 등 타입 · 기본 문구            | 4    |
| `packages/admin-ui/src/components/team/TeamNameInput.vue`                                                              | 노드 안 입력칸(내부용) — 바깥 누르기 저장의 함정 막기    | 4    |
| `packages/admin-ui/src/components/team/TeamTree.vue` · `team-tree.render.test.ts`                                      | 트리 표시 · 이벤트(§4-3)                                 | 4    |
| `packages/admin-ui/src/components/team/TeamMoveDialog.vue` · `team-move-dialog.render.test.ts`                         | 옮기기 대화상자(§4-5)                                    | 5    |
| `packages/admin-ui/src/composables/useTeamTree.ts` · `useTeamTree.render.test.ts`                                      | 조회 · 쓰기 흐름(§4-4)                                   | 6    |
| `packages/admin-ui/src/test/setup.ts`                                                                                  | `installIntersectionObserver()`                          | 7    |
| `packages/admin-ui/src/components/team/team-user-list.ts` · `TeamUserList.vue` · `team-user-list.render.test.ts`       | 2열 인원 목록(§4-6)                                      | 7    |
| `packages/admin-ui/src/index.ts` · `packages/admin-shared/src/index.ts`                                                | 내보내기(각 Task 가 끝에 덧붙인다)                       | 2–7  |
| `packages/admin-ui/README.md` · `.changeset/admin-ui-teams.md` · `CLAUDE.md` · `docs/HANDOFF.md` · `docs/01-phase0.md` | 문서 · 릴리스                                            | 8    |

---

### Task 1: he-tree 필수 peer · 계약 테스트

스펙 §8 의 "플랜 Task 1 에서 먼저 확인할 위험" 셋 가운데 ① he-tree 타입이 킷 tsconfig 에서 풀리는가 ③ he-tree 가 happy-dom 에서 Vuetify 와 함께 렌더되는가를 이 Task 가 확인한다. ② 제네릭 SFC 선언 빌드는 이미 `SessionTable.vue`(`generic="TRow extends SessionTableRow"`)가 통과하고 있어 확인됐다.

계약 테스트는 **라이브러리 동작**을 고정한다. he-tree 를 올렸을 때 여기가 빨개지면 `TeamTree` 의 해당 🔴 규칙(스펙 D3 · D7 · D8)을 다시 봐야 한다는 신호다.

**Files:**

- Modify: `packages/admin-ui/package.json` (peerDependencies · devDependencies)
- Modify: `packages/admin-ui/vite.config.ts` (rollupOptions.external)
- Modify: `pnpm-lock.yaml` (설치 결과)
- Create: `packages/admin-ui/src/components/team/he-tree.render.test.ts`

**Interfaces:**

- Produces: admin-ui 가 `import { Draggable } from '@he-tree/vue'` 를 쓸 수 있다. 확인된 사실 — `statHandler(stat)` 가 `stat.open` 을 정하고 새 배열이 오면 다시 불린다, 노드에 `role="treeitem"` · `aria-level` 이 붙는다, 인스턴스 `move(stat, parentStat, index)` 는 데이터를 바꾸지만 `change` 를 내지 않는다(테스트는 `findComponent(Draggable).vm.$emit('change')` 로 흉내 낸다), 인스턴스 `statsFlat` 에 노드 상태가 있다, Alt+↑ 는 막지 않으면 형제 순서를 바꾸고 `change` 를 낸다, 감싸개의 캡처 단계 `keydown` 이 그것을 막는다.

- [ ] **Step 1: 의존 설치**

```bash
pnpm --filter @ssworks/admin-ui add -D @he-tree/vue@^2.10.5
```

Expected: `packages/admin-ui/package.json` 의 `devDependencies` 에 `"@he-tree/vue": "^2.10.5"` 가 생기고 `pnpm-lock.yaml` 이 바뀐다.

- [ ] **Step 2: peer 선언**

`packages/admin-ui/package.json` 의 `peerDependencies` 맨 앞에 넣는다(키 알파벳 순):

```json
  "peerDependencies": {
    "@he-tree/vue": "^2.10.5",
    "@ssworks/admin-shared": "workspace:^0",
```

- [ ] **Step 3: 번들에서 빼기**

`packages/admin-ui/vite.config.ts` 의 `external` 배열 끝(`/^vue-router(\/.*)?$/,` 다음)에 넣는다:

```ts
        /^vue-router(\/.*)?$/,
        /^@he-tree\/vue(\/.*)?$/,
      ],
```

- [ ] **Step 4: 계약 테스트 작성**

`packages/admin-ui/src/components/team/he-tree.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, type Component } from 'vue'
import { VBtn } from 'vuetify/components'
import { Draggable } from '@he-tree/vue'
import { vuetify } from '../../test/setup.js'

// he-tree 계약 — TeamTree 가 기대는 라이브러리 동작을 고정한다(3d 스펙 D3 · D7 · D8).
// he-tree 를 올렸을 때 여기가 빨개지면 TeamTree 의 해당 🔴 규칙을 다시 본다.

interface Item {
  no: number
  name: string
  children: Item[]
}

/** TeamTree 가 쓰는 노드 상태 필드만 — `@he-tree/tree-utils` 의 `Stat` 을 들이지 않는다 */
interface Stat {
  data: Item
  open: boolean
  parent: Stat | null
  children: Stat[]
}

interface TreeInstance {
  getStat(data: Item): Stat
  move(stat: Stat, parent: Stat | null, index: number): boolean
  statsFlat: Stat[]
}

const TREE = (): Item[] => [
  {
    no: 1,
    name: 'root',
    children: [
      { no: 2, name: 'a', children: [{ no: 4, name: 'a1', children: [] }] },
      { no: 3, name: 'b', children: [] },
    ],
  },
]

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

function setup(options: { closed?: number[]; blockAlt?: boolean } = {}) {
  const data = ref(TREE())
  const closed = new Set(options.closed ?? [])
  const onChange = vi.fn()
  let tree: TreeInstance | null = null
  wrapper = mount(
    defineComponent({
      setup() {
        return () =>
          h(
            'div',
            {
              onKeydownCapture: options.blockAlt
                ? (event: KeyboardEvent) => {
                    if (event.altKey && event.key.startsWith('Arrow')) {
                      event.preventDefault()
                      event.stopPropagation()
                    }
                  }
                : undefined,
            },
            [
              h(
                Draggable as Component,
                {
                  ref: (instance: unknown) => {
                    tree = instance as TreeInstance | null
                  },
                  modelValue: data.value,
                  ariaLabel: '팀 트리',
                  statHandler: (stat: Stat) => {
                    stat.open = !closed.has(stat.data.no)
                    return stat
                  },
                  onChange,
                },
                {
                  default: ({ node }: { node: Item }) =>
                    h('span', { class: 'name' }, [
                      node.name,
                      h(VBtn, { 'aria-label': `${node.name} 버튼`, size: 'x-small' }),
                    ]),
                },
              ),
            ],
          )
      },
    }),
    { attachTo: document.body, global: { plugins: [vuetify] } },
  )
  return {
    data,
    onChange,
    tree: () => tree!,
    names: () => wrapper!.findAll('.name').map((n) => n.text()),
  }
}

describe('he-tree 계약', () => {
  it('노드에 role="treeitem" · aria-level 을 달고, 슬롯 안 Vuetify 컴포넌트가 그려진다', async () => {
    setup()
    await nextTick()
    expect(wrapper!.findAll('[role="treeitem"]').map((n) => n.attributes('aria-level'))).toEqual([
      '1',
      '2',
      '3',
      '2',
    ])
    expect(wrapper!.find('[role="tree"]').attributes('aria-label')).toBe('팀 트리')
    expect(wrapper!.findAll('button[aria-label$="버튼"]')).toHaveLength(4)
  })

  it('statHandler 가 펼침을 정하고, 새 배열이 오면 다시 불린다(D3)', async () => {
    const { data, names } = setup({ closed: [2] })
    await nextTick()
    expect(names()).toEqual(['root', 'a', 'b'])
    data.value = TREE()
    await nextTick()
    await nextTick()
    expect(names()).toEqual(['root', 'a', 'b'])
  })

  it('인스턴스 move() 는 데이터를 바꾸지만 change 를 내지 않는다(TeamTree 테스트가 change 를 직접 내보내는 이유)', async () => {
    const { data, onChange, tree } = setup()
    await nextTick()
    const statB = tree().getStat(data.value[0]!.children[1]!)
    const statRoot = tree().getStat(data.value[0]!)
    tree().move(statB, statRoot, 0)
    await nextTick()
    expect(data.value[0]!.children.map((c) => c.name)).toEqual(['b', 'a'])
    expect(onChange).not.toHaveBeenCalled()
    expect(tree().statsFlat.map((s) => s.data.name)).toContain('b')
  })

  it('🔴 Alt+↑ 는 막지 않으면 형제 순서를 바꾸고 change 를 낸다(D7 의 이유)', async () => {
    const { data, onChange } = setup()
    await nextTick()
    await wrapper!.findAll('[role="treeitem"]').at(-1)!.trigger('keydown', {
      key: 'ArrowUp',
      altKey: true,
    })
    await nextTick()
    expect(data.value[0]!.children.map((c) => c.name)).toEqual(['b', 'a'])
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('감싸개의 캡처 단계 keydown 이 Alt+화살표 이동을 막는다(D7)', async () => {
    const { data, onChange } = setup({ blockAlt: true })
    await nextTick()
    await wrapper!.findAll('[role="treeitem"]').at(-1)!.trigger('keydown', {
      key: 'ArrowUp',
      altKey: true,
    })
    await nextTick()
    expect(data.value[0]!.children.map((c) => c.name)).toEqual(['a', 'b'])
    expect(onChange).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 5: 계약 테스트 실행**

Run: `pnpm exec vitest run packages/admin-ui/src/components/team/he-tree.render.test.ts`
Expected: 5 passed. **하나라도 실패하면 구현하지 말고 멈춰 보고한다(BLOCKED)** — 스펙이 기대는 라이브러리 동작이 다르다는 뜻이다. 실패한 단언과 실제 값을 보고에 적는다.

- [ ] **Step 6: 타입 · 전체 테스트**

Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: 오류 없음(테스트 파일의 `@he-tree/vue` import 가 풀린다). he-tree 선언(`vue-demi` · `@he-tree/tree-utils` 를 참조)이 풀리지 않아 실패하면 멈춰 보고한다(BLOCKED).

Run: `pnpm --filter @ssworks/admin-ui test`
Expected: 전부 통과(`peer-deps.test.ts` 는 테스트 파일을 세지 않는다).

- [ ] **Step 7: 커밋**

```bash
pnpm exec prettier --write packages/admin-ui/package.json packages/admin-ui/vite.config.ts packages/admin-ui/src/components/team/he-tree.render.test.ts
git add packages/admin-ui/package.json packages/admin-ui/vite.config.ts pnpm-lock.yaml packages/admin-ui/src/components/team/he-tree.render.test.ts
git commit -m "build(admin-ui): @he-tree/vue 필수 peer · he-tree 계약 테스트

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: admin-shared 팀 스키마

**Files:**

- Create: `packages/admin-shared/src/teams.ts`, `packages/admin-shared/src/teams.test.ts`
- Modify: `packages/admin-shared/src/index.ts` (끝에 export 블록)

**Interfaces:**

- Produces: `TEAM_NAME_MAX_LENGTH = 64`, `teamNameSchema`, `interface AdminTeamNode { teamNo: bigint; teamName: string; displayOrder: number; children: AdminTeamNode[] }`, `adminTeamNodeSchema`, `adminTeamTreeSchema`(`{ items: AdminTeamNode[] }`), `adminTeamCreateSchema`(`{ teamName: string; parentTeamNo: bigint | null }`), `adminTeamCreateResultSchema`(`{ teamNo: bigint }`), `adminTeamRenameSchema`(`{ teamName: string }`), `adminTeamMoveSchema`(`{ teamNo: bigint; parentTeamNo: bigint | null; beforeTeamNo: bigint | null }`), `adminTeamMoveBodySchema`(teamNo 없음), 타입 `AdminTeamTree` · `AdminTeamCreate` · `AdminTeamCreateResult` · `AdminTeamRename` · `AdminTeamMove` · `AdminTeamMoveBody`.

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-shared/src/teams.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import {
  TEAM_NAME_MAX_LENGTH,
  adminTeamCreateResultSchema,
  adminTeamCreateSchema,
  adminTeamMoveBodySchema,
  adminTeamMoveSchema,
  adminTeamNodeSchema,
  adminTeamRenameSchema,
  adminTeamTreeSchema,
  teamNameSchema,
  type AdminTeamNode,
} from './teams.js'

const NODE: AdminTeamNode = {
  teamNo: 1n,
  teamName: '한강투자그룹',
  displayOrder: 0,
  children: [{ teamNo: 2n, teamName: '영업본부', displayOrder: 0, children: [] }],
}

describe('teamNameSchema', () => {
  it('앞뒤 공백을 지운다', () => {
    expect(teamNameSchema.parse('  영업1팀 ')).toBe('영업1팀')
  })

  it('공백뿐이면 거부하고 문구를 낸다', () => {
    const result = teamNameSchema.safeParse('   ')
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('팀 이름을 입력하세요.')
  })

  it('64자까지 받고 65자는 거부한다', () => {
    expect(TEAM_NAME_MAX_LENGTH).toBe(64)
    expect(teamNameSchema.safeParse('가'.repeat(64)).success).toBe(true)
    const result = teamNameSchema.safeParse('가'.repeat(65))
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('팀 이름은 64자 이하로 정하세요.')
  })
})

describe('adminTeamNodeSchema', () => {
  it('재귀 노드를 받는다', () => {
    expect(adminTeamNodeSchema.parse(NODE)).toEqual(NODE)
  })

  it('teamNo 는 bigint 다', () => {
    expect(adminTeamNodeSchema.safeParse({ ...NODE, teamNo: 1 }).success).toBe(false)
  })

  it('자식의 모양도 검사한다', () => {
    expect(adminTeamNodeSchema.safeParse({ ...NODE, children: [{ teamNo: 2n }] }).success).toBe(
      false,
    )
  })

  it('추론 타입과 AdminTeamNode 가 서로 대입된다(타입 검사가 잰다)', () => {
    const inferred: z.infer<typeof adminTeamNodeSchema> = NODE
    const back: AdminTeamNode = adminTeamNodeSchema.parse(inferred)
    expect(back).toEqual(NODE)
  })
})

describe('adminTeamTreeSchema', () => {
  it('루트가 여럿일 수 있고 비어도 된다', () => {
    expect(adminTeamTreeSchema.parse({ items: [NODE, NODE] }).items).toHaveLength(2)
    expect(adminTeamTreeSchema.parse({ items: [] }).items).toEqual([])
  })

  it('단일 루트 모양({ item })은 받지 않는다 — 어댑터가 [item] 으로 감싼다', () => {
    expect(adminTeamTreeSchema.safeParse({ item: NODE }).success).toBe(false)
  })
})

describe('만들기 · 이름 바꾸기', () => {
  it('만들기 — parentTeamNo 는 null(최상위)을 받고, 생략은 받지 않는다', () => {
    expect(adminTeamCreateSchema.parse({ teamName: ' 영업4팀 ', parentTeamNo: null })).toEqual({
      teamName: '영업4팀',
      parentTeamNo: null,
    })
    expect(adminTeamCreateSchema.safeParse({ teamName: '영업4팀' }).success).toBe(false)
  })

  it('만들기 응답은 새 번호', () => {
    expect(adminTeamCreateResultSchema.parse({ teamNo: 9n })).toEqual({ teamNo: 9n })
  })

  it('이름 바꾸기 본문은 이름 하나', () => {
    expect(adminTeamRenameSchema.parse({ teamName: '영업1팀' })).toEqual({ teamName: '영업1팀' })
    expect(adminTeamRenameSchema.safeParse({ teamName: '' }).success).toBe(false)
  })
})

describe('이동(기준 형제 번호)', () => {
  it('parentTeamNo · beforeTeamNo 는 null 을 받는다', () => {
    const move = { teamNo: 5n, parentTeamNo: null, beforeTeamNo: null }
    expect(adminTeamMoveSchema.parse(move)).toEqual(move)
  })

  it('본문 스키마에는 teamNo 가 없다 — 경로로 간다', () => {
    const body = adminTeamMoveBodySchema.parse({ teamNo: 5n, parentTeamNo: 3n, beforeTeamNo: 7n })
    expect(body).toEqual({ parentTeamNo: 3n, beforeTeamNo: 7n })
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-shared/src/teams.test.ts`
Expected: FAIL — `Cannot find module './teams.js'`.

- [ ] **Step 3: 구현**

`packages/admin-shared/src/teams.ts`:

```ts
import { z } from 'zod'

// 팀 코어 계약 — Phase 2 서버와 admin-ui `TeamTree` · `useTeamTree` 가 같은 모양을 본다.
//
// 정본: hangang-home apps/api/src/modules/teams(teams.dto.ts · 라우트)
//       + apps/admin/src/pages/org/teams-messages.ts(이름 64자 · 공백만인 이름 거부)
// 바꾼 점:
//  - 트리 응답은 루트가 여럿인 `{ items }` 다. hangang 의 `{ item: node | null }`(단일 루트)은 어댑터가 `[item]` 으로 감싼다.
//  - 🔴 이동 본문은 기준 형제 번호(`{ parentTeamNo, beforeTeamNo }`)다(3d 결정 ⑤ O3). 순서 값(`displayOrder`)은 서버가
//    계산한다 — 빈 번호가 있는 순서에서 화면이 값을 지어내지 않는다. 기존 서버는 `toDisplayOrderMove()` 로 바꾼다.
//  - 🔴 `.refine()` 을 걸지 않는다(3b §11 R1) — `.omit()` 이 깨진다.

export const TEAM_NAME_MAX_LENGTH = 64

/** 앞뒤 공백을 지운 1~64자 */
export const teamNameSchema = z
  .string()
  .trim()
  .min(1, '팀 이름을 입력하세요.')
  .max(TEAM_NAME_MAX_LENGTH, `팀 이름은 ${TEAM_NAME_MAX_LENGTH}자 이하로 정하세요.`)

export interface AdminTeamNode {
  teamNo: bigint
  teamName: string
  /** 형제 안에서만 뜻이 있다. 빈 번호가 있을 수 있다 */
  displayOrder: number
  children: AdminTeamNode[]
}

/** 재귀 — zod 4 의 getter 꼴 */
export const adminTeamNodeSchema = z.object({
  teamNo: z.bigint(),
  teamName: z.string(),
  displayOrder: z.number().int(),
  get children() {
    return z.array(adminTeamNodeSchema)
  },
})

/** `GET admin/teams/tree` — 루트가 여럿일 수 있고, 팀이 없으면 [] */
export const adminTeamTreeSchema = z.object({ items: z.array(adminTeamNodeSchema) })

export const adminTeamCreateSchema = z.object({
  teamName: teamNameSchema,
  /** null = 최상위 */
  parentTeamNo: z.bigint().nullable(),
})

export const adminTeamCreateResultSchema = z.object({ teamNo: z.bigint() })

export const adminTeamRenameSchema = z.object({ teamName: teamNameSchema })

/** 이동 요청(3d ⑤ O3). beforeTeamNo: null = 그 상위 팀 아래 맨 끝 */
export const adminTeamMoveSchema = z.object({
  teamNo: z.bigint(),
  parentTeamNo: z.bigint().nullable(),
  beforeTeamNo: z.bigint().nullable(),
})

/** `PATCH admin/teams/:teamNo/move` 본문 — teamNo 는 경로 */
export const adminTeamMoveBodySchema = adminTeamMoveSchema.omit({ teamNo: true })

export type AdminTeamTree = z.infer<typeof adminTeamTreeSchema>
export type AdminTeamCreate = z.infer<typeof adminTeamCreateSchema>
export type AdminTeamCreateResult = z.infer<typeof adminTeamCreateResultSchema>
export type AdminTeamRename = z.infer<typeof adminTeamRenameSchema>
export type AdminTeamMove = z.infer<typeof adminTeamMoveSchema>
export type AdminTeamMoveBody = z.infer<typeof adminTeamMoveBodySchema>
```

`packages/admin-shared/src/index.ts` 끝(`./passwords.js` 블록 다음)에 덧붙인다:

```ts
export {
  TEAM_NAME_MAX_LENGTH,
  teamNameSchema,
  adminTeamNodeSchema,
  adminTeamTreeSchema,
  adminTeamCreateSchema,
  adminTeamCreateResultSchema,
  adminTeamRenameSchema,
  adminTeamMoveSchema,
  adminTeamMoveBodySchema,
  type AdminTeamNode,
  type AdminTeamTree,
  type AdminTeamCreate,
  type AdminTeamCreateResult,
  type AdminTeamRename,
  type AdminTeamMove,
  type AdminTeamMoveBody,
} from './teams.js'
```

- [ ] **Step 4: 통과 확인 · 빌드**

Run: `pnpm exec vitest run packages/admin-shared/src/teams.test.ts`
Expected: 14 passed.

Run: `pnpm --filter @ssworks/admin-shared typecheck && pnpm --filter @ssworks/admin-shared build`
Expected: 오류 없음. 재귀 getter 에서 "implicitly has type 'any'" 가 나오면 getter 에 반환 타입을 단다: `get children(): z.ZodArray<typeof adminTeamNodeSchema> {` — 그 밖의 꼴(`z.lazy` 등)로 바꾸지 않는다.

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-shared/src/teams.ts packages/admin-shared/src/teams.test.ts packages/admin-shared/src/index.ts
git add packages/admin-shared/src/teams.ts packages/admin-shared/src/teams.test.ts packages/admin-shared/src/index.ts
git commit -m "feat(admin-shared): 팀 스키마 — 재귀 노드 · 이름 64자 · 이동은 기준 형제 번호

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: admin-shared 트리 함수

**Files:**

- Create: `packages/admin-shared/src/team-tree.ts`, `packages/admin-shared/src/team-tree.test.ts`
- Modify: `packages/admin-shared/src/index.ts` (끝에 export 블록)

**Interfaces:**

- Consumes: Task 2 의 `AdminTeamNode` · `AdminTeamMove`.
- Produces:
  - `interface TeamTreeRow { teamNo: bigint; teamName: string; displayOrder: number; depth: number; parentTeamNo: bigint | null; parentTeamName: string | null; descendantCount: number; prevSiblingTeamNo: bigint | null; nextSiblingTeamNo: bigint | null }`
  - `interface TeamMoveTarget { parentTeamNo: bigint | null; teamName: string | null; title: string; depth: number }`
  - `interface TeamPlacement { parentTeamNo: bigint | null; beforeTeamNo: bigint | null }`
  - `sortTeamTree(nodes: readonly AdminTeamNode[]): AdminTeamNode[]`
  - `flattenTeamTree(nodes: readonly AdminTeamNode[]): TeamTreeRow[]`
  - `filterTeamTree(nodes: readonly AdminTeamNode[], query: string): AdminTeamNode[]`
  - `findTeamPlacement(nodes: readonly AdminTeamNode[], teamNo: bigint): TeamPlacement | null`
  - `siblingMove(nodes: readonly AdminTeamNode[], teamNo: bigint, direction: 'up' | 'down'): AdminTeamMove | null`
  - `moveTargets(nodes: readonly AdminTeamNode[], teamNo: bigint, options?: { topLevel?: boolean; canReceive?: (node: AdminTeamNode) => boolean }): TeamMoveTarget[]`
  - `toDisplayOrderMove(nodes: readonly AdminTeamNode[], move: AdminTeamMove): { parentTeamNo?: bigint; displayOrder: number } | null`
  - `TEAM_INDENT_UNIT = '　'`, `TEAM_BRANCH_MARK = '└ '`, `indentTeamName(teamName: string, depth: number): string`

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-shared/src/team-tree.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { AdminTeamNode } from './teams.js'
import {
  TEAM_BRANCH_MARK,
  TEAM_INDENT_UNIT,
  filterTeamTree,
  findTeamPlacement,
  flattenTeamTree,
  indentTeamName,
  moveTargets,
  siblingMove,
  sortTeamTree,
  toDisplayOrderMove,
} from './team-tree.js'

const n = (
  teamNo: number,
  teamName: string,
  displayOrder: number,
  children: AdminTeamNode[] = [],
): AdminTeamNode => ({ teamNo: BigInt(teamNo), teamName, displayOrder, children })

/** 서버가 형제를 뒤집어 보낸 모양 — 정렬을 시험한다. 영업본부 아래 순서 값에 빈 번호(0 · 5 · 9)가 있다(hangang). */
const TREE = (): AdminTeamNode[] => [
  n(1, '한강투자그룹', 0, [
    n(3, '관리본부', 5, [n(7, '인사팀', 0)]),
    n(2, '영업본부', 0, [n(6, '분당지점', 9), n(4, '강남지점', 0), n(5, '판교지점', 5)]),
    n(9, '시스템 관리', 9),
  ]),
]

const names = (nodes: AdminTeamNode[]) => flattenTeamTree(nodes).map((row) => row.teamName)
const rowOf = (teamNo: bigint) => flattenTeamTree(TREE()).find((row) => row.teamNo === teamNo)!

describe('sortTeamTree', () => {
  it('모든 단계의 형제를 displayOrder 오름차순으로 정렬한다', () => {
    const sorted = sortTeamTree(TREE())
    expect(sorted[0]!.children.map((c) => c.teamName)).toEqual([
      '영업본부',
      '관리본부',
      '시스템 관리',
    ])
    expect(sorted[0]!.children[0]!.children.map((c) => c.teamName)).toEqual([
      '강남지점',
      '판교지점',
      '분당지점',
    ])
  })

  it('같은 값이면 받은 순서를 지킨다', () => {
    expect(
      sortTeamTree([n(1, '가', 3), n(2, '나', 3), n(3, '다', 1)]).map((x) => x.teamName),
    ).toEqual(['다', '가', '나'])
  })

  it('🔴 입력을 바꾸지 않는다 — 결과는 사본이다(D1)', () => {
    const input = TREE()
    const before = structuredClone(input)
    const sorted = sortTeamTree(input)
    expect(input).toEqual(before)
    expect(sorted[0]).not.toBe(input[0])
  })
})

describe('flattenTeamTree', () => {
  it('정렬한 뒤 깊이 우선으로 펼친다', () => {
    const rows = flattenTeamTree(TREE())
    expect(rows.map((r) => r.teamName)).toEqual([
      '한강투자그룹',
      '영업본부',
      '강남지점',
      '판교지점',
      '분당지점',
      '관리본부',
      '인사팀',
      '시스템 관리',
    ])
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 2, 2, 1, 2, 1])
  })

  it('상위 팀 번호 · 이름을 단다 — 루트는 null', () => {
    expect(rowOf(5n)).toMatchObject({ parentTeamNo: 2n, parentTeamName: '영업본부' })
    expect(rowOf(1n)).toMatchObject({ parentTeamNo: null, parentTeamName: null })
  })

  it('하위 팀 수는 자기를 뺀 전부다', () => {
    expect(rowOf(1n).descendantCount).toBe(7)
    expect(rowOf(2n).descendantCount).toBe(3)
    expect(rowOf(3n).descendantCount).toBe(1)
    expect(rowOf(4n).descendantCount).toBe(0)
  })

  it('앞뒤 형제 번호 — 가장자리 · 루트는 null', () => {
    expect(rowOf(5n)).toMatchObject({ prevSiblingTeamNo: 4n, nextSiblingTeamNo: 6n })
    expect(rowOf(4n).prevSiblingTeamNo).toBeNull()
    expect(rowOf(6n).nextSiblingTeamNo).toBeNull()
    expect(rowOf(1n)).toMatchObject({ prevSiblingTeamNo: null, nextSiblingTeamNo: null })
  })

  it('루트가 여럿이면 차례로 펼친다', () => {
    const rows = flattenTeamTree([n(1, 'A', 1), n(2, 'B', 0)])
    expect(rows.map((r) => r.teamName)).toEqual(['B', 'A'])
    expect(rows[0]!.nextSiblingTeamNo).toBe(1n)
  })

  it('빈 배열이면 []', () => {
    expect(flattenTeamTree([])).toEqual([])
  })
})

describe('filterTeamTree — 부모 포함 검색(hangang R17)', () => {
  it('일치한 팀과 그 조상만 남긴다', () => {
    expect(names(filterTeamTree(TREE(), '판교'))).toEqual(['한강투자그룹', '영업본부', '판교지점'])
  })

  it('🔴 부모가 일치해도 일치하지 않은 자식은 따라오지 않는다', () => {
    expect(names(filterTeamTree(TREE(), '영업'))).toEqual(['한강투자그룹', '영업본부'])
  })

  it('형제 여럿이 일치해도 부모는 한 번, 순서는 정렬 순서', () => {
    expect(names(filterTeamTree(TREE(), '지점'))).toEqual([
      '한강투자그룹',
      '영업본부',
      '강남지점',
      '판교지점',
      '분당지점',
    ])
    expect(names(filterTeamTree(TREE(), '관리'))).toEqual([
      '한강투자그룹',
      '관리본부',
      '시스템 관리',
    ])
  })

  it('대소문자를 무시하고 앞뒤 공백을 지운다', () => {
    expect(names(filterTeamTree([n(1, 'Sales Team', 0)], '  SALES '))).toEqual(['Sales Team'])
  })

  it('빈 검색어면 정렬한 전체, 아무것도 안 맞으면 []', () => {
    expect(names(filterTeamTree(TREE(), '  '))).toHaveLength(8)
    expect(filterTeamTree(TREE(), '없는팀')).toEqual([])
  })
})

describe('findTeamPlacement — 주어진 순서 그대로', () => {
  it('정렬하지 않는다 — 드래그로 바뀐 사본의 자리를 읽는 함수다', () => {
    expect(findTeamPlacement(TREE(), 2n)).toEqual({ parentTeamNo: 1n, beforeTeamNo: 9n })
    expect(findTeamPlacement(TREE(), 3n)).toEqual({ parentTeamNo: 1n, beforeTeamNo: 2n })
    expect(findTeamPlacement(TREE(), 6n)).toEqual({ parentTeamNo: 2n, beforeTeamNo: 4n })
  })

  it('막내 · 최상위 · 없는 번호', () => {
    expect(findTeamPlacement(TREE(), 9n)).toEqual({ parentTeamNo: 1n, beforeTeamNo: null })
    expect(findTeamPlacement(TREE(), 1n)).toEqual({ parentTeamNo: null, beforeTeamNo: null })
    expect(findTeamPlacement(TREE(), 99n)).toBeNull()
  })
})

describe('siblingMove — ↑↓ 의 이동 요청', () => {
  it('↑ 는 바로 앞 형제 앞으로', () => {
    expect(siblingMove(TREE(), 5n, 'up')).toEqual({
      teamNo: 5n,
      parentTeamNo: 2n,
      beforeTeamNo: 4n,
    })
  })

  it('↓ 는 바로 뒤 형제 뒤로 — 그다음 형제 앞, 없으면 맨 끝(null)', () => {
    expect(siblingMove(TREE(), 4n, 'down')).toEqual({
      teamNo: 4n,
      parentTeamNo: 2n,
      beforeTeamNo: 6n,
    })
    expect(siblingMove(TREE(), 5n, 'down')).toEqual({
      teamNo: 5n,
      parentTeamNo: 2n,
      beforeTeamNo: null,
    })
    expect(siblingMove(TREE(), 2n, 'down')).toEqual({
      teamNo: 2n,
      parentTeamNo: 1n,
      beforeTeamNo: 9n,
    })
  })

  it('첫째 ↑ · 막내 ↓ · 하나뿐인 루트 · 없는 번호는 null', () => {
    expect(siblingMove(TREE(), 4n, 'up')).toBeNull()
    expect(siblingMove(TREE(), 6n, 'down')).toBeNull()
    expect(siblingMove(TREE(), 1n, 'up')).toBeNull()
    expect(siblingMove(TREE(), 1n, 'down')).toBeNull()
    expect(siblingMove(TREE(), 99n, 'up')).toBeNull()
  })
})

describe('moveTargets — 옮기기 선택지', () => {
  it('🔴 자기 · 자기 하위 팀(순환) · 지금 상위 팀을 빼고 조직도 순서 · 들여쓰기로', () => {
    expect(moveTargets(TREE(), 2n)).toEqual([
      { parentTeamNo: 3n, teamName: '관리본부', title: '└ 관리본부', depth: 1 },
      { parentTeamNo: 7n, teamName: '인사팀', title: '　└ 인사팀', depth: 2 },
      { parentTeamNo: 9n, teamName: '시스템 관리', title: '└ 시스템 관리', depth: 1 },
    ])
    expect(moveTargets(TREE(), 5n).map((t) => t.parentTeamNo)).toEqual([1n, 4n, 6n, 3n, 7n, 9n])
  })

  it('canReceive 가 거짓인 팀을 뺀다', () => {
    const targets = moveTargets(TREE(), 5n, { canReceive: (node) => node.teamNo !== 9n })
    expect(targets.map((t) => t.parentTeamNo)).toEqual([1n, 4n, 6n, 3n, 7n])
  })

  it('topLevel 이면 맨 앞에 최상위 — 이미 최상위인 팀에는 없다', () => {
    const targets = moveTargets(TREE(), 5n, { topLevel: true })
    expect(targets[0]).toEqual({ parentTeamNo: null, teamName: null, title: '최상위', depth: 0 })
    expect(targets).toHaveLength(7)
    expect(moveTargets(TREE(), 1n, { topLevel: true })).toEqual([])
  })

  it('없는 번호면 []', () => {
    expect(moveTargets(TREE(), 99n)).toEqual([])
  })
})

describe('toDisplayOrderMove — 순서 값을 받는 기존 서버(hangang)용', () => {
  it('같은 상위 팀 · 앞으로 — 그 형제의 값, parentTeamNo 키 없음', () => {
    expect(
      toDisplayOrderMove(TREE(), { teamNo: 5n, parentTeamNo: 2n, beforeTeamNo: 4n }),
    ).toStrictEqual({ displayOrder: 0 })
    expect(
      toDisplayOrderMove(TREE(), { teamNo: 6n, parentTeamNo: 2n, beforeTeamNo: 5n }),
    ).toStrictEqual({ displayOrder: 5 })
  })

  it('🔴 같은 상위 팀 · 뒤로 — 기준 형제 바로 앞 형제의 값(빈 번호가 있어도 ±1 이 아니다)', () => {
    expect(
      toDisplayOrderMove(TREE(), { teamNo: 4n, parentTeamNo: 2n, beforeTeamNo: 6n }),
    ).toStrictEqual({ displayOrder: 5 })
    expect(
      toDisplayOrderMove(TREE(), { teamNo: 5n, parentTeamNo: 2n, beforeTeamNo: null }),
    ).toStrictEqual({ displayOrder: 9 })
  })

  it('제자리면 null', () => {
    expect(
      toDisplayOrderMove(TREE(), { teamNo: 4n, parentTeamNo: 2n, beforeTeamNo: 5n }),
    ).toBeNull()
    expect(
      toDisplayOrderMove(TREE(), { teamNo: 6n, parentTeamNo: 2n, beforeTeamNo: null }),
    ).toBeNull()
  })

  it('다른 상위 팀 — 기준 형제의 값, 맨 끝이면 최댓값 + 1, 형제가 없으면 0', () => {
    expect(
      toDisplayOrderMove(TREE(), { teamNo: 5n, parentTeamNo: 3n, beforeTeamNo: 7n }),
    ).toStrictEqual({ parentTeamNo: 3n, displayOrder: 0 })
    expect(
      toDisplayOrderMove(TREE(), { teamNo: 5n, parentTeamNo: 3n, beforeTeamNo: null }),
    ).toStrictEqual({ parentTeamNo: 3n, displayOrder: 1 })
    expect(
      toDisplayOrderMove(TREE(), { teamNo: 5n, parentTeamNo: 9n, beforeTeamNo: null }),
    ).toStrictEqual({ parentTeamNo: 9n, displayOrder: 0 })
  })

  it('킷 이벤트가 만들지 않는 요청은 던진다', () => {
    expect(() =>
      toDisplayOrderMove(TREE(), { teamNo: 99n, parentTeamNo: 2n, beforeTeamNo: null }),
    ).toThrow()
    expect(() =>
      toDisplayOrderMove(TREE(), { teamNo: 5n, parentTeamNo: 3n, beforeTeamNo: 4n }),
    ).toThrow()
    expect(() =>
      toDisplayOrderMove(TREE(), { teamNo: 5n, parentTeamNo: 2n, beforeTeamNo: 5n }),
    ).toThrow()
    expect(() =>
      toDisplayOrderMove(TREE(), { teamNo: 5n, parentTeamNo: null, beforeTeamNo: null }),
    ).toThrow()
  })

  it('🔴 자기 하위 팀 밑으로 옮기는 요청(순환)은 던진다', () => {
    expect(() =>
      toDisplayOrderMove(TREE(), { teamNo: 2n, parentTeamNo: 4n, beforeTeamNo: null }),
    ).toThrow()
  })
})

describe('indentTeamName', () => {
  it('깊이 0 이면 이름 그대로, 1 이면 └ 만', () => {
    expect(indentTeamName('팀', 0)).toBe('팀')
    expect(indentTeamName('팀', -1)).toBe('팀')
    expect(indentTeamName('팀', 1)).toBe('└ 팀')
  })

  it('🔴 들여쓰기는 U+3000 · 표시는 U+2514 U+0020 — U+0020 은 HTML 공백 접기로 깊이가 뭉개진다', () => {
    expect([...TEAM_INDENT_UNIT].map((c) => c.codePointAt(0))).toEqual([0x3000])
    expect([...TEAM_BRANCH_MARK].map((c) => c.codePointAt(0))).toEqual([0x2514, 0x20])
    expect([...indentTeamName('팀', 3)].slice(0, 4).map((c) => c.codePointAt(0))).toEqual([
      0x3000, 0x3000, 0x2514, 0x20,
    ])
    expect(indentTeamName('팀', 3)).not.toBe(indentTeamName('팀', 7))
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-shared/src/team-tree.test.ts`
Expected: FAIL — `Cannot find module './team-tree.js'`.

- [ ] **Step 3: 구현**

`packages/admin-shared/src/team-tree.ts`:

```ts
import type { AdminTeamMove, AdminTeamNode } from './teams.js'

// 팀 트리 순수 함수 — 정렬 · 평탄화 · 검색 · 자리 · 이동 계산 · 들여쓰기.
//
// 정본: hangang-home apps/admin/src/pages/org/teams-messages.ts(flattenTeamTree · indentTeamName)
//       + apps/admin/src/components/org/TeamTree.vue(부모 포함 검색 — Ruling R17)
// 바꾼 점:
//  - 🔴 정렬은 `sortTeamTree()` 하나다(3d 스펙 D1). hangang 은 트리(서버 순서를 믿음)와 페이지(다시 정렬)가 따로
//    평탄화해 보이는 이웃과 계산에 쓰는 이웃이 어긋날 수 있었다.
//  - 루트가 여럿인 숲을 받는다(hangang 은 루트 하나 | null).
//  - 이동은 기준 형제 번호(3d ⑤ O3)다. hangang 의 "이웃의 displayOrder" 계산은 기존 서버용 `toDisplayOrderMove()` 로 옮겼다.

export interface TeamTreeRow {
  teamNo: bigint
  teamName: string
  displayOrder: number
  /** 0 = 최상위 */
  depth: number
  parentTeamNo: bigint | null
  parentTeamName: string | null
  /** 자기 제외 */
  descendantCount: number
  prevSiblingTeamNo: bigint | null
  nextSiblingTeamNo: bigint | null
}

export interface TeamMoveTarget {
  /** null = 최상위 */
  parentTeamNo: bigint | null
  /** 원래 이름(검색용). 최상위면 null */
  teamName: string | null
  /** 들여쓴 표시 이름. 최상위면 '최상위' */
  title: string
  depth: number
}

/** 그 팀의 지금 자리 — 상위 팀(최상위면 null)과 바로 뒤 형제(막내면 null) */
export interface TeamPlacement {
  parentTeamNo: bigint | null
  beforeTeamNo: bigint | null
}

export const TEAM_INDENT_UNIT = '　'
export const TEAM_BRANCH_MARK = '└ '

interface Located {
  node: AdminTeamNode
  parent: AdminTeamNode | null
  siblings: readonly AdminTeamNode[]
  index: number
}

function locate(
  list: readonly AdminTeamNode[],
  teamNo: bigint,
  parent: AdminTeamNode | null = null,
): Located | null {
  for (let index = 0; index < list.length; index += 1) {
    const node = list[index]!
    if (node.teamNo === teamNo) return { node, parent, siblings: list, index }
    const found = locate(node.children, teamNo, node)
    if (found) return found
  }
  return null
}

function contains(node: AdminTeamNode, teamNo: bigint): boolean {
  return node.children.some((child) => child.teamNo === teamNo || contains(child, teamNo))
}

/** 모든 단계의 형제를 displayOrder 오름차순(같으면 받은 순서)으로 정렬한 사본. 입력을 바꾸지 않는다. */
export function sortTeamTree(nodes: readonly AdminTeamNode[]): AdminTeamNode[] {
  return nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => a.node.displayOrder - b.node.displayOrder || a.index - b.index)
    .map(({ node }) => ({ ...node, children: sortTeamTree(node.children) }))
}

/** 정렬한 뒤 깊이 우선으로 펼친다. */
export function flattenTeamTree(nodes: readonly AdminTeamNode[]): TeamTreeRow[] {
  const rows: TeamTreeRow[] = []
  const visit = (
    siblings: readonly AdminTeamNode[],
    depth: number,
    parent: AdminTeamNode | null,
  ): number => {
    let count = 0
    siblings.forEach((node, index) => {
      const at = rows.length
      rows.push({
        teamNo: node.teamNo,
        teamName: node.teamName,
        displayOrder: node.displayOrder,
        depth,
        parentTeamNo: parent?.teamNo ?? null,
        parentTeamName: parent?.teamName ?? null,
        descendantCount: 0,
        prevSiblingTeamNo: siblings[index - 1]?.teamNo ?? null,
        nextSiblingTeamNo: siblings[index + 1]?.teamNo ?? null,
      })
      const descendants = visit(node.children, depth + 1, node)
      rows[at]!.descendantCount = descendants
      count += 1 + descendants
    })
    return count
  }
  visit(sortTeamTree(nodes), 0, null)
  return rows
}

/**
 * 일치한 팀 + 그 조상의 정렬된 사본. 앞뒤 공백을 지우고 대소문자를 무시한 부분 일치.
 * 🔴 부모가 일치해도 일치하지 않은 자식은 따라오지 않는다 — 계약은 "그 노드와 그 조상"이지
 *    "그 노드의 후손 전부"가 아니다(hangang R17).
 */
export function filterTeamTree(nodes: readonly AdminTeamNode[], query: string): AdminTeamNode[] {
  const sorted = sortTeamTree(nodes)
  const needle = query.trim().toLowerCase()
  if (needle === '') return sorted
  const walk = (list: readonly AdminTeamNode[]): AdminTeamNode[] =>
    list.flatMap((node) => {
      const children = walk(node.children)
      return node.teamName.toLowerCase().includes(needle) || children.length > 0
        ? [{ ...node, children }]
        : []
    })
  return walk(sorted)
}

/** 그 팀의 지금 자리. 주어진 배열 순서 그대로 읽는다(정렬하지 않는다 — 드래그로 바뀐 사본을 읽는 함수다). */
export function findTeamPlacement(
  nodes: readonly AdminTeamNode[],
  teamNo: bigint,
): TeamPlacement | null {
  const at = locate(nodes, teamNo)
  if (at == null) return null
  return {
    parentTeamNo: at.parent?.teamNo ?? null,
    beforeTeamNo: at.siblings[at.index + 1]?.teamNo ?? null,
  }
}

/** ↑↓ 의 이동 요청. 첫째의 up · 막내의 down · 없는 번호는 null. */
export function siblingMove(
  nodes: readonly AdminTeamNode[],
  teamNo: bigint,
  direction: 'up' | 'down',
): AdminTeamMove | null {
  const at = locate(sortTeamTree(nodes), teamNo)
  if (at == null) return null
  const parentTeamNo = at.parent?.teamNo ?? null
  if (direction === 'up') {
    const previous = at.siblings[at.index - 1]
    return previous ? { teamNo, parentTeamNo, beforeTeamNo: previous.teamNo } : null
  }
  if (at.index === at.siblings.length - 1) return null
  return { teamNo, parentTeamNo, beforeTeamNo: at.siblings[at.index + 2]?.teamNo ?? null }
}

/**
 * "옮기기" 선택지 — 조직도 순서 · 들여쓴 제목.
 * 🔴 자기 자신 · 자기 하위 팀(순환) · 지금 상위 팀 · `canReceive` 가 거짓인 팀을 뺀다.
 */
export function moveTargets(
  nodes: readonly AdminTeamNode[],
  teamNo: bigint,
  options: { topLevel?: boolean; canReceive?: (node: AdminTeamNode) => boolean } = {},
): TeamMoveTarget[] {
  const sorted = sortTeamTree(nodes)
  const at = locate(sorted, teamNo)
  if (at == null) return []
  const currentParent = at.parent?.teamNo ?? null
  const byNo = new Map<bigint, AdminTeamNode>()
  const index = (list: readonly AdminTeamNode[]) =>
    list.forEach((node) => {
      byNo.set(node.teamNo, node)
      index(node.children)
    })
  index(sorted)

  const targets: TeamMoveTarget[] = []
  if (options.topLevel === true && currentParent !== null) {
    targets.push({ parentTeamNo: null, teamName: null, title: '최상위', depth: 0 })
  }
  for (const row of flattenTeamTree(sorted)) {
    if (row.teamNo === teamNo || row.teamNo === currentParent || contains(at.node, row.teamNo))
      continue
    if (options.canReceive && !options.canReceive(byNo.get(row.teamNo)!)) continue
    targets.push({
      parentTeamNo: row.teamNo,
      teamName: row.teamName,
      title: indentTeamName(row.teamName, row.depth),
      depth: row.depth,
    })
  }
  return targets
}

/**
 * 기준 형제 번호 요청(O3)을 hangang 서버 규칙(형제 순서 값 · 빈 번호 허용 · 이웃 값을 보내면 정확히 한 칸)으로 바꾼다.
 * 같은 상위 팀이면 `parentTeamNo` 를 싣지 않는다(hangang: 생략 = 순서만). 제자리면 null.
 * 킷 이벤트가 만들지 않는 요청(없는 팀 · 그 상위 팀의 자식이 아닌 기준 · 최상위로의 이동 · 순환)은 던진다.
 */
export function toDisplayOrderMove(
  nodes: readonly AdminTeamNode[],
  move: AdminTeamMove,
): { parentTeamNo?: bigint; displayOrder: number } | null {
  const sorted = sortTeamTree(nodes)
  const at = locate(sorted, move.teamNo)
  if (at == null) throw new Error(`toDisplayOrderMove: 팀 ${move.teamNo} 이 트리에 없다`)
  if (move.beforeTeamNo === move.teamNo) {
    throw new Error('toDisplayOrderMove: 자기 자신 앞으로 옮길 수 없다')
  }
  const currentParent = at.parent?.teamNo ?? null

  if (move.parentTeamNo === currentParent) {
    const siblings = at.siblings
    const next = siblings[at.index + 1]?.teamNo ?? null
    if (move.beforeTeamNo === next) return null
    if (move.beforeTeamNo === null)
      return { displayOrder: siblings[siblings.length - 1]!.displayOrder }
    const target = siblings.findIndex((sibling) => sibling.teamNo === move.beforeTeamNo)
    if (target < 0) {
      throw new Error(`toDisplayOrderMove: 팀 ${move.beforeTeamNo} 은 그 상위 팀의 자식이 아니다`)
    }
    // 앞으로 가면 그 형제 자리, 뒤로 가면 기준 형제 바로 앞 형제 자리를 차지한다
    const slot = target < at.index ? siblings[target]! : siblings[target - 1]!
    return { displayOrder: slot.displayOrder }
  }

  if (move.parentTeamNo === null) {
    throw new Error('toDisplayOrderMove: 순서 값 서버는 최상위로의 이동을 표현하지 못한다')
  }
  if (contains(at.node, move.parentTeamNo)) {
    throw new Error('toDisplayOrderMove: 자기 하위 팀 밑으로 옮길 수 없다(순환)')
  }
  const parent = locate(sorted, move.parentTeamNo)
  if (parent == null) throw new Error(`toDisplayOrderMove: 상위 팀 ${move.parentTeamNo} 이 없다`)
  const siblings = parent.node.children
  if (move.beforeTeamNo === null) {
    const last = siblings[siblings.length - 1]
    return { parentTeamNo: move.parentTeamNo, displayOrder: last ? last.displayOrder + 1 : 0 }
  }
  const before = siblings.find((sibling) => sibling.teamNo === move.beforeTeamNo)
  if (before == null) {
    throw new Error(`toDisplayOrderMove: 팀 ${move.beforeTeamNo} 은 그 상위 팀의 자식이 아니다`)
  }
  return { parentTeamNo: move.parentTeamNo, displayOrder: before.displayOrder }
}

/**
 * 평평한 선택 상자 안에서 깊이를 글자로 — 깊이 0 이면 이름, 아니면 U+3000 × (depth − 1) + `└ ` + 이름.
 * 🔴 U+0020 은 HTML 공백 접기로 깊이 3 과 7 이 같아진다(hangang).
 */
export function indentTeamName(teamName: string, depth: number): string {
  if (depth <= 0) return teamName
  return `${TEAM_INDENT_UNIT.repeat(depth - 1)}${TEAM_BRANCH_MARK}${teamName}`
}
```

`packages/admin-shared/src/index.ts` 끝(`./teams.js` 블록 다음)에 덧붙인다:

```ts
export {
  sortTeamTree,
  flattenTeamTree,
  filterTeamTree,
  findTeamPlacement,
  siblingMove,
  moveTargets,
  toDisplayOrderMove,
  indentTeamName,
  TEAM_INDENT_UNIT,
  TEAM_BRANCH_MARK,
  type TeamTreeRow,
  type TeamMoveTarget,
  type TeamPlacement,
} from './team-tree.js'
```

- [ ] **Step 4: 통과 확인 · 빌드**

Run: `pnpm exec vitest run packages/admin-shared/src/team-tree.test.ts`
Expected: 31 passed.

Run: `pnpm --filter @ssworks/admin-shared typecheck && pnpm --filter @ssworks/admin-shared build`
Expected: 오류 없음.

- [ ] **Step 5: 커밋**

```bash
pnpm exec prettier --write packages/admin-shared/src/team-tree.ts packages/admin-shared/src/team-tree.test.ts packages/admin-shared/src/index.ts
git add packages/admin-shared/src/team-tree.ts packages/admin-shared/src/team-tree.test.ts packages/admin-shared/src/index.ts
git commit -m "feat(admin-shared): 팀 트리 함수 — 정렬 하나 · 부모 포함 검색 · 기준 형제 이동 · 순서 값 변환

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: `TeamTree`

이 PR 에서 가장 큰 Task 다. he-tree 위의 표시 · 이벤트 컴포넌트와, 그 안의 노드 안 입력칸(`TeamNameInput`, 내부용)을 만든다. 서버 · 확인 · 재조회는 Task 6 `useTeamTree` 몫이다.

**Files:**

- Create: `packages/admin-ui/src/components/team/team-tree.ts`
- Create: `packages/admin-ui/src/components/team/TeamNameInput.vue`
- Create: `packages/admin-ui/src/components/team/TeamTree.vue`
- Create: `packages/admin-ui/src/components/team/team-tree.render.test.ts`
- Modify: `packages/admin-ui/src/index.ts` (끝에 "── 조직 ──" 절을 새로 만든다)

**Interfaces:**

- Consumes: Task 1 의 `Draggable`(he-tree), Task 2 · 3 의 `AdminTeamNode` · `AdminTeamMove` · `TEAM_NAME_MAX_LENGTH` · `sortTeamTree` · `filterTeamTree` · `flattenTeamTree` · `findTeamPlacement` · `siblingMove` · `moveTargets`, 킷 `PanelLayout`.
- Produces(`team-tree.ts`): `type TeamAction = 'addChild' | 'rename' | 'remove' | 'move'`, `type TeamEdit = { kind: 'rename'; teamNo: bigint; name: string; pending: boolean; error: string | null } | { kind: 'create'; parentTeamNo: bigint | null; name: string; pending: boolean; error: string | null }`, `type TeamEditTarget = { kind: 'rename'; teamNo: bigint } | { kind: 'create'; parentTeamNo: bigint | null }`, `type TeamCommitSource = 'enter' | 'button' | 'blur'`, `type TeamMoveSource = 'button' | 'drag'`, `interface TeamTreeMessages`, `DEFAULT_TEAM_TREE_MESSAGES`, `HE_TREE_I18N`.
- Produces(`TeamTree.vue`): props `nodes` · `modelValue` · `canWrite`(기본 false) · `busy` · `loading` · `loadFailed` · `draggable` · `topLevel` · `canAct?(node, action)` · `edit` · `resetKey` · `messages`, 이벤트 `update:modelValue(teamNo)` · `move(move: AdminTeamMove, source: TeamMoveSource)` · `reparent(teamNo)` · `remove(teamNo)` · `edit-start(target: TeamEditTarget)` · `edit-input(name)` · `edit-commit(source: TeamCommitSource)` · `edit-cancel()` · `reload()`, 슬롯 `#badge="{ node }"`.

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-ui/src/components/team/team-tree.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, type Component } from 'vue'
import { VBtn } from 'vuetify/components'
import { Draggable } from '@he-tree/vue'
import type { AdminTeamNode } from '@ssworks/admin-shared'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import TeamTree from './TeamTree.vue'
import type { TeamEdit } from './team-tree.js'

// 정본: hangang-home apps/admin/src/components/org/team-tree.render.test.ts(평탄화 순서 · 두 겹 잠금 · 부모 포함 검색)
//       — 깊이는 `data-team-depth` 대신 he-tree 의 `aria-level` 로, 버튼은 팀 이름이 든 접근 이름으로 찾는다.

installVisualViewport()

const n = (
  teamNo: number,
  teamName: string,
  displayOrder: number,
  children: AdminTeamNode[] = [],
): AdminTeamNode => ({ teamNo: BigInt(teamNo), teamName, displayOrder, children })

/** 서버가 형제를 뒤집어 보낸 모양 — 정렬해서 그려야 한다 */
const TREE = (): AdminTeamNode[] => [
  n(1, '한강투자그룹', 0, [
    n(3, '관리본부', 5, [n(7, '인사팀', 0)]),
    n(2, '영업본부', 0, [n(6, '분당지점', 9), n(4, '강남지점', 0), n(5, '판교지점', 5)]),
  ]),
]
const ALL = ['한강투자그룹', '영업본부', '강남지점', '판교지점', '분당지점', '관리본부', '인사팀']

const renaming = (over: Partial<Extract<TeamEdit, { kind: 'rename' }>> = {}): TeamEdit => ({
  kind: 'rename',
  teamNo: 5n,
  name: '판교지점',
  pending: false,
  error: null,
  ...over,
})
const creating = (parentTeamNo: bigint | null): TeamEdit => ({
  kind: 'create',
  parentTeamNo,
  name: '',
  pending: false,
  error: null,
})

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

async function setup(props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) {
  wrapper = mount(TeamTree as Component, {
    attachTo: document.body,
    props: { nodes: TREE(), canWrite: true, ...props },
    slots,
    global: { plugins: [vuetify] },
  })
  await flushPromises()
  return wrapper
}

const names = () =>
  [...document.querySelectorAll('.team-tree__name')].map((e) => (e.textContent ?? '').trim())
const levels = () =>
  [...document.querySelectorAll('[role="treeitem"]')].map((e) => e.getAttribute('aria-level'))
const button = (label: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
const input = () => document.querySelector<HTMLInputElement>('input[name="teamName"]')
const nameEl = (team: string) =>
  [...document.querySelectorAll<HTMLElement>('.team-tree__name')].find(
    (e) => (e.textContent ?? '').trim() === team,
  )!
const treeItemOf = (team: string) => nameEl(team).closest<HTMLElement>('[role="treeitem"]')!

async function openMenu(team: string) {
  button(`「${team}」 메뉴`)!.click()
  await flushPromises()
  await nextTick()
}
const menuItem = (title: string) =>
  [...document.querySelectorAll<HTMLElement>('.v-overlay--active .v-list-item')].find(
    (e) => (e.textContent ?? '').trim() === title,
  )

function key(target: Element, init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

interface HeStatLike {
  data: { team?: AdminTeamNode; draft?: true }
}
interface HeTreeVm {
  statsFlat: HeStatLike[]
  move(stat: HeStatLike, parent: HeStatLike | null, index: number): boolean
}

/** he-tree 의 끌어 놓기를 흉내 낸다 — 인스턴스 move() 는 change 를 내지 않아(Task 1 계약) 직접 내보낸다 */
async function dragTo(team: string, parent: string, index: number) {
  const tree = wrapper!.findComponent(Draggable)
  const vm = tree.vm as unknown as HeTreeVm
  const stat = (name: string) => vm.statsFlat.find((s) => s.data.team?.teamName === name)!
  tree.vm.$emit('before-drag-start', stat(team))
  vm.move(stat(team), stat(parent), index)
  tree.vm.$emit('change')
  await flushPromises()
}

describe('TeamTree — 그리기', () => {
  it('displayOrder 로 정렬해 깊이 우선으로 그리고, 깊이는 aria-level 로 잰다', async () => {
    await setup()
    expect(names()).toEqual(ALL)
    expect(levels()).toEqual(['1', '2', '3', '3', '3', '2', '3'])
    expect(document.querySelector('[role="tree"]')?.getAttribute('aria-label')).toBe('팀 트리')
  })

  it('🔴 nodes 를 고치지 않는다(D2)', async () => {
    const nodes = TREE()
    const before = structuredClone(nodes)
    await setup({ nodes, draggable: true })
    await dragTo('판교지점', '관리본부', 0)
    expect(nodes).toEqual(before)
  })

  it('행을 누르면 고른다 — 잠겨 있어도(선택은 읽기 동작)', async () => {
    await setup({ canWrite: false, busy: true })
    nameEl('판교지점').click()
    await flushPromises()
    expect(wrapper!.emitted('update:modelValue')).toEqual([[5n]])
  })

  it('고른 행에 표시가 붙는다', async () => {
    await setup({ modelValue: 5n })
    expect(
      document.querySelector('.team-tree__row--selected .team-tree__name')?.textContent?.trim(),
    ).toBe('판교지점')
  })

  it('#badge 슬롯이 이름 옆에 그려진다', async () => {
    await setup(
      {},
      {
        badge: ({ node }: { node: AdminTeamNode }) =>
          node.teamNo === 2n ? h('span', { class: 'chip' }, '본부') : null,
      },
    )
    expect([...document.querySelectorAll('.chip')].map((e) => e.textContent)).toEqual(['본부'])
  })
})

describe('TeamTree — 잠금 · 버튼 · 메뉴', () => {
  it('↑↓ 는 형제 순서 이동을 낸다', async () => {
    await setup()
    button('「판교지점」 위로')!.click()
    button('「판교지점」 아래로')!.click()
    expect(wrapper!.emitted('move')).toEqual([
      [{ teamNo: 5n, parentTeamNo: 2n, beforeTeamNo: 4n }, 'button'],
      [{ teamNo: 5n, parentTeamNo: 2n, beforeTeamNo: null }, 'button'],
    ])
  })

  it('첫째의 ↑ · 막내의 ↓ · 하나뿐인 루트는 비활성', async () => {
    await setup()
    expect(button('「강남지점」 위로')!.disabled).toBe(true)
    expect(button('「분당지점」 아래로')!.disabled).toBe(true)
    expect(button('「한강투자그룹」 위로')!.disabled).toBe(true)
    expect(button('「강남지점」 아래로')!.disabled).toBe(false)
  })

  it('🔴 canWrite 가 거짓이면 쓰기 버튼이 잠기고, 비활성을 우회해 눌러도 아무것도 안 낸다', async () => {
    await setup({ canWrite: false })
    expect(button('「판교지점」 위로')!.disabled).toBe(true)
    expect(button('「판교지점」 메뉴')!.disabled).toBe(true)
    const up = wrapper!
      .findAllComponents(VBtn)
      .find((b) => b.attributes('aria-label') === '「판교지점」 위로')!
    up.vm.$emit('click', new MouseEvent('click'))
    await flushPromises()
    expect(wrapper!.emitted('move')).toBeUndefined()
  })

  it('busy 도 같은 잠금이다', async () => {
    await setup({ busy: true })
    expect(button('「판교지점」 위로')!.disabled).toBe(true)
    expect(button('「판교지점」 메뉴')!.disabled).toBe(true)
  })

  it('메뉴 — 하위 팀 추가 · 이름 바꾸기 · 옮기기 · 삭제가 이벤트를 낸다', async () => {
    await setup()
    await openMenu('판교지점')
    menuItem('하위 팀 추가')!.click()
    await openMenu('판교지점')
    menuItem('이름 바꾸기')!.click()
    await openMenu('판교지점')
    menuItem('옮기기')!.click()
    await openMenu('판교지점')
    menuItem('삭제')!.click()
    await flushPromises()
    expect(wrapper!.emitted('edit-start')).toEqual([
      [{ kind: 'create', parentTeamNo: 5n }],
      [{ kind: 'rename', teamNo: 5n }],
    ])
    expect(wrapper!.emitted('reparent')).toEqual([[5n]])
    expect(wrapper!.emitted('remove')).toEqual([[5n]])
  })

  it('canAct 가 거짓인 동작은 비활성이다', async () => {
    await setup({
      canAct: (node: AdminTeamNode, action: string) => !(node.teamNo === 5n && action === 'move'),
    })
    expect(button('「판교지점」 위로')!.disabled).toBe(true)
    expect(button('「강남지점」 아래로')!.disabled).toBe(false)
    await openMenu('판교지점')
    expect(menuItem('옮기기')!.classList.contains('v-list-item--disabled')).toBe(true)
    expect(menuItem('이름 바꾸기')!.classList.contains('v-list-item--disabled')).toBe(false)
  })

  it('옮겨 갈 상위 팀이 없으면 옮기기가 비활성이다', async () => {
    await setup({ nodes: [n(1, '본사', 0)] })
    await openMenu('본사')
    expect(menuItem('옮기기')!.classList.contains('v-list-item--disabled')).toBe(true)
  })
})

describe('TeamTree — 검색 · 펼침', () => {
  it('일치한 팀과 그 조상만 보인다', async () => {
    await setup()
    await wrapper!.find('input[name="teamSearch"]').setValue('판교')
    await flushPromises()
    expect(names()).toEqual(['한강투자그룹', '영업본부', '판교지점'])
  })

  it('🔴 검색 중에는 ↑↓ 가 잠긴다 — 숨은 형제와 자리가 바뀐다(D9)', async () => {
    await setup()
    await wrapper!.find('input[name="teamSearch"]').setValue('지점')
    await flushPromises()
    expect(button('「판교지점」 위로')!.disabled).toBe(true)
    expect(button('「판교지점」 메뉴')!.disabled).toBe(false)
  })

  it('결과가 없으면 문구, 검색어를 지우면 전체로', async () => {
    await setup()
    const search = wrapper!.find('input[name="teamSearch"]')
    await search.setValue('없는팀')
    await flushPromises()
    expect(document.body.textContent).toContain('검색 결과가 없습니다.')
    await search.setValue('')
    await flushPromises()
    expect(names()).toEqual(ALL)
  })

  it('🔴 접은 팀은 nodes 가 새로 와도 · resetKey 가 바뀌어도 접혀 있다(D3)', async () => {
    await setup()
    button('「영업본부」 접기')!.click()
    await flushPromises()
    expect(names()).toEqual(['한강투자그룹', '영업본부', '관리본부', '인사팀'])
    await wrapper!.setProps({ nodes: TREE() })
    await flushPromises()
    expect(names()).toEqual(['한강투자그룹', '영업본부', '관리본부', '인사팀'])
    await wrapper!.setProps({ resetKey: 1 })
    await flushPromises()
    expect(names()).toEqual(['한강투자그룹', '영업본부', '관리본부', '인사팀'])
    expect(button('「영업본부」 펼치기')).not.toBeNull()
  })
})

describe('TeamTree — 조회 상태', () => {
  it('트리가 비었는데 조회가 실패했으면 그 자리에 문구와 다시 시도', async () => {
    await setup({ nodes: [], loadFailed: true })
    expect(document.body.textContent).toContain('팀을 불러오지 못했습니다.')
    buttonByText('다시 시도')!.click()
    expect(wrapper!.emitted('reload')).toHaveLength(1)
  })

  it('트리가 있는데 재조회가 실패했으면 트리는 두고 위에 한 줄', async () => {
    await setup({ loadFailed: true })
    expect(names()).toEqual(ALL)
    expect(document.querySelector('.team-tree__alert')?.textContent).toContain(
      '팀을 불러오지 못했습니다.',
    )
  })

  it('팀이 없으면 문구', async () => {
    await setup({ nodes: [] })
    expect(document.body.textContent).toContain('팀이 없습니다.')
  })
})

describe('TeamTree — 노드 안 입력칸', () => {
  it('이름 바꾸기 — 그 행 이름 자리에 입력칸이 열리고 포커스', async () => {
    await setup({ edit: renaming() })
    expect(input()!.value).toBe('판교지점')
    expect(document.activeElement).toBe(input())
    expect(names()).not.toContain('판교지점')
  })

  it('하위 팀 추가 — 접혀 있던 상위 팀을 펼치고 맨 끝에 초안 행', async () => {
    await setup()
    button('「영업본부」 접기')!.click()
    await flushPromises()
    await wrapper!.setProps({ edit: creating(2n) })
    await flushPromises()
    const items = [...document.querySelectorAll<HTMLElement>('[role="treeitem"]')]
    const draft = items.findIndex((e) => e.querySelector('input[name="teamName"]') != null)
    expect(items[draft - 1]!.textContent).toContain('분당지점')
    expect(items[draft]!.getAttribute('aria-level')).toBe('3')
    expect(document.activeElement).toBe(input())
  })

  it('입력은 edit-input 으로 올린다', async () => {
    await setup({ edit: renaming() })
    await wrapper!.find('input[name="teamName"]').setValue('판교')
    expect(wrapper!.emitted('edit-input')?.at(-1)).toEqual(['판교'])
  })

  it('Enter · ✓ · 바깥 누르기는 저장 — 출처와 함께', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    await setup({ edit: renaming() })
    key(input()!, { key: 'Enter' })
    button('저장')!.click()
    input()!.dispatchEvent(new FocusEvent('blur'))
    expect(wrapper!.emitted('edit-commit')).toEqual([['enter'], ['button'], ['blur']])
  })

  it('🔴 ✕ 는 누르는 순간 포커스를 빼앗지 않고, 취소만 낸다(D5)', async () => {
    await setup({ edit: renaming() })
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    button('취소')!.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    button('취소')!.click()
    expect(wrapper!.emitted('edit-cancel')).toHaveLength(1)
    expect(wrapper!.emitted('edit-commit')).toBeUndefined()
  })

  it('🔴 Esc 로 취소한 뒤의 포커스 빠짐은 저장이 아니다(D5)', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    await setup({ edit: renaming() })
    key(input()!, { key: 'Escape' })
    input()!.dispatchEvent(new FocusEvent('blur'))
    expect(wrapper!.emitted('edit-cancel')).toHaveLength(1)
    expect(wrapper!.emitted('edit-commit')).toBeUndefined()
  })

  it('🔴 창 전환으로 포커스를 잃으면 저장하지 않는다(D5)', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    await setup({ edit: renaming() })
    input()!.dispatchEvent(new FocusEvent('blur'))
    expect(wrapper!.emitted('edit-commit')).toBeUndefined()
  })

  it('🔴 한글 조합 중 Enter 는 저장이 아니다', async () => {
    await setup({ edit: renaming() })
    key(input()!, { key: 'Enter', isComposing: true })
    expect(wrapper!.emitted('edit-commit')).toBeUndefined()
  })

  it('저장 중이면 읽기 전용 · ✓ ✕ 비활성 · 바깥 누르기도 저장 안 함', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    await setup({ edit: renaming({ pending: true }) })
    expect(input()!.readOnly).toBe(true)
    expect(button('저장')!.disabled).toBe(true)
    expect(button('취소')!.disabled).toBe(true)
    input()!.dispatchEvent(new FocusEvent('blur'))
    expect(wrapper!.emitted('edit-commit')).toBeUndefined()
  })

  it('🔴 실패 문구를 보이고, nodes 가 바뀌어도 글자 · 오류 · 포커스가 남고 저장이 새로 나가지 않는다', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    await setup({ edit: renaming({ name: '판교2', error: '이미 같은 이름의 팀이 있습니다.' }) })
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      '이미 같은 이름의 팀이 있습니다.',
    )
    await wrapper!.setProps({ nodes: TREE() })
    await flushPromises()
    expect(input()!.value).toBe('판교2')
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      '이미 같은 이름의 팀이 있습니다.',
    )
    expect(document.activeElement).toBe(input())
    expect(wrapper!.emitted('edit-commit')).toBeUndefined()
  })

  it('🔴 입력칸의 Space 는 트리로 올라가지 않는다 — he-tree 가 가로채면 공백이 안 먹는다(D6)', async () => {
    await setup({ edit: renaming() })
    const event = key(input()!, { key: ' ' })
    expect(event.defaultPrevented).toBe(false)
    expect(wrapper!.emitted('update:modelValue')).toBeUndefined()
  })

  it('입력칸이 열려 있으면 다른 쓰기 버튼이 잠긴다', async () => {
    await setup({ edit: renaming() })
    expect(button('「강남지점」 아래로')!.disabled).toBe(true)
    expect(button('「강남지점」 메뉴')!.disabled).toBe(true)
  })
})

describe('TeamTree — 드래그', () => {
  it('draggable · 잠금 · 검색 · 입력칸에 따라 he-tree 드래그를 켜고 끈다', async () => {
    const tree = () => wrapper!.findComponent(Draggable)
    await setup()
    expect(tree().props('disableDrag')).toBe(true)
    await wrapper!.setProps({ draggable: true })
    expect(tree().props('disableDrag')).toBe(false)
    await wrapper!.setProps({ busy: true })
    expect(tree().props('disableDrag')).toBe(true)
    await wrapper!.setProps({ busy: false, edit: renaming() })
    expect(tree().props('disableDrag')).toBe(true)
    await wrapper!.setProps({ edit: null })
    await wrapper!.find('input[name="teamSearch"]').setValue('지점')
    expect(tree().props('disableDrag')).toBe(true)
  })

  it('같은 상위 팀 안에서 순서를 바꾸면 move(…, drag)', async () => {
    await setup({ draggable: true })
    await dragTo('분당지점', '영업본부', 0)
    expect(wrapper!.emitted('move')).toEqual([
      [{ teamNo: 6n, parentTeamNo: 2n, beforeTeamNo: 4n }, 'drag'],
    ])
  })

  it('다른 상위 팀 아래로 놓으면 그 자리', async () => {
    await setup({ draggable: true })
    await dragTo('판교지점', '관리본부', 1)
    expect(wrapper!.emitted('move')).toEqual([
      [{ teamNo: 5n, parentTeamNo: 3n, beforeTeamNo: null }, 'drag'],
    ])
  })

  it('🔴 제자리에 놓으면 아무것도 내지 않는다(D8)', async () => {
    await setup({ draggable: true })
    await dragTo('강남지점', '영업본부', 0)
    expect(wrapper!.emitted('move')).toBeUndefined()
  })

  it('resetKey 가 바뀌면 놓기 전 모양으로 돌아간다', async () => {
    await setup({ draggable: true })
    await dragTo('판교지점', '관리본부', 1)
    expect(names()).not.toEqual(ALL)
    await wrapper!.setProps({ resetKey: 1 })
    await flushPromises()
    expect(names()).toEqual(ALL)
  })

  it('canAct(…, move) 가 거짓인 팀은 끌 수 없다', async () => {
    await setup({
      draggable: true,
      canAct: (node: AdminTeamNode, action: string) => !(node.teamNo === 5n && action === 'move'),
    })
    const tree = wrapper!.findComponent(Draggable)
    const vm = tree.vm as unknown as HeTreeVm
    const eachDraggable = tree.props('eachDraggable') as (stat: HeStatLike) => boolean
    const stat = (name: string) => vm.statsFlat.find((s) => s.data.team?.teamName === name)!
    expect(eachDraggable(stat('판교지점'))).toBe(false)
    expect(eachDraggable(stat('강남지점'))).toBe(true)
  })

  it('🔴 Alt+화살표는 가로챈다 — he-tree 키보드 이동은 확인 · 잠금을 건너뛴다(D7)', async () => {
    await setup({ draggable: true })
    key(treeItemOf('분당지점'), { key: 'ArrowUp', altKey: true })
    await flushPromises()
    expect(names()).toEqual(ALL)
    expect(wrapper!.emitted('move')).toBeUndefined()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/components/team/team-tree.render.test.ts`
Expected: FAIL — `Failed to resolve import "./TeamTree.vue"`.

- [ ] **Step 3: 타입 · 문구**

`packages/admin-ui/src/components/team/team-tree.ts`:

```ts
import type { AdminTeamNode } from '@ssworks/admin-shared'

// TeamTree 의 타입 · 기본 문구 — 컴포넌트와 `useTeamTree` 가 같이 쓴다.

/** 노드별 허용 판정의 동작 — `canAct(node, action)` */
export type TeamAction = 'addChild' | 'rename' | 'remove' | 'move'

/** 노드 안 입력칸 상태 — `useTeamTree` 가 가진다(3d 스펙 D4) */
export type TeamEdit =
  | { kind: 'rename'; teamNo: bigint; name: string; pending: boolean; error: string | null }
  | {
      kind: 'create'
      /** null = 최상위 */
      parentTeamNo: bigint | null
      name: string
      pending: boolean
      error: string | null
    }

export type TeamEditTarget =
  { kind: 'rename'; teamNo: bigint } | { kind: 'create'; parentTeamNo: bigint | null }

/** 입력칸 저장의 출처 — 바깥 누르기(`blur`)와 Enter 는 빈 이름을 다르게 다룬다 */
export type TeamCommitSource = 'enter' | 'button' | 'blur'

export type TeamMoveSource = 'button' | 'drag'

export type CanActTeam = (node: AdminTeamNode, action: TeamAction) => boolean

export interface TeamTreeMessages {
  treeLabel: string
  searchLabel: string
  empty: string
  noResult: string
  loadFailed: string
  retry: string
  up: (teamName: string) => string
  down: (teamName: string) => string
  menu: (teamName: string) => string
  toggle: (teamName: string, open: boolean) => string
  addChild: string
  rename: string
  reparent: string
  remove: string
  nameInput: string
  save: string
  cancel: string
}

export const DEFAULT_TEAM_TREE_MESSAGES: TeamTreeMessages = {
  treeLabel: '팀 트리',
  searchLabel: '팀 검색',
  empty: '팀이 없습니다.',
  noResult: '검색 결과가 없습니다.',
  loadFailed: '팀을 불러오지 못했습니다.',
  retry: '다시 시도',
  up: (teamName) => `「${teamName}」 위로`,
  down: (teamName) => `「${teamName}」 아래로`,
  menu: (teamName) => `「${teamName}」 메뉴`,
  toggle: (teamName, open) => `「${teamName}」 ${open ? '접기' : '펼치기'}`,
  addChild: '하위 팀 추가',
  rename: '이름 바꾸기',
  reparent: '옮기기',
  remove: '삭제',
  nameInput: '팀 이름',
  save: '저장',
  cancel: '취소',
}

/** he-tree 의 화면 낭독기 안내(기본 영문)를 한국어로. Alt+화살표 이동은 막으니 이동 안내는 넣지 않는다. */
export const HE_TREE_I18N = {
  instructions:
    '위아래 화살표로 팀 사이를 옮겨 다니고, 오른쪽 · 왼쪽 화살표로 펼치고 접습니다. Enter 로 팀을 고릅니다.',
}
```

- [ ] **Step 4: 노드 안 입력칸**

`packages/admin-ui/src/components/team/TeamNameInput.vue`:

```vue
<script setup lang="ts">
  import { onMounted, ref, watch } from 'vue'
  import { VBtn } from 'vuetify/components'
  import { TEAM_NAME_MAX_LENGTH } from '@ssworks/admin-shared'
  import type { TeamCommitSource } from './team-tree.js'

  // 노드 안 이름 입력칸 — TeamTree 내부용(내보내지 않는다).
  //
  // 정본: ssworks-axion-admin packages/frontend/src/components/team/TeamTreeNode.vue(인라인 편집 · `@keydown.stop`)
  // 바꾼 점:
  //  - 이름 · 저장 중 · 오류는 부모(`useTeamTree` 의 `edit`)가 가진다 — 재조회로 트리가 다시 그려져도 친 글자가 남는다.
  //  - 바깥 누르기 = 저장(3d ⑦ — axion · crm 과 같음). 그 함정 넷을 여기서 막는다(스펙 D5).
  //  - 한글 조합 중 Enter 를 저장으로 받지 않는다.

  const props = defineProps<{
    name: string
    pending: boolean
    error: string | null
    /** 열릴 때 · 다시 그려진 뒤 포커스. 'select' 는 글자 전체 선택 */
    focus: false | 'select' | 'end'
    labels: { input: string; save: string; cancel: string }
  }>()

  const emit = defineEmits<{
    input: [name: string]
    commit: [source: TeamCommitSource]
    cancel: []
    focused: []
  }>()

  const field = ref<HTMLInputElement | null>(null)
  /** 🔴 Esc · ✕ 로 취소한 뒤 입력칸이 사라질 때의 포커스 빠짐은 저장이 아니다 */
  let cancelled = false

  function applyFocus(mode: false | 'select' | 'end'): void {
    const el = field.value
    if (mode === false || el == null) return
    el.focus()
    if (mode === 'select') el.select()
    else el.setSelectionRange(el.value.length, el.value.length)
    emit('focused')
  }

  onMounted(() => applyFocus(props.focus))
  watch(
    () => props.focus,
    (mode) => applyFocus(mode),
  )

  function cancel(): void {
    cancelled = true
    emit('cancel')
  }

  function onKeydown(event: KeyboardEvent): void {
    // 🔴 키를 트리로 올려 보내지 않는다 — he-tree 루트가 Space · Enter · 방향키를 preventDefault 해 입력칸에서 공백이
    //    안 먹는다(스펙 D6, axion 이 겪음)
    event.stopPropagation()
    // 🔴 한글 조합 중 Enter 는 조합 확정이다 — 저장으로 받으면 마지막 글자가 빠진 이름이 나간다
    if (event.isComposing) return
    if (event.key === 'Enter') {
      event.preventDefault()
      emit('commit', 'enter')
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    }
  }

  function onBlur(): void {
    if (cancelled || props.pending) return
    // 🔴 창 자체가 포커스를 잃은 것(Alt+Tab)은 저장이 아니다
    if (!document.hasFocus()) return
    // 다시 그리느라 입력칸이 문서에서 떨어지는 중이면 저장이 아니다
    if (field.value == null || !field.value.isConnected) return
    emit('commit', 'blur')
  }
</script>

<template>
  <span class="team-name-input" @click.stop>
    <input
      ref="field"
      autocomplete="off"
      :aria-invalid="error ? 'true' : undefined"
      :aria-label="labels.input"
      class="team-name-input__field"
      name="teamName"
      :readonly="pending"
      type="text"
      :value="name"
      @blur="onBlur"
      @input="emit('input', ($event.target as HTMLInputElement).value)"
      @keydown="onKeydown"
    />
    <span class="team-name-input__count">{{ name.length }}/{{ TEAM_NAME_MAX_LENGTH }}</span>
    <!-- 🔴 ✓ · ✕ 는 누를 때 입력칸 포커스를 빼앗지 않는다 — 빼앗으면 ✕ 를 누르는 순간 바깥 누르기 저장이 먼저 돈다 -->
    <VBtn
      :aria-label="labels.save"
      :disabled="pending"
      icon="mdi-check"
      :loading="pending"
      size="x-small"
      variant="text"
      @click="emit('commit', 'button')"
      @mousedown.prevent
    />
    <VBtn
      :aria-label="labels.cancel"
      :disabled="pending"
      icon="mdi-close"
      size="x-small"
      variant="text"
      @click="cancel"
      @mousedown.prevent
    />
    <span v-if="error" class="team-name-input__error" role="alert">{{ error }}</span>
  </span>
</template>

<style scoped>
  .team-name-input {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 4px;
    min-width: 0;
  }

  .team-name-input__field {
    flex: 1 1 120px;
    min-width: 0;
    height: 28px;
    padding: 2px 8px;
    font: inherit;
    color: inherit;
    background: transparent;
    border: 1px solid rgb(var(--v-theme-primary));
    border-radius: 4px;
  }

  .team-name-input__field[aria-invalid='true'] {
    border-color: rgb(var(--v-theme-error));
  }

  .team-name-input__field[readonly] {
    opacity: 0.7;
  }

  .team-name-input__field:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 0;
  }

  .team-name-input__count {
    flex: none;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  }

  .team-name-input__error {
    flex-basis: 100%;
    font-size: 0.75rem;
    color: rgb(var(--v-theme-error));
  }
</style>
```

- [ ] **Step 5: 트리 컴포넌트**

`packages/admin-ui/src/components/team/TeamTree.vue`:

```vue
<script setup lang="ts">
  import { computed, nextTick, ref, shallowRef, watch } from 'vue'
  import {
    VAlert,
    VBtn,
    VList,
    VListItem,
    VMenu,
    VProgressLinear,
    VTextField,
  } from 'vuetify/components'
  import { Draggable } from '@he-tree/vue'
  import {
    filterTeamTree,
    findTeamPlacement,
    flattenTeamTree,
    moveTargets,
    siblingMove,
    sortTeamTree,
    type AdminTeamMove,
    type AdminTeamNode,
    type TeamPlacement,
  } from '@ssworks/admin-shared'
  import PanelLayout from '../ui/PanelLayout.vue'
  import TeamNameInput from './TeamNameInput.vue'
  import {
    DEFAULT_TEAM_TREE_MESSAGES,
    HE_TREE_I18N,
    type TeamAction,
    type TeamCommitSource,
    type TeamEdit,
    type TeamEditTarget,
    type TeamMoveSource,
    type TeamTreeMessages,
  } from './team-tree.js'

  // 팀 트리 — 표시와 이벤트만. 서버를 모른다(조회 · 쓰기 · 확인은 `useTeamTree`).
  //
  // 정본: hangang-home apps/admin/src/components/org/TeamTree.vue(emit 전용 · 두 겹 잠금 · 선택은 읽기 · 부모 포함 검색)
  //       + ssworks-axion-admin packages/frontend/src/components/team/TeamTree.vue · TeamTreeNode.vue(he-tree 드래그 ·
  //       드롭 시점 좌표 · 편집 중 검색 끔 · 입력칸 `@keydown.stop`)
  // 바꾼 점:
  //  - VList 평탄화 대신 he-tree `Draggable` 로 그린다(3d ① R1) — 접기 · 펼치기와 `role="tree"` · `aria-level` 이 따라온다.
  //    드래그는 `draggable` 로 켠다(기본 꺼짐 = hangang 동작: ↑↓ 버튼, 형제 순서만).
  //  - 만들기 · 이름 바꾸기는 노드 안 입력칸(3d ⑦). 입력칸 상태(`edit`)는 부모가 가진다.
  //  - 행마다 ↑↓ + ⋮ 메뉴(하위 팀 추가 · 이름 바꾸기 · 옮기기 · 삭제). 접근 이름에 팀 이름을 넣는다 — hangang 은 모든
  //    행의 버튼이 같은 라벨이었다. `data-team-*` 속성을 버렸다(테스트는 접근 이름 · `aria-level` 로 찾는다).
  //  - 첫째의 ↑ · 막내의 ↓ 는 비활성(hangang 은 눌러도 아무 일이 없었다).
  //
  // 🔴 이 컴포넌트는 서버를 안 부른다. 잠금은 화면이 버튼을 못 누르게 하는 선까지이고, 요청의 성공 · 실패 · 재조회는
  //    전부 부르는 쪽이 진다(hangang).
  // 🔴 `nodes` 를 고치지 않는다. he-tree 는 끌어 놓을 때 받은 배열을 제자리에서 바꾼다 — 정렬한 내부 사본을 넘기고,
  //    원위치는 사본을 `nodes` 에서 다시 만드는 것이다(스펙 D2).

  const props = withDefaults(
    defineProps<{
      nodes: readonly AdminTeamNode[]
      canWrite?: boolean
      busy?: boolean
      loading?: boolean
      loadFailed?: boolean
      draggable?: boolean
      /** 최상위 사이에 놓기 · 최상위 초안 행 */
      topLevel?: boolean
      /** 메서드 꼴(bivariant). 기본은 모두 허용 */
      canAct?(node: AdminTeamNode, action: TeamAction): boolean
      edit?: TeamEdit | null
      /** 바뀌면 내부 사본을 `nodes` 에서 다시 만든다 — 드래그 원위치 신호 */
      resetKey?: number
      messages?: Partial<TeamTreeMessages>
    }>(),
    {
      // 🔴 권한 가드 fail-closed 규약 — 바인딩 없이 쓰면 잠겨 있다
      canWrite: false,
      busy: false,
      loading: false,
      loadFailed: false,
      draggable: false,
      topLevel: false,
      edit: null,
      resetKey: 0,
      messages: () => ({}),
    },
  )

  const selected = defineModel<bigint | null>({ default: null })

  const emit = defineEmits<{
    move: [move: AdminTeamMove, source: TeamMoveSource]
    reparent: [teamNo: bigint]
    remove: [teamNo: bigint]
    'edit-start': [target: TeamEditTarget]
    'edit-input': [name: string]
    'edit-commit': [source: TeamCommitSource]
    'edit-cancel': []
    reload: []
  }>()

  defineSlots<{
    badge?(props: { node: AdminTeamNode }): unknown
  }>()

  const text = computed<TeamTreeMessages>(() => ({
    ...DEFAULT_TEAM_TREE_MESSAGES,
    ...props.messages,
  }))
  const inputLabels = computed(() => ({
    input: text.value.nameInput,
    save: text.value.save,
    cancel: text.value.cancel,
  }))

  // ── 판정 ──────────────────────────────────────────────────────────

  const allowed = (node: AdminTeamNode, action: TeamAction): boolean =>
    props.canAct?.(node, action) ?? true
  /** 🔴 쓰기 잠금 — 버튼의 `:disabled` 와 핸들러 첫 줄이 같이 본다(hangang 두 겹 방어 — `:disabled` 는 마우스만 막는다) */
  const locked = computed(() => !props.canWrite || props.busy || props.edit != null)
  const query = ref<string | null>('')
  const searchText = computed(() => (query.value ?? '').trim())
  /** 🔴 검색 중에는 순서를 못 바꾼다 — 걸러진 화면에서 숨은 형제와 자리가 바뀐다(스펙 D9) */
  const moveLocked = computed(() => locked.value || searchText.value !== '')
  const dragOn = computed(() => props.draggable && !moveLocked.value)
  /** 형제 경계 — ↑↓ 비활성 판정 */
  const rowByNo = computed(
    () => new Map(flattenTeamTree(props.nodes).map((row) => [row.teamNo, row])),
  )

  function hasSibling(node: AdminTeamNode, direction: 'up' | 'down'): boolean {
    const row = rowByNo.value.get(node.teamNo)
    return direction === 'up' ? row?.prevSiblingTeamNo != null : row?.nextSiblingTeamNo != null
  }

  function canReparent(node: AdminTeamNode): boolean {
    if (!allowed(node, 'move')) return false
    return (
      moveTargets(props.nodes, node.teamNo, {
        topLevel: props.topLevel,
        canReceive: (target) => allowed(target, 'addChild'),
      }).length > 0
    )
  }

  // ── 내부 사본 ─────────────────────────────────────────────────────

  interface TeamItem {
    team: AdminTeamNode
    children: TreeItem[]
  }
  interface DraftItem {
    draft: true
    children: TreeItem[]
  }
  type TreeItem = TeamItem | DraftItem
  /** he-tree 의 노드 상태 중 여기서 쓰는 것만 — `@he-tree/tree-utils` 의 `Stat` 을 들이지 않는다(스펙 D14) */
  interface HeStat {
    data: TreeItem
    parent: HeStat | null
    children: HeStat[]
    open: boolean
  }

  const isDraft = (item: TreeItem): item is DraftItem => 'draft' in item

  function buildItems(
    nodes: readonly AdminTeamNode[],
    draftParent: bigint | null | undefined,
  ): TreeItem[] {
    return nodes.map((team) => {
      const children = buildItems(team.children, draftParent)
      if (draftParent === team.teamNo) children.push({ draft: true, children: [] })
      return { team, children }
    })
  }

  function toNodes(items: readonly TreeItem[]): AdminTeamNode[] {
    return items.flatMap((item) =>
      isDraft(item) ? [] : [{ ...item.team, children: toNodes(item.children) }],
    )
  }

  const items = shallowRef<TreeItem[]>([])
  /** 🔴 접은 팀 번호 — he-tree 는 배열이 바뀌면 펼침을 처음으로 되돌린다. 재조회 · 원위치 뒤에도 접힌 채 두려고 여기서 기억한다(스펙 D3) */
  const closed = new Set<bigint>()
  const body = ref<HTMLElement | null>(null)
  /** 입력칸을 열 때 · 다시 그린 뒤 쓰던 사람에게 포커스를 돌려줄 때 */
  const focusInput = ref<false | 'select' | 'end'>(false)

  const editKey = computed(() => {
    const edit = props.edit
    if (edit == null) return ''
    return edit.kind === 'rename' ? `rename:${edit.teamNo}` : `create:${edit.parentTeamNo ?? 'top'}`
  })

  /**
   * 🔴 다시 그리는 동안의 포커스 빠짐은 바깥 누르기가 아니다 — 재조회로 입력칸이 새로 생기며 옛 칸이 문서에서 빠질 때
   *    blur 를 내는 환경이 있다. 그것을 저장으로 받으면 실패 문구를 보던 사람의 이름이 한 번 더 나간다.
   */
  let rebuilding = false

  function rebuild(): void {
    rebuilding = true
    const edit = props.edit
    const draftParent = edit?.kind === 'create' ? edit.parentTeamNo : undefined
    if (draftParent != null) closed.delete(draftParent)
    const base =
      searchText.value === ''
        ? sortTeamTree(props.nodes)
        : filterTeamTree(props.nodes, searchText.value)
    const next = buildItems(base, draftParent)
    if (draftParent === null) next.push({ draft: true, children: [] })
    items.value = next
    void nextTick(() => {
      rebuilding = false
    })
  }

  function onCommit(source: TeamCommitSource): void {
    if (source === 'blur' && rebuilding) return
    emit('edit-commit', source)
  }

  watch(
    () => [props.nodes, searchText.value, props.resetKey, editKey.value] as const,
    (current, previous) => {
      const key = current[3]
      if (key !== '' && key !== previous?.[3]) {
        focusInput.value = props.edit?.kind === 'rename' ? 'select' : 'end'
      } else if (
        body.value?.contains(document.activeElement) === true &&
        document.activeElement?.matches('input[name="teamName"]') === true
      ) {
        // 다시 그리면 입력칸이 새로 생길 수 있다 — 쓰던 사람의 포커스를 돌려준다
        focusInput.value = 'end'
      }
      rebuild()
    },
    { immediate: true },
  )

  function statHandler<S extends HeStat>(stat: S): S {
    const item = stat.data
    stat.open = isDraft(item) || searchText.value !== '' || !closed.has(item.team.teamNo)
    return stat
  }

  function remember(stat: HeStat): void {
    if (isDraft(stat.data) || searchText.value !== '') return
    if (stat.open) closed.delete(stat.data.team.teamNo)
    else closed.add(stat.data.team.teamNo)
  }

  function toggle(stat: HeStat): void {
    stat.open = !stat.open
    remember(stat)
  }

  const isRenaming = (item: TreeItem): boolean =>
    !isDraft(item) && props.edit?.kind === 'rename' && props.edit.teamNo === item.team.teamNo

  // ── 이벤트 ────────────────────────────────────────────────────────

  function onClickNode(stat: HeStat): void {
    // 선택은 읽기 동작이다 — canWrite · busy 로 막지 않는다(hangang)
    if (isDraft(stat.data)) return
    selected.value = stat.data.team.teamNo
  }

  function onMove(node: AdminTeamNode, direction: 'up' | 'down'): void {
    if (moveLocked.value || !allowed(node, 'move')) return
    const move = siblingMove(props.nodes, node.teamNo, direction)
    if (move != null) emit('move', move, 'button')
  }

  function onAddChild(node: AdminTeamNode): void {
    if (locked.value || !allowed(node, 'addChild')) return
    emit('edit-start', { kind: 'create', parentTeamNo: node.teamNo })
  }

  function onRename(node: AdminTeamNode): void {
    if (locked.value || !allowed(node, 'rename')) return
    emit('edit-start', { kind: 'rename', teamNo: node.teamNo })
  }

  function onReparent(node: AdminTeamNode): void {
    if (locked.value || !canReparent(node)) return
    emit('reparent', node.teamNo)
  }

  function onRemove(node: AdminTeamNode): void {
    if (locked.value || !allowed(node, 'remove')) return
    emit('remove', node.teamNo)
  }

  // ── 드래그 ────────────────────────────────────────────────────────

  let dragging: ({ teamNo: bigint } & TeamPlacement) | null = null

  function onBeforeDragStart(stat: HeStat): void {
    if (isDraft(stat.data)) return
    const teamNo = stat.data.team.teamNo
    const from = findTeamPlacement(toNodes(items.value), teamNo)
    dragging = from == null ? null : { teamNo, ...from }
  }

  const eachDraggable = (stat: HeStat): boolean =>
    !isDraft(stat.data) && allowed(stat.data.team, 'move')

  /** 그 팀 아래로 넣을 수 있는가 — 같은 상위 팀 안의 순서 바꾸기는 하위 팀 추가 허용과 무관하다 */
  const eachDroppable = (stat: HeStat): boolean => {
    if (isDraft(stat.data)) return false
    if (dragging != null && stat.data.team.teamNo === dragging.parentTeamNo) return true
    return allowed(stat.data.team, 'addChild')
  }

  const rootDroppable = (): boolean => props.topLevel || dragging?.parentTeamNo === null

  function onChange(): void {
    const from = dragging
    dragging = null
    if (from == null) return
    const to = findTeamPlacement(toNodes(items.value), from.teamNo)
    if (to == null) return
    // 🔴 제자리면 아무것도 내지 않는다 — axion 은 `after-drop` 을 써서 제자리 드롭에도 확인창을 띄웠다(스펙 D8)
    if (to.parentTeamNo === from.parentTeamNo && to.beforeTeamNo === from.beforeTeamNo) return
    emit('move', { teamNo: from.teamNo, ...to }, 'drag')
  }

  /** 🔴 he-tree 의 Alt+화살표 이동은 확인과 "못 옮기는 팀" 잠금을 건너뛴다 — 캡처 단계에서 가로챈다(스펙 D7) */
  function onKeydownCapture(event: KeyboardEvent): void {
    if (!event.altKey || !event.key.startsWith('Arrow')) return
    if ((event.target as HTMLElement | null)?.closest('input') != null) return
    event.preventDefault()
    event.stopPropagation()
  }
</script>

<template>
  <PanelLayout class="team-tree" scrollable>
    <template #top>
      <div class="team-tree__top">
        <VTextField
          v-model="query"
          autocomplete="off"
          clearable
          density="compact"
          hide-details
          :label="text.searchLabel"
          name="teamSearch"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
        />
      </div>
      <VProgressLinear v-if="loading" color="primary" indeterminate />
      <VAlert
        v-if="loadFailed && nodes.length > 0"
        class="team-tree__alert"
        density="compact"
        type="error"
        variant="tonal"
      >
        {{ text.loadFailed }}
        <template #append>
          <VBtn size="small" variant="text" @click="emit('reload')">{{ text.retry }}</VBtn>
        </template>
      </VAlert>
    </template>

    <div ref="body" class="team-tree__body" @keydown.capture="onKeydownCapture">
      <div v-if="loadFailed && nodes.length === 0" class="team-tree__empty" role="alert">
        <span>{{ text.loadFailed }}</span>
        <VBtn size="small" variant="text" @click="emit('reload')">{{ text.retry }}</VBtn>
      </div>
      <div v-else-if="items.length === 0 && !loading" class="team-tree__empty">
        {{ searchText === '' ? text.empty : text.noResult }}
      </div>
      <Draggable
        v-else
        :aria-label="text.treeLabel"
        :disable-drag="!dragOn"
        :disable-drop="!dragOn"
        :each-draggable="eachDraggable"
        :each-droppable="eachDroppable"
        :i18n="HE_TREE_I18N"
        :indent="20"
        :model-value="items"
        :root-droppable="rootDroppable"
        :stat-handler="statHandler"
        tree-line
        :tree-line-offset="10"
        @before-drag-start="onBeforeDragStart"
        @change="onChange"
        @click:node="onClickNode"
        @close:node="remember"
        @open:node="remember"
      >
        <template #default="{ node: item, stat }">
          <div v-if="isDraft(item)" class="team-tree__row team-tree__row--draft">
            <span class="team-tree__gap" />
            <TeamNameInput
              v-if="edit"
              :error="edit.error"
              :focus="focusInput"
              :labels="inputLabels"
              :name="edit.name"
              :pending="edit.pending"
              @cancel="emit('edit-cancel')"
              @commit="onCommit"
              @focused="focusInput = false"
              @input="emit('edit-input', $event)"
            />
          </div>
          <div
            v-else
            class="team-tree__row"
            :class="{ 'team-tree__row--selected': item.team.teamNo === selected }"
          >
            <button
              v-if="stat.children.length > 0"
              :aria-expanded="stat.open"
              :aria-label="text.toggle(item.team.teamName, stat.open)"
              class="team-tree__toggle"
              tabindex="-1"
              type="button"
              @click.stop="toggle(stat)"
            >
              <span aria-hidden="true">{{ stat.open ? '▾' : '▸' }}</span>
            </button>
            <span v-else class="team-tree__gap" />
            <TeamNameInput
              v-if="edit && isRenaming(item)"
              :error="edit.error"
              :focus="focusInput"
              :labels="inputLabels"
              :name="edit.name"
              :pending="edit.pending"
              @cancel="emit('edit-cancel')"
              @commit="onCommit"
              @focused="focusInput = false"
              @input="emit('edit-input', $event)"
            />
            <template v-else>
              <span class="team-tree__name">{{ item.team.teamName }}</span>
              <slot name="badge" :node="item.team" />
              <!-- 🔴 버튼의 클릭 · 키는 트리로 올리지 않는다 — 누른 버튼이 선택까지 바꾸면 두 가지 일을 한 것으로 읽히고(hangang),
                   he-tree 루트가 Enter · Space 를 가로채면 버튼이 키보드로 안 눌린다(스펙 D6) -->
              <span class="team-tree__acts" @click.stop @keydown.stop>
                <VBtn
                  :aria-label="text.up(item.team.teamName)"
                  :disabled="
                    moveLocked || !allowed(item.team, 'move') || !hasSibling(item.team, 'up')
                  "
                  icon="mdi-arrow-up"
                  size="x-small"
                  variant="text"
                  @click="onMove(item.team, 'up')"
                />
                <VBtn
                  :aria-label="text.down(item.team.teamName)"
                  :disabled="
                    moveLocked || !allowed(item.team, 'move') || !hasSibling(item.team, 'down')
                  "
                  icon="mdi-arrow-down"
                  size="x-small"
                  variant="text"
                  @click="onMove(item.team, 'down')"
                />
                <VMenu location="bottom end">
                  <template #activator="{ props: activator }">
                    <VBtn
                      v-bind="activator"
                      :aria-label="text.menu(item.team.teamName)"
                      :disabled="locked"
                      icon="mdi-dots-vertical"
                      size="x-small"
                      variant="text"
                    />
                  </template>
                  <VList density="compact">
                    <VListItem
                      :disabled="!allowed(item.team, 'addChild')"
                      :title="text.addChild"
                      @click="onAddChild(item.team)"
                    />
                    <VListItem
                      :disabled="!allowed(item.team, 'rename')"
                      :title="text.rename"
                      @click="onRename(item.team)"
                    />
                    <VListItem
                      :disabled="!canReparent(item.team)"
                      :title="text.reparent"
                      @click="onReparent(item.team)"
                    />
                    <VListItem
                      base-color="error"
                      :disabled="!allowed(item.team, 'remove')"
                      :title="text.remove"
                      @click="onRemove(item.team)"
                    />
                  </VList>
                </VMenu>
              </span>
            </template>
          </div>
        </template>
      </Draggable>
    </div>
  </PanelLayout>
</template>

<style scoped>
  .team-tree__top {
    padding: 12px 12px 8px;
  }

  .team-tree__alert {
    margin: 0 12px 8px;
  }

  .team-tree__body {
    padding: 4px 0 12px;
  }

  .team-tree__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 32px 16px;
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  }

  .team-tree__row {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 36px;
    padding-right: 8px;
    border-radius: 4px;
  }

  .team-tree__row--selected {
    background: rgba(var(--v-theme-primary), 0.12);
  }

  .team-tree__row--selected .team-tree__name {
    font-weight: 600;
    color: rgb(var(--v-theme-primary));
  }

  .team-tree__toggle,
  .team-tree__gap {
    flex: none;
    width: 22px;
    height: 22px;
  }

  .team-tree__toggle {
    padding: 0;
    color: inherit;
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: 4px;
  }

  .team-tree__name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .team-tree__acts {
    display: flex;
    flex: none;
    gap: 2px;
    margin-left: auto;
  }

  /* he-tree 기본 CSS 중 필요한 것 — 소비자가 he-tree CSS 를 import 하지 않게 여기로 옮겼다(스펙 D15). 색은 Vuetify 토큰. */
  .team-tree__body :deep(.tree-node--with-tree-line) {
    position: relative;
  }

  .team-tree__body :deep(.tree-line) {
    position: absolute;
    background-color: rgba(var(--v-border-color), var(--v-border-opacity));
  }

  .team-tree__body :deep(.tree-vline) {
    top: 0;
    bottom: 0;
    width: 1px;
  }

  .team-tree__body :deep(.tree-hline) {
    top: 50%;
    width: 10px;
    height: 1px;
  }

  .team-tree__body :deep(.tree-node:focus-visible) {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
  }

  .team-tree__body :deep(.he-tree-drag-placeholder) {
    width: 100%;
    height: 32px;
    background: rgba(var(--v-theme-primary), 0.08);
    border: 1px dashed rgb(var(--v-theme-primary));
  }

  .team-tree__body :deep(.sr-only) {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  @media (forced-colors: active) {
    .team-tree__body :deep(.tree-node:focus-visible) {
      outline-color: Highlight;
    }

    .team-tree__body :deep(.tree-line) {
      background-color: CanvasText;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .team-tree__body :deep(.he-tree),
    .team-tree__body :deep(.he-tree *) {
      transition: none !important;
    }
  }
</style>
```

he-tree 의 선언(`vue-demi` 기반 `DefineComponent`) 때문에 vue-tsc 가 템플릿의 `Draggable` props 를 거부하면, `<script setup>` 에서 `const HeTree = Draggable as unknown as Component`(`import type { Component } from 'vue'`)로 감싸 템플릿에서 `<HeTree>` 를 쓴다. 다른 우회(`// @ts-ignore` 등)는 쓰지 않는다. 그렇게 했으면 보고에 적는다.

- [ ] **Step 6: 내보내기**

`packages/admin-ui/src/index.ts` 끝(`PasswordChangeForm` 줄 다음)에 덧붙인다:

```ts
// ── 조직 ──────────────────────────────────────────────────────────────
export { default as TeamTree } from './components/team/TeamTree.vue'
export {
  type TeamAction,
  type TeamEdit,
  type TeamEditTarget,
  type TeamCommitSource,
  type TeamMoveSource,
  type TeamTreeMessages,
} from './components/team/team-tree.js'
```

- [ ] **Step 7: 통과 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/components/team/team-tree.render.test.ts`
Expected: 38 passed.

Run: `pnpm --filter @ssworks/admin-ui typecheck && pnpm --filter @ssworks/admin-ui test`
Expected: 오류 없음, 전부 통과(`peer-deps.test.ts` 가 이제 `@he-tree/vue` import 를 보고 필수 peer 인지 확인한다).

he-tree 의 실제 동작이 이 테스트와 다르면(예: `click:node` 이벤트 이름, `statsFlat` 위치, `open:node` · `close:node` 가 없음) 테스트 쪽 기대를 바꾸지 말고 원인을 보고에 적는다 — Task 1 계약 테스트에 그 사실을 더하는 것이 먼저다.

- [ ] **Step 8: 커밋**

```bash
pnpm exec eslint --fix packages/admin-ui/src/components/team packages/admin-ui/src/index.ts
pnpm exec prettier --write packages/admin-ui/src/components/team packages/admin-ui/src/index.ts
git add packages/admin-ui/src/components/team packages/admin-ui/src/index.ts
git commit -m "feat(admin-ui): TeamTree — he-tree 위 팀 트리 · 노드 안 입력칸 · 드래그 옵션

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: `TeamMoveDialog`

**Files:**

- Create: `packages/admin-ui/src/components/team/TeamMoveDialog.vue`
- Create: `packages/admin-ui/src/components/team/team-move-dialog.render.test.ts`
- Modify: `packages/admin-ui/src/index.ts` ("── 조직 ──" 절 끝에 한 줄)

**Interfaces:**

- Consumes: Task 3 의 `TeamMoveTarget`(`moveTargets()` 결과), 킷 `BaseDialog`.
- Produces: props `modelValue: boolean` · `teamName: string` · `targets: readonly TeamMoveTarget[]` · `submitting?: boolean`, 이벤트 `update:modelValue(open)` · `confirm(parentTeamNo: bigint | null)`.

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-ui/src/components/team/team-move-dialog.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import type { Component } from 'vue'
import { VAutocomplete, VDialog } from 'vuetify/components'
import { moveTargets, type AdminTeamNode } from '@ssworks/admin-shared'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import TeamMoveDialog from './TeamMoveDialog.vue'

installVisualViewport()

const n = (
  teamNo: number,
  teamName: string,
  displayOrder: number,
  children: AdminTeamNode[] = [],
): AdminTeamNode => ({ teamNo: BigInt(teamNo), teamName, displayOrder, children })

const TREE = (): AdminTeamNode[] => [
  n(1, '한강투자그룹', 0, [
    n(3, '관리본부', 5, [n(7, '인사팀', 0)]),
    n(2, '영업본부', 0, [n(6, '분당지점', 9), n(4, '강남지점', 0), n(5, '판교지점', 5)]),
  ]),
]

interface Option {
  key: string
  title: string
  teamName: string | null
}

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

async function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(TeamMoveDialog as Component, {
    attachTo: document.body,
    props: { modelValue: true, teamName: '판교지점', targets: moveTargets(TREE(), 5n), ...props },
    global: { plugins: [vuetify] },
  })
  await flushPromises()
  return wrapper
}

const dialog = () => document.querySelector<HTMLElement>('.v-overlay--active') ?? document.body
const autocomplete = () => wrapper!.findComponent(VAutocomplete)

async function choose(key: string) {
  autocomplete().vm.$emit('update:modelValue', key)
  await flushPromises()
}

describe('TeamMoveDialog', () => {
  it('제목 · 문구 · 선택지(조직도 순서 · 들여쓰기)', async () => {
    await setup()
    expect(dialog().textContent).toContain('「판교지점」 옮기기')
    expect(dialog().textContent).toContain(
      '고른 팀 아래 맨 끝으로 옮깁니다. 하위 팀과 소속 인원이 함께 옮겨집니다.',
    )
    expect((autocomplete().props('items') as Option[]).map((o) => o.title)).toEqual([
      '한강투자그룹',
      '　└ 강남지점',
      '　└ 분당지점',
      '└ 관리본부',
      '　└ 인사팀',
    ])
  })

  it('고르기 전엔 옮기기가 비활성이고, 고르면 confirm(번호)', async () => {
    await setup()
    expect(buttonByText('옮기기', dialog())!.disabled).toBe(true)
    await choose('3')
    expect(buttonByText('옮기기', dialog())!.disabled).toBe(false)
    buttonByText('옮기기', dialog())!.click()
    expect(wrapper!.emitted('confirm')).toEqual([[3n]])
  })

  it('🔴 최상위는 null 로 나간다 — Vuetify 선택 상자에는 내부 키로 넘긴다', async () => {
    await setup({ targets: moveTargets(TREE(), 5n, { topLevel: true }) })
    expect((autocomplete().props('items') as Option[])[0]!.title).toBe('최상위')
    await choose('top')
    buttonByText('옮기기', dialog())!.click()
    expect(wrapper!.emitted('confirm')).toEqual([[null]])
  })

  it('들여쓰기 글자가 아니라 원래 이름으로 찾는다', async () => {
    await setup({ targets: moveTargets(TREE(), 5n, { topLevel: true }) })
    const filter = autocomplete().props('customFilter') as (
      value: string,
      query: string,
      item?: { raw: Option },
    ) => boolean
    const items = autocomplete().props('items') as Option[]
    const hr = items.find((o) => o.teamName === '인사팀')!
    expect(filter('', '인사', { raw: hr })).toBe(true)
    expect(filter('', '└', { raw: hr })).toBe(false)
    expect(filter('', '최상', { raw: items[0]! })).toBe(true)
  })

  it('🔴 다시 열면 고른 값이 비워진다(지연 마운트)', async () => {
    await setup()
    await choose('3')
    await wrapper!.setProps({ modelValue: false })
    await wrapper!.setProps({ modelValue: true })
    await flushPromises()
    expect(autocomplete().props('modelValue')).toBeNull()
  })

  it('제출 중엔 취소 · 옮기기 · 선택 상자가 잠긴다', async () => {
    await setup()
    await choose('3')
    await wrapper!.setProps({ submitting: true })
    expect(buttonByText('취소', dialog())!.disabled).toBe(true)
    expect(buttonByText('옮기기', dialog())!.disabled).toBe(true)
    expect(autocomplete().props('disabled')).toBe(true)
  })

  it('바깥 누르기 · Esc 로 닫히지 않는다(persistent), 취소로 닫는다', async () => {
    await setup()
    expect(wrapper!.findComponent(VDialog).props('persistent')).toBe(true)
    buttonByText('취소', dialog())!.click()
    expect(wrapper!.emitted('update:modelValue')).toEqual([[false]])
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/components/team/team-move-dialog.render.test.ts`
Expected: FAIL — `Failed to resolve import "./TeamMoveDialog.vue"`.

- [ ] **Step 3: 구현**

`packages/admin-ui/src/components/team/TeamMoveDialog.vue`:

```vue
<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { VAutocomplete, VBtn } from 'vuetify/components'
  import type { TeamMoveTarget } from '@ssworks/admin-shared'
  import BaseDialog from '../common/BaseDialog.vue'

  // 옮기기 대화상자 — 새 상위 팀을 고르면 그 아래 맨 끝으로 간다(3d ② P2). 자리는 ↑↓ 로 고친다.
  //
  // 정본: hangang-home apps/admin/src/pages/org/teams.vue 생성 대화상자의 상위 팀 고르기(들여쓴 조직도 순서 · 값 수동 초기화)
  // 바꾼 점:
  //  - "옮기기" 전용. 선택지는 부르는 쪽이 `moveTargets()` 로 만든다(자기 · 하위 팀 · 지금 상위 팀이 빠진 목록).
  //  - 팀이 많아도 고르게 이름 검색(VAutocomplete). 들여쓴 제목으로 보이고 원래 이름으로 찾는다.
  //
  // 🔴 최상위 선택지는 `null` 대신 내부 키로 구분한다 — Vuetify 선택 상자는 `null` 을 "고르지 않음"으로 본다.
  // 🔴 열릴 때마다 고른 값을 비운다 — VDialog 는 지연 마운트라 setup 상태가 다음 열림에 남는다(hangang).

  const props = withDefaults(
    defineProps<{
      teamName: string
      targets: readonly TeamMoveTarget[]
      submitting?: boolean
    }>(),
    { submitting: false },
  )

  const open = defineModel<boolean>({ default: false })

  const emit = defineEmits<{
    confirm: [parentTeamNo: bigint | null]
  }>()

  interface Option {
    key: string
    title: string
    teamName: string | null
    parentTeamNo: bigint | null
  }

  const TOP_KEY = 'top'

  const options = computed<Option[]>(() =>
    props.targets.map((target) => ({
      key: target.parentTeamNo == null ? TOP_KEY : String(target.parentTeamNo),
      title: target.title,
      teamName: target.teamName,
      parentTeamNo: target.parentTeamNo,
    })),
  )

  const choice = ref<string | null>(null)
  const chosen = computed(() => options.value.find((option) => option.key === choice.value) ?? null)

  watch(open, (value) => {
    if (value) choice.value = null
  })

  /** 들여쓴 제목(U+3000 · └)이 아니라 원래 이름으로 찾는다 */
  function filter(_value: string, query: string, item?: { raw: Option }): boolean {
    const needle = query.trim().toLowerCase()
    if (needle === '') return true
    const raw = item?.raw
    return (raw?.teamName ?? raw?.title ?? '').toLowerCase().includes(needle)
  }

  function onConfirm(): void {
    if (props.submitting || chosen.value == null) return
    emit('confirm', chosen.value.parentTeamNo)
  }

  function onCancel(): void {
    if (props.submitting) return
    open.value = false
  }
</script>

<template>
  <BaseDialog
    v-model="open"
    :closable="false"
    :max-width="480"
    :title="`「${teamName}」 옮기기`"
    type="none"
  >
    <p class="team-move-dialog__message">
      고른 팀 아래 맨 끝으로 옮깁니다. 하위 팀과 소속 인원이 함께 옮겨집니다.
    </p>
    <VAutocomplete
      v-model="choice"
      autocomplete="off"
      :custom-filter="filter"
      density="compact"
      :disabled="submitting"
      item-title="title"
      item-value="key"
      :items="options"
      label="새 상위 팀"
      name="parentTeamNo"
      no-data-text="맞는 팀이 없습니다."
      variant="outlined"
    />
    <template #actions>
      <VBtn :disabled="submitting" variant="text" @click="onCancel">취소</VBtn>
      <VBtn
        color="primary"
        :disabled="submitting || chosen == null"
        :loading="submitting"
        @click="onConfirm"
      >
        옮기기
      </VBtn>
    </template>
  </BaseDialog>
</template>

<style scoped>
  .team-move-dialog__message {
    margin-bottom: 16px;
  }
</style>
```

`packages/admin-ui/src/index.ts` 의 "── 조직 ──" 절, `TeamTree` 줄 다음에 넣는다:

```ts
export { default as TeamMoveDialog } from './components/team/TeamMoveDialog.vue'
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/components/team/team-move-dialog.render.test.ts`
Expected: 7 passed.

Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: 오류 없음.

- [ ] **Step 5: 커밋**

```bash
pnpm exec eslint --fix packages/admin-ui/src/components/team/TeamMoveDialog.vue packages/admin-ui/src/components/team/team-move-dialog.render.test.ts packages/admin-ui/src/index.ts
pnpm exec prettier --write packages/admin-ui/src/components/team/TeamMoveDialog.vue packages/admin-ui/src/components/team/team-move-dialog.render.test.ts packages/admin-ui/src/index.ts
git add packages/admin-ui/src/components/team/TeamMoveDialog.vue packages/admin-ui/src/components/team/team-move-dialog.render.test.ts packages/admin-ui/src/index.ts
git commit -m "feat(admin-ui): TeamMoveDialog — 새 상위 팀 아래 맨 끝으로 · 원래 이름으로 검색

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: `useTeamTree`

**Files:**

- Create: `packages/admin-ui/src/composables/useTeamTree.ts`
- Create: `packages/admin-ui/src/composables/useTeamTree.render.test.ts`
- Modify: `packages/admin-ui/src/index.ts` ("── 조직 ──" 절 끝)

**Interfaces:**

- Consumes: Task 3 의 `flattenTeamTree` · `moveTargets` · `TeamTreeRow` · `TeamMoveTarget`, Task 2 의 `AdminTeamNode` · `AdminTeamMove` · `AdminTeamCreate` · `AdminTeamRename` · `TEAM_NAME_MAX_LENGTH`, Task 4 의 `TeamAction` · `TeamEdit` · `TeamEditTarget` · `TeamCommitSource` · `TeamMoveSource`, Task 5 의 `TeamMoveDialog` props, 킷 `useWriteFlow` · `ConfirmDialogBindings` · `ApiError` · `toFieldErrors`.
- Produces: `useTeamTree(options: UseTeamTreeOptions): TeamTreeController`, 타입 `UseTeamTreeOptions` · `TeamTreeController` · `TeamTreeBindings` · `TeamMoveDialogBindings` · `TeamMessages` · `TeamDialogText` · `TeamDoneEvent` · `TeamDoneAction` (스펙 §4-4 그대로).

- [ ] **Step 1: 실패 테스트 작성**

`packages/admin-ui/src/composables/useTeamTree.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type Component } from 'vue'
import type { AdminTeamNode } from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import TeamMoveDialog from '../components/team/TeamMoveDialog.vue'
import TeamTree from '../components/team/TeamTree.vue'
import { buttonByText, installVisualViewport, vuetify } from '../test/setup.js'
import { useTeamTree, type TeamTreeController, type UseTeamTreeOptions } from './useTeamTree.js'

// 정본: hangang-home apps/admin/src/pages/org/teams.render.test.ts(쓰기 넷 · 실패해도 재조회 · 삭제 뒤 선택 해제 ·
//       재인증 없음)를 실제 TeamTree · ConfirmDialog · TeamMoveDialog 에 붙여 잰다. 3열 사용자 폼 쪽은 템플릿 몫이라 없다.

installVisualViewport()

const n = (
  teamNo: number,
  teamName: string,
  displayOrder: number,
  children: AdminTeamNode[] = [],
): AdminTeamNode => ({ teamNo: BigInt(teamNo), teamName, displayOrder, children })

const TREE = (): AdminTeamNode[] => [
  n(1, '한강투자그룹', 0, [
    n(3, '관리본부', 5, [n(7, '인사팀', 0)]),
    n(2, '영업본부', 0, [n(6, '분당지점', 9), n(4, '강남지점', 0), n(5, '판교지점', 5)]),
  ]),
]
/** 영업본부 서브트리가 사라진 트리 */
const WITHOUT_SALES = (): AdminTeamNode[] => [
  n(1, '한강투자그룹', 0, [n(3, '관리본부', 5, [n(7, '인사팀', 0)])]),
]

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

async function setup(options: Partial<UseTeamTreeOptions> = {}) {
  wrapper?.unmount()
  let teams!: TeamTreeController
  wrapper = mount(
    defineComponent({
      setup() {
        teams = useTeamTree({ load: vi.fn(async () => TREE()), ...options })
        return () =>
          h('div', [
            h(TeamTree as Component, teams.tree.value),
            h(TeamMoveDialog as Component, teams.moveDialog.value),
            h(ConfirmDialog as Component, teams.confirmDialog.value),
          ])
      },
    }),
    { attachTo: document.body, global: { plugins: [vuetify] } },
  )
  await flushPromises()
  return teams
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const apiError = (message: string, code: string, status: number, details?: unknown) =>
  new ApiError(message, { status, code, details, raw: null })

const activeDialog = () =>
  document.querySelector<HTMLElement>('.v-overlay--active') ?? document.body
const button = (label: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)

async function clickInDialog(text: string) {
  const target = buttonByText(text, activeDialog())
  expect(target, `가드 — 다이얼로그에 "${text}" 버튼이 있다`).toBeTruthy()
  target!.click()
  await flushPromises()
}

const node = (teams: TeamTreeController, teamNo: bigint) => {
  const walk = (list: readonly AdminTeamNode[]): AdminTeamNode | undefined =>
    list.reduce<AdminTeamNode | undefined>(
      (found, item) => found ?? (item.teamNo === teamNo ? item : walk(item.children)),
      undefined,
    )
  return walk(teams.nodes.value)!
}

describe('useTeamTree — 조회', () => {
  it('처음에 불러와 트리에 넘긴다', async () => {
    const load = vi.fn(async () => TREE())
    const teams = await setup({ load })
    expect(load).toHaveBeenCalledTimes(1)
    expect(teams.tree.value.nodes).toEqual(TREE())
    expect(teams.rows.value.map((r) => r.teamName)).toEqual([
      '한강투자그룹',
      '영업본부',
      '강남지점',
      '판교지점',
      '분당지점',
      '관리본부',
      '인사팀',
    ])
    expect(teams.loading.value).toBe(false)
  })

  it('immediate: false 면 부르지 않는다', async () => {
    const load = vi.fn(async () => TREE())
    await setup({ load, immediate: false })
    expect(load).not.toHaveBeenCalled()
  })

  it('🔴 늦게 온 옛 응답은 버린다', async () => {
    const first = deferred<AdminTeamNode[]>()
    const load = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(WITHOUT_SALES())
    const teams = await setup({ load })
    await teams.reload()
    first.resolve(TREE())
    await flushPromises()
    expect(teams.nodes.value).toEqual(WITHOUT_SALES())
  })

  it('재조회가 실패해도 트리는 남고 loadFailed 가 켜진다', async () => {
    const load = vi.fn().mockResolvedValueOnce(TREE()).mockRejectedValueOnce(new Error('네트워크'))
    const teams = await setup({ load })
    await teams.reload()
    expect(teams.nodes.value).toEqual(TREE())
    expect(teams.tree.value.loadFailed).toBe(true)
    expect(teams.loadError.value).toBeInstanceOf(Error)
  })

  it('selectedRow 는 고른 팀의 행이다', async () => {
    const teams = await setup()
    teams.selected.value = 5n
    expect(teams.selectedRow.value?.teamName).toBe('판교지점')
  })

  it('고른 팀이 재조회 뒤 없으면 선택을 해제한다(D13)', async () => {
    const load = vi.fn().mockResolvedValueOnce(TREE()).mockResolvedValueOnce(WITHOUT_SALES())
    const teams = await setup({ load })
    teams.selected.value = 5n
    await teams.reload()
    expect(teams.selected.value).toBeNull()
    expect(teams.selectedRow.value).toBeNull()
  })

  it('입력칸 대상이 재조회 뒤 없으면 입력칸을 닫는다', async () => {
    const load = vi.fn().mockResolvedValueOnce(TREE()).mockResolvedValueOnce(WITHOUT_SALES())
    const teams = await setup({ load, rename: vi.fn() })
    teams.tree.value.onEditStart({ kind: 'rename', teamNo: 5n })
    expect(teams.tree.value.edit).not.toBeNull()
    await teams.reload()
    expect(teams.tree.value.edit).toBeNull()
  })
})

describe('useTeamTree — 판정', () => {
  it('어댑터를 주지 않은 동작은 생기지 않는다(D12)', async () => {
    const teams = await setup({ rename: vi.fn() })
    const pangyo = node(teams, 5n)
    expect(teams.tree.value.canAct(pangyo, 'rename')).toBe(true)
    expect(teams.tree.value.canAct(pangyo, 'move')).toBe(false)
    expect(teams.tree.value.canAct(pangyo, 'remove')).toBe(false)
    expect(teams.tree.value.canAct(pangyo, 'addChild')).toBe(false)
    expect(button('「판교지점」 위로')!.disabled).toBe(true)
  })

  it('소비자 canAct 를 함께 본다', async () => {
    const teams = await setup({ move: vi.fn(), canAct: (team) => team.teamNo !== 5n })
    expect(teams.tree.value.canAct(node(teams, 5n), 'move')).toBe(false)
    expect(teams.tree.value.canAct(node(teams, 4n), 'move')).toBe(true)
  })

  it('🔴 canWrite 는 부를 때마다 평가한다 — 비반응 플래그도 따른다', async () => {
    let allowed = true
    const move = vi.fn(async () => {})
    const teams = await setup({ move, rename: vi.fn(), canWrite: () => allowed })
    allowed = false
    teams.tree.value.onMove({ teamNo: 5n, parentTeamNo: 2n, beforeTeamNo: 4n }, 'button')
    teams.tree.value.onEditStart({ kind: 'rename', teamNo: 5n })
    await flushPromises()
    expect(move).not.toHaveBeenCalled()
    expect(teams.tree.value.edit).toBeNull()
  })
})

describe('useTeamTree — ↑↓ · 드래그', () => {
  it('↑↓ 는 확인 없이 요청 → 재조회 → onDone(move)', async () => {
    const load = vi.fn(async () => TREE())
    const move = vi.fn(async () => {})
    const onDone = vi.fn()
    await setup({ load, move, onDone })
    button('「판교지점」 위로')!.click()
    await flushPromises()
    expect(move).toHaveBeenCalledWith({ teamNo: 5n, parentTeamNo: 2n, beforeTeamNo: 4n })
    expect(load).toHaveBeenCalledTimes(2)
    expect(onDone).toHaveBeenCalledWith({
      action: 'move',
      teamNo: 5n,
      teamName: '판교지점',
      message: '「판교지점」의 순서를 바꿨습니다.',
    })
  })

  it('실패해도 재조회하고 onDone 은 없다', async () => {
    const load = vi.fn(async () => TREE())
    const move = vi.fn(async () => {
      throw apiError('잠금 경합', 'ERR_COMMON_CONFLICT', 409)
    })
    const onDone = vi.fn()
    await setup({ load, move, onDone })
    button('「판교지점」 위로')!.click()
    await flushPromises()
    expect(load).toHaveBeenCalledTimes(2)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('드래그 · 같은 상위 팀 — 확인 없이 요청', async () => {
    const move = vi.fn(async () => {})
    const onDone = vi.fn()
    const teams = await setup({ move, onDone })
    teams.tree.value.onMove({ teamNo: 6n, parentTeamNo: 2n, beforeTeamNo: 4n }, 'drag')
    await flushPromises()
    expect(document.querySelector('.v-overlay--active')).toBeNull()
    expect(move).toHaveBeenCalledWith({ teamNo: 6n, parentTeamNo: 2n, beforeTeamNo: 4n })
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ action: 'move', teamNo: 6n }))
  })

  it('드래그 · 다른 상위 팀 — 확인 문구 → 확인하면 요청 → onDone(reparent)', async () => {
    const move = vi.fn(async () => {})
    const onDone = vi.fn()
    const teams = await setup({ move, onDone })
    teams.tree.value.onMove({ teamNo: 5n, parentTeamNo: 3n, beforeTeamNo: null }, 'drag')
    await flushPromises()
    expect(activeDialog().textContent).toContain(
      '「판교지점」을(를) 「관리본부」 아래로 옮깁니다. 하위 팀과 소속 인원이 함께 옮겨집니다.',
    )
    expect(activeDialog().textContent).toContain('이 작업은 되돌릴 수 있습니다.')
    expect(move).not.toHaveBeenCalled()
    await clickInDialog('옮기기')
    expect(move).toHaveBeenCalledWith({ teamNo: 5n, parentTeamNo: 3n, beforeTeamNo: null })
    expect(onDone).toHaveBeenCalledWith({
      action: 'reparent',
      teamNo: 5n,
      teamName: '판교지점',
      message: '「판교지점」을(를) 「관리본부」 아래로 옮겼습니다.',
    })
  })

  it('🔴 확인을 취소하면 요청 · 재조회 없이 resetKey 만 오른다(원위치)', async () => {
    const load = vi.fn(async () => TREE())
    const move = vi.fn(async () => {})
    const teams = await setup({ load, move })
    const before = teams.tree.value.resetKey
    teams.tree.value.onMove({ teamNo: 5n, parentTeamNo: 3n, beforeTeamNo: null }, 'drag')
    await flushPromises()
    await clickInDialog('취소')
    expect(move).not.toHaveBeenCalled()
    expect(load).toHaveBeenCalledTimes(1)
    expect(teams.tree.value.resetKey).toBe(before + 1)
  })

  it('드래그가 실패하면 resetKey 가 오르고 재조회한다', async () => {
    const load = vi.fn(async () => TREE())
    const move = vi.fn(async () => {
      throw apiError('실패', 'ERR_COMMON_CONFLICT', 409)
    })
    const teams = await setup({ load, move })
    const before = teams.tree.value.resetKey
    teams.tree.value.onMove({ teamNo: 6n, parentTeamNo: 2n, beforeTeamNo: 4n }, 'drag')
    await flushPromises()
    expect(teams.tree.value.resetKey).toBe(before + 1)
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('useTeamTree — 옮기기 대화상자', () => {
  it('메뉴의 옮기기가 대화상자를 열고 선택지를 낸다', async () => {
    const teams = await setup({ move: vi.fn() })
    teams.tree.value.onReparent(5n)
    expect(teams.moveDialog.value.modelValue).toBe(true)
    expect(teams.moveDialog.value.teamName).toBe('판교지점')
    expect(teams.moveDialog.value.targets.map((t) => t.parentTeamNo)).toEqual([1n, 4n, 6n, 3n, 7n])
  })

  it('고르면 맨 끝으로 요청 → 닫기 → 재조회 → onDone(reparent)', async () => {
    const load = vi.fn(async () => TREE())
    const move = vi.fn(async () => {})
    const onDone = vi.fn()
    const teams = await setup({ load, move, onDone })
    teams.tree.value.onReparent(5n)
    teams.moveDialog.value.onConfirm(3n)
    await flushPromises()
    expect(move).toHaveBeenCalledWith({ teamNo: 5n, parentTeamNo: 3n, beforeTeamNo: null })
    expect(teams.moveDialog.value.modelValue).toBe(false)
    expect(load).toHaveBeenCalledTimes(2)
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ message: '「판교지점」을(를) 「관리본부」 아래로 옮겼습니다.' }),
    )
  })

  it('topLevel 이면 최상위가 맨 앞이고, 고르면 최상위로 옮겼다고 알린다', async () => {
    const move = vi.fn(async () => {})
    const onDone = vi.fn()
    const teams = await setup({ move, onDone, topLevel: true })
    teams.tree.value.onReparent(5n)
    expect(teams.moveDialog.value.targets[0]!.parentTeamNo).toBeNull()
    teams.moveDialog.value.onConfirm(null)
    await flushPromises()
    expect(move).toHaveBeenCalledWith({ teamNo: 5n, parentTeamNo: null, beforeTeamNo: null })
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ message: '「판교지점」을(를) 최상위로 옮겼습니다.' }),
    )
  })

  it('canAct(…, addChild) 가 거짓인 팀은 선택지에서 빠진다', async () => {
    const teams = await setup({
      move: vi.fn(),
      canAct: (team, action) => !(team.teamNo === 3n && action === 'addChild'),
    })
    teams.tree.value.onReparent(5n)
    expect(teams.moveDialog.value.targets.map((t) => t.parentTeamNo)).not.toContain(3n)
  })
})

describe('useTeamTree — 삭제', () => {
  it('확인(하위 팀 수 · 소속 계정 안내) → 요청 → 재조회 → onDone(remove)', async () => {
    const load = vi.fn(async () => TREE())
    const remove = vi.fn(async () => {})
    const onDone = vi.fn()
    const teams = await setup({ load, remove, onDone })
    teams.tree.value.onRemove(2n)
    await flushPromises()
    expect(activeDialog().textContent).toContain(
      '「영업본부」과(와) 그 아래 팀 3개를 함께 지웁니다. 소속 계정이 있으면 지울 수 없습니다.',
    )
    await clickInDialog('삭제')
    expect(remove).toHaveBeenCalledWith(2n)
    expect(load).toHaveBeenCalledTimes(2)
    expect(onDone).toHaveBeenCalledWith({
      action: 'remove',
      teamNo: 2n,
      teamName: '영업본부',
      message: '「영업본부」을(를) 지웠습니다.',
    })
  })

  it('하위 팀이 없으면 「…」을(를) 지웁니다', async () => {
    const teams = await setup({ remove: vi.fn() })
    teams.tree.value.onRemove(4n)
    await flushPromises()
    expect(activeDialog().textContent).toContain(
      '「강남지점」을(를) 지웁니다. 소속 계정이 있으면 지울 수 없습니다.',
    )
  })

  it('취소면 요청 · 재조회가 없다', async () => {
    const load = vi.fn(async () => TREE())
    const remove = vi.fn(async () => {})
    const teams = await setup({ load, remove })
    teams.tree.value.onRemove(2n)
    await flushPromises()
    await clickInDialog('취소')
    expect(remove).not.toHaveBeenCalled()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('삭제 실패는 전역 토스트에 맡긴다 — handled 로 표시하지 않는다', async () => {
    const error = apiError('소속 계정이 있어 지울 수 없습니다.', 'ERR_TEAM_HAS_MEMBERS', 409)
    const load = vi.fn(async () => TREE())
    const remove = vi.fn(async () => {
      throw error
    })
    const onDone = vi.fn()
    const teams = await setup({ load, remove, onDone })
    teams.tree.value.onRemove(2n)
    await flushPromises()
    await clickInDialog('삭제')
    expect(error.handled).toBe(false)
    expect(load).toHaveBeenCalledTimes(2)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('지운 팀을 고르고 있었으면 선택을 해제한다', async () => {
    const load = vi.fn().mockResolvedValueOnce(TREE()).mockResolvedValueOnce(WITHOUT_SALES())
    const teams = await setup({ load, remove: vi.fn(async () => {}) })
    teams.selected.value = 5n
    teams.tree.value.onRemove(2n)
    await flushPromises()
    await clickInDialog('삭제')
    expect(teams.selected.value).toBeNull()
  })
})

describe('useTeamTree — 노드 안 입력칸', () => {
  it('하위 팀 추가 — Enter → create(앞뒤 공백 제거) → 닫기 → 재조회 → onDone(create, 응답 번호)', async () => {
    const load = vi.fn(async () => TREE())
    const create = vi.fn(async () => ({ teamNo: 99n }))
    const onDone = vi.fn()
    const teams = await setup({ load, create, onDone })
    teams.tree.value.onEditStart({ kind: 'create', parentTeamNo: 2n })
    expect(teams.tree.value.edit).toMatchObject({ kind: 'create', parentTeamNo: 2n, name: '' })
    teams.tree.value.onEditInput('  영업4팀 ')
    teams.tree.value.onEditCommit('enter')
    await flushPromises()
    expect(create).toHaveBeenCalledWith({ teamName: '영업4팀', parentTeamNo: 2n })
    expect(teams.tree.value.edit).toBeNull()
    expect(load).toHaveBeenCalledTimes(2)
    expect(onDone).toHaveBeenCalledWith({
      action: 'create',
      teamNo: 99n,
      teamName: '영업4팀',
      message: '「영업4팀」을(를) 만들었습니다.',
    })
  })

  it('만들기 응답에 번호가 없으면 teamNo: null', async () => {
    const onDone = vi.fn()
    const teams = await setup({ create: vi.fn(async () => undefined), onDone })
    teams.tree.value.onEditStart({ kind: 'create', parentTeamNo: 2n })
    teams.tree.value.onEditInput('영업4팀')
    teams.tree.value.onEditCommit('button')
    await flushPromises()
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ action: 'create', teamNo: null }))
  })

  it('이름 바꾸기 — 그대로면 요청 없이 닫는다', async () => {
    const rename = vi.fn(async () => {})
    const teams = await setup({ rename })
    teams.tree.value.onEditStart({ kind: 'rename', teamNo: 5n })
    expect(teams.tree.value.edit).toMatchObject({ kind: 'rename', name: '판교지점' })
    teams.tree.value.onEditCommit('blur')
    await flushPromises()
    expect(rename).not.toHaveBeenCalled()
    expect(teams.tree.value.edit).toBeNull()
  })

  it('이름 바꾸기 — 바꾸면 rename → onDone(rename)', async () => {
    const rename = vi.fn(async () => {})
    const onDone = vi.fn()
    const teams = await setup({ rename, onDone })
    teams.tree.value.onEditStart({ kind: 'rename', teamNo: 5n })
    teams.tree.value.onEditInput('판교센터')
    teams.tree.value.onEditCommit('blur')
    await flushPromises()
    expect(rename).toHaveBeenCalledWith(5n, { teamName: '판교센터' })
    expect(onDone).toHaveBeenCalledWith({
      action: 'rename',
      teamNo: 5n,
      teamName: '판교센터',
      message: '팀 이름을 「판교센터」(으)로 바꿨습니다.',
    })
  })

  it('빈 이름 — 바깥 누르기면 요청 없이 닫고, Enter 면 오류를 보이고 열어 둔다', async () => {
    const create = vi.fn(async () => {})
    const teams = await setup({ create })
    teams.tree.value.onEditStart({ kind: 'create', parentTeamNo: 2n })
    teams.tree.value.onEditCommit('blur')
    expect(teams.tree.value.edit).toBeNull()
    teams.tree.value.onEditStart({ kind: 'create', parentTeamNo: 2n })
    teams.tree.value.onEditInput('   ')
    teams.tree.value.onEditCommit('enter')
    await flushPromises()
    expect(teams.tree.value.edit).toMatchObject({ error: '팀 이름을 입력하세요.' })
    expect(create).not.toHaveBeenCalled()
  })

  it('64자를 넘으면 오류', async () => {
    const create = vi.fn(async () => {})
    const teams = await setup({ create })
    teams.tree.value.onEditStart({ kind: 'create', parentTeamNo: 2n })
    teams.tree.value.onEditInput('가'.repeat(65))
    teams.tree.value.onEditCommit('enter')
    await flushPromises()
    expect(teams.tree.value.edit).toMatchObject({ error: '팀 이름은 64자 이하로 정하세요.' })
    expect(create).not.toHaveBeenCalled()
  })

  it('🔴 저장 실패는 입력칸 아래 — handled 로 표시해 토스트를 막고, 글자를 두고, 재조회한다(D11)', async () => {
    const error = apiError('이미 같은 이름의 팀이 있습니다.', 'ERR_DUPLICATE_TEAM_NAME', 409)
    const load = vi.fn(async () => TREE())
    const rename = vi.fn(async () => {
      throw error
    })
    const onDone = vi.fn()
    const teams = await setup({ load, rename, onDone })
    teams.tree.value.onEditStart({ kind: 'rename', teamNo: 5n })
    teams.tree.value.onEditInput('영업본부')
    teams.tree.value.onEditCommit('enter')
    await flushPromises()
    expect(teams.tree.value.edit).toMatchObject({
      name: '영업본부',
      pending: false,
      error: '이미 같은 이름의 팀이 있습니다.',
    })
    expect(error.handled).toBe(true)
    expect(load).toHaveBeenCalledTimes(2)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('검증 오류면 teamName 필드 문구를 쓴다', async () => {
    const error = apiError('입력값을 확인하세요', 'ERR_COMMON_VALIDATION', 400, {
      issues: [{ path: ['teamName'], message: '팀 이름에 쓸 수 없는 글자가 있습니다.' }],
    })
    const teams = await setup({
      rename: vi.fn(async () => {
        throw error
      }),
    })
    teams.tree.value.onEditStart({ kind: 'rename', teamNo: 5n })
    teams.tree.value.onEditInput('판교/1')
    teams.tree.value.onEditCommit('enter')
    await flushPromises()
    expect(teams.tree.value.edit).toMatchObject({ error: '팀 이름에 쓸 수 없는 글자가 있습니다.' })
    expect(error.handled).toBe(true)
  })

  it('저장 중에는 입력 · 취소 · 다시 저장을 받지 않는다', async () => {
    const pending = deferred<void>()
    const rename = vi.fn(() => pending.promise)
    const teams = await setup({ rename })
    teams.tree.value.onEditStart({ kind: 'rename', teamNo: 5n })
    teams.tree.value.onEditInput('판교센터')
    teams.tree.value.onEditCommit('enter')
    await flushPromises()
    expect(teams.tree.value.edit).toMatchObject({ pending: true })
    teams.tree.value.onEditInput('딴 이름')
    teams.tree.value.onEditCancel()
    teams.tree.value.onEditCommit('enter')
    expect(teams.tree.value.edit).toMatchObject({ name: '판교센터', pending: true })
    expect(rename).toHaveBeenCalledTimes(1)
    pending.resolve()
    await flushPromises()
    expect(teams.tree.value.edit).toBeNull()
  })

  it('startCreate(null) 은 topLevel 일 때만 최상위 초안을 연다', async () => {
    const create = vi.fn(async () => {})
    let teams = await setup({ create })
    teams.startCreate(null)
    expect(teams.tree.value.edit).toBeNull()
    teams = await setup({ create, topLevel: true })
    teams.startCreate(null)
    expect(teams.tree.value.edit).toMatchObject({ kind: 'create', parentTeamNo: null })
  })

  it('잠겨 있으면 입력칸을 열지 않는다', async () => {
    const teams = await setup({ rename: vi.fn(), canWrite: () => false })
    teams.tree.value.onEditStart({ kind: 'rename', teamNo: 5n })
    expect(teams.tree.value.edit).toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/composables/useTeamTree.render.test.ts`
Expected: FAIL — `Failed to resolve import "./useTeamTree.js"`.

- [ ] **Step 3: 구현**

`packages/admin-ui/src/composables/useTeamTree.ts`:

```ts
import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import {
  TEAM_NAME_MAX_LENGTH,
  flattenTeamTree,
  moveTargets,
  type AdminTeamCreate,
  type AdminTeamMove,
  type AdminTeamNode,
  type AdminTeamRename,
  type TeamMoveTarget,
  type TeamTreeRow,
} from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import { toFieldErrors } from '../api/field-errors.js'
import type {
  TeamAction,
  TeamCommitSource,
  TeamEdit,
  TeamEditTarget,
  TeamMoveSource,
} from '../components/team/team-tree.js'
import { useWriteFlow, type ConfirmDialogBindings } from './useWriteFlow.js'

// 팀 트리의 조회 · 쓰기 흐름 — `TeamTree` · `TeamMoveDialog` · `ConfirmDialog` 에 `v-bind` 할 바인딩을 낸다.
//
// 정본: hangang-home apps/admin/src/pages/org/teams.vue(응답 경합 · 쓰기 한 곳 · 실패해도 재조회 · 삭제 뒤 선택 해제 ·
//       재인증 없음) + ssworks-axion-admin packages/frontend/src/components/team/TeamTree.vue(드래그 이동 확인 · 원위치)
// 바꾼 점:
//  ① 페이지에 흩어진 상태를 composable 하나로. 확인 관문은 3a `useWriteFlow` 를 쓴다.
//  ② 동작은 어댑터에 준 것만 생긴다(3c ④-A1 과 같은 규칙, 3d 스펙 D12).
//  ③ 드래그 확인은 상위 팀이 바뀔 때만(3d ③). 취소 · 실패면 `resetKey` 를 올려 트리가 놓기 전 모양으로 돌아간다 —
//     axion 은 트리를 서버에서 다시 읽어 펼침이 처음으로 돌아갔다.
//  ④ 만들기 · 이름 바꾸기는 노드 안 입력칸(3d ⑦) — 그 상태(`edit`)를 여기서 가진다. 실패 문구는 입력칸 아래(D11).
//  ⑤ 성공 문구는 `onDone` 으로 화면에 맡긴다(기본 문구를 실어 준다). hangang 의 `VAlert` 알림을 버렸다.
//  ⑥ 재인증 · revision 은 없다 — 세 곳 모두 팀 쓰기에 없다.

export type TeamDoneAction = 'create' | 'rename' | 'remove' | 'move' | 'reparent'

export interface TeamDoneEvent {
  action: TeamDoneAction
  /** create 응답에 번호가 없으면 null */
  teamNo: bigint | null
  teamName: string
  /** 기본 문구 — 화면이 그대로 토스트로 띄우면 된다 */
  message: string
}

export interface TeamDialogText {
  title: string
  message: string
  confirmLabel: string
}

export interface TeamMessages {
  created: (teamName: string) => string
  renamed: (teamName: string) => string
  removed: (teamName: string) => string
  moved: (teamName: string) => string
  reparented: (teamName: string, parentTeamName: string | null) => string
  removeConfirm: (teamName: string, descendantCount: number) => TeamDialogText
  moveConfirm: (teamName: string, parentTeamName: string | null) => TeamDialogText
  nameRequired: string
  nameTooLong: (max: number) => string
  saveFailed: string
}

export interface UseTeamTreeOptions {
  load: () => Promise<readonly AdminTeamNode[]>
  create?: (body: AdminTeamCreate) => Promise<unknown>
  rename?: (teamNo: bigint, body: AdminTeamRename) => Promise<unknown>
  remove?: (teamNo: bigint) => Promise<unknown>
  move?: (move: AdminTeamMove) => Promise<unknown>
  /** 게터 — 호출 시점마다 평가한다(3c §11 R6). 기본 `() => true` */
  canWrite?: () => boolean
  canAct?: (node: AdminTeamNode, action: TeamAction) => boolean
  /** 최상위 만들기 · 옮기기 · 사이 놓기. 기본 false */
  topLevel?: boolean
  onDone?: (event: TeamDoneEvent) => void | Promise<void>
  messages?: Partial<TeamMessages>
  /** 기본 true */
  immediate?: boolean
}

/** `<TeamTree v-bind="tree" />` — props 와 리스너 이름은 컴포넌트 그대로 */
export interface TeamTreeBindings {
  nodes: readonly AdminTeamNode[]
  modelValue: bigint | null
  'onUpdate:modelValue': (teamNo: bigint | null) => void
  canWrite: boolean
  busy: boolean
  loading: boolean
  loadFailed: boolean
  topLevel: boolean
  canAct: (node: AdminTeamNode, action: TeamAction) => boolean
  edit: TeamEdit | null
  resetKey: number
  onMove: (move: AdminTeamMove, source: TeamMoveSource) => void
  onReparent: (teamNo: bigint) => void
  onRemove: (teamNo: bigint) => void
  onEditStart: (target: TeamEditTarget) => void
  onEditInput: (name: string) => void
  onEditCommit: (source: TeamCommitSource) => void
  onEditCancel: () => void
  onReload: () => void
}

/** `<TeamMoveDialog v-bind="moveDialog" />` */
export interface TeamMoveDialogBindings {
  modelValue: boolean
  'onUpdate:modelValue': (open: boolean) => void
  teamName: string
  targets: readonly TeamMoveTarget[]
  submitting: boolean
  onConfirm: (parentTeamNo: bigint | null) => void
}

export interface TeamTreeController {
  nodes: Readonly<Ref<readonly AdminTeamNode[]>>
  rows: ComputedRef<TeamTreeRow[]>
  loading: Readonly<Ref<boolean>>
  loadError: Readonly<Ref<unknown>>
  reload: () => Promise<void>
  /** 쓰기 가능 — 페이지가 바깥에서 고를 수도 있다 */
  selected: Ref<bigint | null>
  selectedRow: ComputedRef<TeamTreeRow | null>
  submitting: Readonly<Ref<boolean>>
  tree: ComputedRef<TeamTreeBindings>
  moveDialog: ComputedRef<TeamMoveDialogBindings>
  confirmDialog: ComputedRef<ConfirmDialogBindings>
  /** 페이지의 "최상위 팀 추가" 버튼용(topLevel 일 때 null) */
  startCreate: (parentTeamNo: bigint | null) => void
}

const DEFAULT_MESSAGES: TeamMessages = {
  created: (teamName) => `「${teamName}」을(를) 만들었습니다.`,
  renamed: (teamName) => `팀 이름을 「${teamName}」(으)로 바꿨습니다.`,
  removed: (teamName) => `「${teamName}」을(를) 지웠습니다.`,
  moved: (teamName) => `「${teamName}」의 순서를 바꿨습니다.`,
  reparented: (teamName, parentTeamName) =>
    parentTeamName == null
      ? `「${teamName}」을(를) 최상위로 옮겼습니다.`
      : `「${teamName}」을(를) 「${parentTeamName}」 아래로 옮겼습니다.`,
  removeConfirm: (teamName, descendantCount) => ({
    title: '팀 삭제',
    message: `${
      descendantCount > 0
        ? `「${teamName}」과(와) 그 아래 팀 ${descendantCount}개를 함께 지웁니다.`
        : `「${teamName}」을(를) 지웁니다.`
    } 소속 계정이 있으면 지울 수 없습니다.`,
    confirmLabel: '삭제',
  }),
  moveConfirm: (teamName, parentTeamName) => ({
    title: '팀 옮기기',
    message: `「${teamName}」을(를) ${
      parentTeamName == null ? '최상위로' : `「${parentTeamName}」 아래로`
    } 옮깁니다. 하위 팀과 소속 인원이 함께 옮겨집니다.`,
    confirmLabel: '옮기기',
  }),
  nameRequired: '팀 이름을 입력하세요.',
  nameTooLong: (max) => `팀 이름은 ${max}자 이하로 정하세요.`,
  saveFailed: '저장하지 못했습니다.',
}

type Gate = { gate: 'none' } | { gate: 'confirm'; reversible: boolean; text: TeamDialogText }

function teamNoOf(result: unknown): bigint | null {
  if (result == null || typeof result !== 'object' || !('teamNo' in result)) return null
  const teamNo = (result as { teamNo?: unknown }).teamNo
  return typeof teamNo === 'bigint' ? teamNo : null
}

/** setup 안에서 부른다. 확인 다이얼로그는 반환된 `confirmDialog` 를 `<ConfirmDialog v-bind>` 로 붙인다. */
export function useTeamTree(options: UseTeamTreeOptions): TeamTreeController {
  const flow = useWriteFlow()
  const messages: TeamMessages = { ...DEFAULT_MESSAGES, ...options.messages }
  const canWrite = (): boolean => options.canWrite?.() ?? true
  const topLevel = options.topLevel ?? false

  // ── 조회 ──────────────────────────────────────────────────────────

  const nodes = shallowRef<readonly AdminTeamNode[]>([])
  const loading = ref(false)
  const loadError = shallowRef<unknown>(null)
  const selected = ref<bigint | null>(null)
  const edit = ref<TeamEdit | null>(null)
  const resetKey = ref(0)
  /** 🔴 응답 경합 — 쓰기 뒤 재조회와 첫 조회가 겹치면 먼저 보낸 느린 응답이 나중에 와서 이긴다(gise · hangang). */
  let loadSeq = 0

  const rows = computed(() => flattenTeamTree(nodes.value))
  const rowByNo = computed(() => new Map(rows.value.map((row) => [row.teamNo, row])))
  const nodeByNo = computed(() => {
    const map = new Map<bigint, AdminTeamNode>()
    const walk = (list: readonly AdminTeamNode[]): void =>
      list.forEach((node) => {
        map.set(node.teamNo, node)
        walk(node.children)
      })
    walk(nodes.value)
    return map
  })
  const selectedRow = computed(() =>
    selected.value == null ? null : (rowByNo.value.get(selected.value) ?? null),
  )

  /** 조회 뒤 정리 — 사라진 팀을 가리키는 선택 · 입력칸을 걷는다(스펙 §4-4-2 #2) */
  function tidy(): void {
    if (selected.value != null && !rowByNo.value.has(selected.value)) selected.value = null
    const current = edit.value
    if (current == null) return
    const target = current.kind === 'rename' ? current.teamNo : current.parentTeamNo
    if (target != null && !rowByNo.value.has(target)) edit.value = null
  }

  async function reload(): Promise<void> {
    const seq = ++loadSeq
    loading.value = true
    loadError.value = null
    try {
      const result = await options.load()
      if (seq !== loadSeq) return
      nodes.value = result
      tidy()
    } catch (error) {
      if (seq !== loadSeq) return
      // 트리는 그대로 둔다 — 화면이 마지막 성공 결과를 보인 채 위에 한 줄로 알린다
      loadError.value = error
    } finally {
      if (seq === loadSeq) loading.value = false
    }
  }

  const busy = computed(() => loading.value || flow.submitting.value)

  // ── 판정 ──────────────────────────────────────────────────────────

  function hasAdapter(action: TeamAction): boolean {
    if (action === 'addChild') return options.create != null
    if (action === 'rename') return options.rename != null
    if (action === 'remove') return options.remove != null
    return options.move != null
  }

  function canAct(node: AdminTeamNode, action: TeamAction): boolean {
    return hasAdapter(action) && (options.canAct?.(node, action) ?? true)
  }

  // ── 쓰기 ──────────────────────────────────────────────────────────

  /** 결과와 함께 요청이 실제로 나갔는지(관문 취소 · 진행 중 막힘이 아닌지)를 돌려준다 — 재조회는 나갔을 때만(D10) */
  async function write(
    gate: Gate,
    action: () => Promise<unknown>,
  ): Promise<{ ok: boolean; attempted: boolean; result: unknown }> {
    let attempted = false
    let result: unknown
    const run = async () => {
      attempted = true
      result = await action()
    }
    const ok =
      gate.gate === 'confirm'
        ? await flow.run({
            gate: 'confirm',
            reversible: gate.reversible,
            title: gate.text.title,
            message: gate.text.message,
            confirmLabel: gate.text.confirmLabel,
            action: run,
          })
        : await flow.run({ action: run })
    return { ok, attempted, result }
  }

  async function done(
    action: TeamDoneAction,
    teamNo: bigint | null,
    teamName: string,
    message: string,
  ): Promise<void> {
    await options.onDone?.({ action, teamNo, teamName, message })
  }

  const parentNameOf = (teamNo: bigint | null): string | null =>
    teamNo == null ? null : (nodeByNo.value.get(teamNo)?.teamName ?? null)

  async function moveTeam(move: AdminTeamMove, source: TeamMoveSource): Promise<void> {
    const doMove = options.move
    const node = nodeByNo.value.get(move.teamNo)
    // 끌어 놓은 모양은 이미 바뀌었다 — 요청을 안 보내면 원위치시킨다
    const rollback = () => {
      if (source === 'drag') resetKey.value += 1
    }
    if (doMove == null || node == null || !canWrite() || !canAct(node, 'move')) return rollback()
    const reparent = (rowByNo.value.get(move.teamNo)?.parentTeamNo ?? null) !== move.parentTeamNo
    const parentName = parentNameOf(move.parentTeamNo)
    // 🔴 확인은 상위 팀이 바뀌는 드래그에만 — 하위 팀과 소속 인원이 통째로 다른 팀 밑으로 간다(3d ③)
    const gate: Gate =
      source === 'drag' && reparent
        ? {
            gate: 'confirm',
            reversible: true,
            text: messages.moveConfirm(node.teamName, parentName),
          }
        : { gate: 'none' }
    const { ok, attempted } = await write(gate, () => doMove(move))
    if (!attempted) return rollback()
    if (!ok) rollback()
    await reload()
    if (!ok) return
    await done(
      reparent ? 'reparent' : 'move',
      move.teamNo,
      node.teamName,
      reparent ? messages.reparented(node.teamName, parentName) : messages.moved(node.teamName),
    )
  }

  async function removeTeam(teamNo: bigint): Promise<void> {
    const doRemove = options.remove
    const node = nodeByNo.value.get(teamNo)
    if (doRemove == null || node == null || !canWrite() || !canAct(node, 'remove')) return
    const count = rowByNo.value.get(teamNo)?.descendantCount ?? 0
    const { ok, attempted } = await write(
      { gate: 'confirm', reversible: false, text: messages.removeConfirm(node.teamName, count) },
      () => doRemove(teamNo),
    )
    if (!attempted) return
    await reload()
    if (ok) await done('remove', teamNo, node.teamName, messages.removed(node.teamName))
  }

  // ── 옮기기 대화상자 ───────────────────────────────────────────────

  const moving = ref<bigint | null>(null)
  const moveOpen = ref(false)

  function openReparent(teamNo: bigint): void {
    const node = nodeByNo.value.get(teamNo)
    if (node == null || busy.value || !canWrite() || !canAct(node, 'move')) return
    moving.value = teamNo
    moveOpen.value = true
  }

  async function confirmReparent(parentTeamNo: bigint | null): Promise<void> {
    const teamNo = moving.value
    const doMove = options.move
    const node = teamNo == null ? undefined : nodeByNo.value.get(teamNo)
    if (teamNo == null || node == null || doMove == null || !canWrite()) return
    const move: AdminTeamMove = { teamNo, parentTeamNo, beforeTeamNo: null }
    const parentName = parentNameOf(parentTeamNo)
    const { ok, attempted } = await write({ gate: 'none' }, () => doMove(move))
    if (!attempted) return
    moveOpen.value = false
    await reload()
    if (ok)
      await done('reparent', teamNo, node.teamName, messages.reparented(node.teamName, parentName))
  }

  // ── 노드 안 입력칸 ────────────────────────────────────────────────

  function startEdit(target: TeamEditTarget): void {
    if (edit.value != null || busy.value || !canWrite()) return
    if (target.kind === 'rename') {
      const node = nodeByNo.value.get(target.teamNo)
      if (node == null || !canAct(node, 'rename')) return
      edit.value = {
        kind: 'rename',
        teamNo: target.teamNo,
        name: node.teamName,
        pending: false,
        error: null,
      }
      return
    }
    if (target.parentTeamNo == null) {
      if (!topLevel || options.create == null) return
    } else {
      const parent = nodeByNo.value.get(target.parentTeamNo)
      if (parent == null || !canAct(parent, 'addChild')) return
    }
    edit.value = {
      kind: 'create',
      parentTeamNo: target.parentTeamNo,
      name: '',
      pending: false,
      error: null,
    }
  }

  function inputEdit(name: string): void {
    if (edit.value != null && !edit.value.pending) edit.value.name = name
  }

  function cancelEdit(): void {
    if (edit.value != null && !edit.value.pending) edit.value = null
  }

  async function commitEdit(source: TeamCommitSource): Promise<void> {
    const current = edit.value
    if (current == null || current.pending) return
    const name = current.name.trim()
    if (current.kind === 'rename' && name === nodeByNo.value.get(current.teamNo)?.teamName) {
      edit.value = null
      return
    }
    if (name === '') {
      // 바깥 누르기 + 빈 이름은 "그만둔다" 로 읽는다 — Enter 는 저장하려는 뜻이라 문구로 알린다
      if (source === 'blur') edit.value = null
      else current.error = messages.nameRequired
      return
    }
    if (name.length > TEAM_NAME_MAX_LENGTH) {
      current.error = messages.nameTooLong(TEAM_NAME_MAX_LENGTH)
      return
    }
    if (!canWrite()) {
      edit.value = null
      return
    }
    let call: (() => Promise<unknown>) | null = null
    if (current.kind === 'rename' && options.rename != null) {
      const rename = options.rename
      const teamNo = current.teamNo
      call = () => rename(teamNo, { teamName: name })
    } else if (current.kind === 'create' && options.create != null) {
      const create = options.create
      const parentTeamNo = current.parentTeamNo
      call = () => create({ teamName: name, parentTeamNo })
    }
    if (call == null) {
      edit.value = null
      return
    }
    const invoke = call

    current.pending = true
    current.error = null
    let failure: string | null = null
    try {
      const { ok, attempted, result } = await write({ gate: 'none' }, async () => {
        try {
          return await invoke()
        } catch (error) {
          // 🔴 입력칸 아래에 보인다 — 지연 전역 토스트보다 먼저(동기 구간에서) 처리됨으로 표시한다(3a 규약 · 스펙 D11)
          if (error instanceof ApiError) {
            error.handled = true
            failure = toFieldErrors(error).teamName?.[0] ?? (error.message || messages.saveFailed)
          }
          throw error
        }
      })
      current.pending = false
      // 다른 쓰기가 진행 중이었다 — 요청이 안 나갔으니 입력칸을 그대로 둔다
      if (!attempted) return
      if (!ok) {
        current.error = failure ?? messages.saveFailed
        await reload()
        return
      }
      edit.value = null
      await reload()
      if (current.kind === 'rename') {
        await done('rename', current.teamNo, name, messages.renamed(name))
      } else {
        await done('create', teamNoOf(result), name, messages.created(name))
      }
    } finally {
      current.pending = false
    }
  }

  // ── 바인딩 ────────────────────────────────────────────────────────

  const tree = computed<TeamTreeBindings>(() => ({
    nodes: nodes.value,
    modelValue: selected.value,
    'onUpdate:modelValue': (teamNo) => {
      selected.value = teamNo
    },
    canWrite: canWrite(),
    busy: busy.value,
    loading: loading.value,
    loadFailed: loadError.value != null,
    topLevel,
    canAct,
    edit: edit.value,
    resetKey: resetKey.value,
    onMove: (move, source) => {
      void moveTeam(move, source)
    },
    onReparent: openReparent,
    onRemove: (teamNo) => {
      void removeTeam(teamNo)
    },
    onEditStart: startEdit,
    onEditInput: inputEdit,
    onEditCommit: (source) => {
      void commitEdit(source)
    },
    onEditCancel: cancelEdit,
    onReload: () => {
      void reload()
    },
  }))

  const moveDialog = computed<TeamMoveDialogBindings>(() => {
    const teamNo = moving.value
    const node = teamNo == null ? undefined : nodeByNo.value.get(teamNo)
    return {
      modelValue: moveOpen.value,
      'onUpdate:modelValue': (open) => {
        if (!open && flow.submitting.value) return
        moveOpen.value = open
      },
      teamName: node?.teamName ?? '',
      targets:
        teamNo == null || node == null
          ? []
          : moveTargets(nodes.value, teamNo, {
              topLevel,
              canReceive: (target) => canAct(target, 'addChild'),
            }),
      submitting: flow.submitting.value,
      onConfirm: (parentTeamNo) => {
        void confirmReparent(parentTeamNo)
      },
    }
  })

  if (options.immediate !== false) void reload()

  return {
    nodes,
    rows,
    loading,
    loadError,
    reload,
    selected,
    selectedRow,
    submitting: flow.submitting,
    tree,
    moveDialog,
    confirmDialog: flow.confirmDialog,
    startCreate: (parentTeamNo) => startEdit({ kind: 'create', parentTeamNo }),
  }
}
```

`packages/admin-ui/src/index.ts` 의 "── 조직 ──" 절 끝에 덧붙인다:

```ts
export {
  useTeamTree,
  type UseTeamTreeOptions,
  type TeamTreeController,
  type TeamTreeBindings,
  type TeamMoveDialogBindings,
  type TeamMessages,
  type TeamDialogText,
  type TeamDoneEvent,
  type TeamDoneAction,
} from './composables/useTeamTree.js'
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/composables/useTeamTree.render.test.ts`
Expected: 36 passed.

Run: `pnpm --filter @ssworks/admin-ui typecheck && pnpm --filter @ssworks/admin-ui test`
Expected: 오류 없음, 전부 통과.

- [ ] **Step 5: 커밋**

```bash
pnpm exec eslint --fix packages/admin-ui/src/composables/useTeamTree.ts packages/admin-ui/src/composables/useTeamTree.render.test.ts packages/admin-ui/src/index.ts
pnpm exec prettier --write packages/admin-ui/src/composables/useTeamTree.ts packages/admin-ui/src/composables/useTeamTree.render.test.ts packages/admin-ui/src/index.ts
git add packages/admin-ui/src/composables/useTeamTree.ts packages/admin-ui/src/composables/useTeamTree.render.test.ts packages/admin-ui/src/index.ts
git commit -m "feat(admin-ui): useTeamTree — 조회 경합 · 쓰기 넷 · 드래그 확인과 원위치 · 입력칸 오류는 그 자리에

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: `TeamUserList`

**Files:**

- Modify: `packages/admin-ui/src/test/setup.ts` (`installIntersectionObserver()` 추가)
- Create: `packages/admin-ui/src/components/team/team-user-list.ts`
- Create: `packages/admin-ui/src/components/team/TeamUserList.vue`
- Create: `packages/admin-ui/src/components/team/team-user-list.render.test.ts`
- Modify: `packages/admin-ui/src/index.ts` ("── 조직 ──" 절 끝)

**Interfaces:**

- Consumes: 킷 `PanelLayout` · `ApiError` · `ADMIN_LIST_MAX_PAGE_SIZE`(`components/table/data-table.ts`, 100).
- Produces: `interface TeamUserRow { userNo: bigint; userId: string; userName: string }`, `interface TeamUserQuery { teamNo: bigint; recursive: boolean; keyword?: string; page: number; itemsPerPage: number }`, `interface TeamUserPage<R> { items: readonly R[]; total: number | bigint }`, `interface TeamUserListMessages`, 컴포넌트 `TeamUserList`(`generic="R extends TeamUserRow"`, props `teamNo` · `load(query)` · `pageSize` · `messages` · `modelValue`, 슬롯 `#item="{ item, selected }"` · `#bottom`, expose `reload()`). 테스트 도우미 `installIntersectionObserver(): { reveal(): void; restore(): void }`.

- [ ] **Step 1: 테스트 도우미**

`packages/admin-ui/src/test/setup.ts` 끝에 덧붙인다:

```ts
/**
 * 가짜 IntersectionObserver — happy-dom 은 교차를 계산하지 않는다. `reveal()` 이 관찰 중인 요소를 "화면에 들어왔다"고
 * 알린다(`TeamUserList` 의 스크롤하면 더 — 3d 스펙 D16). `beforeEach` 에서 깔고 `afterEach` 에서 `restore()`.
 * 🔴 `globalThis` 에 심는다 — vitest happy-dom 환경은 window 의 값을 전역에 복사해 두므로 window 에만 심으면 안 보인다.
 */
export function installIntersectionObserver(): { reveal(): void; restore(): void } {
  const observers = new Set<FakeIntersectionObserver>()

  class FakeIntersectionObserver {
    readonly targets = new Set<Element>()
    readonly callback: IntersectionObserverCallback

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback
      observers.add(this)
    }

    observe(target: Element): void {
      this.targets.add(target)
    }

    unobserve(target: Element): void {
      this.targets.delete(target)
    }

    disconnect(): void {
      this.targets.clear()
      observers.delete(this)
    }

    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }

  const original = Object.getOwnPropertyDescriptor(globalThis, 'IntersectionObserver')
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: FakeIntersectionObserver,
  })

  return {
    reveal() {
      for (const observer of [...observers]) {
        const entries = [...observer.targets].map(
          (target) => ({ target, isIntersecting: true }) as unknown as IntersectionObserverEntry,
        )
        if (entries.length > 0) {
          observer.callback(entries, observer as unknown as IntersectionObserver)
        }
      }
    },
    restore() {
      if (original) Object.defineProperty(globalThis, 'IntersectionObserver', original)
      else Reflect.deleteProperty(globalThis, 'IntersectionObserver')
    },
  }
}
```

- [ ] **Step 2: 실패 테스트 작성**

`packages/admin-ui/src/components/team/team-user-list.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, type Component } from 'vue'
import { ApiError } from '../../api/error.js'
import {
  buttonByText,
  installIntersectionObserver,
  installVisualViewport,
  vuetify,
} from '../../test/setup.js'
import TeamUserList from './TeamUserList.vue'
import type { TeamUserPage, TeamUserQuery, TeamUserRow } from './team-user-list.js'

// 정본: hangang-home apps/admin/src/components/org/team-user-list.render.test.ts(팀 없으면 조회 안 함 · ID 검색은 제출 때만 ·
//       하위 팀 포함 · 팀 바뀌면 선택 해제 · 실패 문구 · reload · 응답 경합)에 쪽 나눔(3d ⑧)을 더했다.

installVisualViewport()

interface Member extends TeamUserRow {
  roleName: string
}

const member = (userNo: number, userName: string, roleName = '사원'): Member => ({
  userNo: BigInt(userNo),
  userId: `user${userNo}`,
  userName,
  roleName,
})
const many = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => member(from + i, `사람${from + i}`))
const page = (items: Member[], total: number | bigint): TeamUserPage<Member> => ({ items, total })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let wrapper: VueWrapper | null = null
let io: ReturnType<typeof installIntersectionObserver>

beforeEach(() => {
  io = installIntersectionObserver()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  io.restore()
  vi.restoreAllMocks()
})

async function setup(props: Record<string, unknown>, slots: Record<string, unknown> = {}) {
  wrapper = mount(TeamUserList as unknown as Component, {
    attachTo: document.body,
    props: { teamNo: 2n, ...props },
    slots,
    global: { plugins: [vuetify] },
  })
  await flushPromises()
  return wrapper
}

const text = () => document.body.textContent ?? ''
const rowNames = () =>
  [...document.querySelectorAll('.v-list-item-title')].map((e) => (e.textContent ?? '').trim())
const lastQuery = (load: { mock: { lastCall?: unknown[] } }) =>
  load.mock.lastCall![0] as TeamUserQuery
const moreButton = () =>
  [...document.querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').includes('더 불러오기'),
  )
const apiError = (status: number) =>
  new ApiError('서버 오류', {
    status,
    code: status === 403 ? 'ERR_COMMON_FORBIDDEN' : 'ERR_COMMON_INTERNAL',
    raw: null,
  })

/** pageSize 2 · total 5 인 팀 — 1쪽 [1,2] · 2쪽 [3,4] · 3쪽 [5] */
const pagedLoad = () =>
  vi.fn(async (q: TeamUserQuery) => {
    const all = many(1, 5)
    const start = (q.page - 1) * q.itemsPerPage
    return page(all.slice(start, start + q.itemsPerPage), 5)
  })

describe('TeamUserList — 조회 조건', () => {
  it('팀이 없으면 조회하지 않고 안내하며, 하위 팀 포함이 잠긴다', async () => {
    const load = vi.fn()
    await setup({ teamNo: null, load })
    expect(load).not.toHaveBeenCalled()
    expect(text()).toContain('팀을 고르면 인원이 보입니다.')
    expect(document.querySelector<HTMLInputElement>('input[name="recursive"]')!.disabled).toBe(true)
  })

  it('팀을 받으면 첫 쪽을 조회하고, 위에는 총계만 보인다', async () => {
    const load = vi.fn(async () => page([member(1, '김민준', '팀장'), member(2, '이서연')], 2))
    await setup({ load })
    expect(lastQuery(load)).toStrictEqual({
      teamNo: 2n,
      recursive: false,
      page: 1,
      itemsPerPage: 100,
    })
    expect(rowNames()).toEqual(['김민준', '이서연'])
    expect(text()).toContain('user1')
    expect(text()).toContain('총 2명')
  })

  it('pageSize 를 itemsPerPage 로 보낸다', async () => {
    const load = vi.fn(async () => page([], 0))
    await setup({ load, pageSize: 20 })
    expect(lastQuery(load).itemsPerPage).toBe(20)
  })

  it('하위 팀 포함을 켜면 recursive: true 로 첫 쪽부터 다시', async () => {
    const load = vi.fn(async () => page([], 0))
    await setup({ load })
    await wrapper!.find('input[name="recursive"]').setValue(true)
    await flushPromises()
    expect(lastQuery(load)).toMatchObject({ recursive: true, page: 1 })
  })

  it('검색은 제출할 때만 — 비우고 제출하면 keyword 를 싣지 않는다', async () => {
    const load = vi.fn(async () => page([], 0))
    await setup({ load })
    await wrapper!.find('input[name="userId"]').setValue('user1')
    expect(load).toHaveBeenCalledTimes(1)
    await wrapper!.find('form').trigger('submit')
    await flushPromises()
    expect(lastQuery(load).keyword).toBe('user1')
    await wrapper!.find('input[name="userId"]').setValue('')
    await wrapper!.find('form').trigger('submit')
    await flushPromises()
    expect(lastQuery(load)).not.toHaveProperty('keyword')
  })

  it('🔴 칸에 쳐 두고 제출 안 한 글자는 쓰지 않는다', async () => {
    const load = vi.fn(async () => page([], 0))
    await setup({ load })
    await wrapper!.find('input[name="userId"]').setValue('kim')
    await wrapper!.find('form').trigger('submit')
    await wrapper!.find('input[name="userId"]').setValue('lee')
    await wrapper!.find('input[name="recursive"]').setValue(true)
    await flushPromises()
    expect(lastQuery(load).keyword).toBe('kim')
  })

  it('팀을 바꿔도 하위 팀 포함 · 적용된 검색어는 남는다', async () => {
    const load = vi.fn(async () => page([], 0))
    await setup({ load })
    await wrapper!.find('input[name="recursive"]').setValue(true)
    await wrapper!.find('input[name="userId"]').setValue('kim')
    await wrapper!.find('form').trigger('submit')
    await wrapper!.setProps({ teamNo: 3n })
    await flushPromises()
    expect(lastQuery(load)).toStrictEqual({
      teamNo: 3n,
      recursive: true,
      keyword: 'kim',
      page: 1,
      itemsPerPage: 100,
    })
  })
})

describe('TeamUserList — 고르기 · 슬롯', () => {
  it('팀이 실제로 바뀌면 고른 사람을 해제한다 — 처음 마운트는 아니다', async () => {
    const load = vi.fn(async () => page([member(1, '김민준')], 1))
    await setup({ load, modelValue: 1n })
    expect(wrapper!.emitted('update:modelValue')).toBeUndefined()
    await wrapper!.setProps({ teamNo: 3n })
    await flushPromises()
    expect(wrapper!.emitted('update:modelValue')).toEqual([[null]])
  })

  it('행을 누르면 고르고, 고른 행이 표시된다', async () => {
    const load = vi.fn(async () => page([member(1, '김민준'), member(2, '이서연')], 2))
    await setup({ load })
    const row = [...document.querySelectorAll<HTMLElement>('.v-list-item')].find((e) =>
      (e.textContent ?? '').includes('이서연'),
    )!
    row.click()
    await flushPromises()
    expect(wrapper!.emitted('update:modelValue')).toEqual([[2n]])
    await wrapper!.setProps({ modelValue: 2n })
    expect(document.querySelector('.v-list-item--active')?.textContent).toContain('이서연')
  })

  it('#item 슬롯으로 행 모양을 바꾼다', async () => {
    const load = vi.fn(async () => page([member(1, '김민준', '팀장')], 1))
    await setup(
      { load },
      {
        item: ({ item }: { item: Member }) =>
          h('span', { class: 'custom' }, `${item.userName} · ${item.roleName}`),
      },
    )
    expect([...document.querySelectorAll('.custom')].map((e) => e.textContent)).toEqual([
      '김민준 · 팀장',
    ])
  })
})

describe('TeamUserList — 쪽 나눔(스크롤하면 더)', () => {
  it('총계만 보인다 — 받은 수는 보이지 않는다', async () => {
    const load = vi.fn(async () => page(many(1, 100), 130))
    await setup({ load })
    expect(text()).toContain('총 130명')
    expect(text()).not.toContain('100명')
  })

  it('목록 끝 버튼에 남은 수 — 누르면 다음 쪽을 이어 붙인다', async () => {
    const load = pagedLoad()
    await setup({ load, pageSize: 2 })
    expect(moreButton()!.textContent).toContain('더 불러오기(3명 남음)')
    moreButton()!.click()
    await flushPromises()
    expect(lastQuery(load)).toMatchObject({ page: 2, itemsPerPage: 2 })
    expect(rowNames()).toHaveLength(4)
    expect(moreButton()!.textContent).toContain('더 불러오기(1명 남음)')
  })

  it('목록 끝이 화면에 들어오면 저절로 다음 쪽', async () => {
    const load = pagedLoad()
    await setup({ load, pageSize: 2 })
    io.reveal()
    await flushPromises()
    expect(lastQuery(load).page).toBe(2)
    io.reveal()
    await flushPromises()
    expect(lastQuery(load).page).toBe(3)
    expect(rowNames()).toHaveLength(5)
    expect(moreButton()).toBeUndefined()
  })

  it('다 받으면 끝 — total 이 틀려도 덜 찬 쪽이 오면 더 부르지 않는다', async () => {
    const load = vi.fn(async (q: TeamUserQuery) =>
      q.page === 1 ? page(many(1, 2), 10) : page(many(3, 1), 10),
    )
    await setup({ load, pageSize: 2 })
    moreButton()!.click()
    await flushPromises()
    expect(rowNames()).toHaveLength(3)
    expect(moreButton()).toBeUndefined()
    io.reveal()
    await flushPromises()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('쪽 사이에 같은 사람이 다시 오면 한 번만 보인다', async () => {
    const load = vi.fn(async (q: TeamUserQuery) =>
      q.page === 1 ? page(many(1, 2), 4) : page(many(2, 2), 4),
    )
    await setup({ load, pageSize: 2 })
    moreButton()!.click()
    await flushPromises()
    expect(rowNames()).toEqual(['사람1', '사람2', '사람3'])
  })

  it('🔴 다음 쪽을 기다리는 사이 팀이 바뀌면 그 응답을 버린다', async () => {
    const second = deferred<TeamUserPage<Member>>()
    const load = vi.fn((q: TeamUserQuery) => {
      if (q.teamNo === 3n) return Promise.resolve(page([member(9, '다른팀')], 1))
      return q.page === 1 ? Promise.resolve(page(many(1, 2), 5)) : second.promise
    })
    await setup({ load, pageSize: 2 })
    moreButton()!.click()
    await flushPromises()
    await wrapper!.setProps({ teamNo: 3n })
    await flushPromises()
    second.resolve(page(many(3, 2), 5))
    await flushPromises()
    expect(rowNames()).toEqual(['다른팀'])
  })

  it('다음 쪽이 실패하면 받은 사람은 두고 다시 시도 — 그때까지 자동 불러오기는 멈춘다', async () => {
    let fail = true
    const load = vi.fn(async (q: TeamUserQuery) => {
      if (q.page === 2 && fail) throw apiError(500)
      const all = many(1, 5)
      const start = (q.page - 1) * q.itemsPerPage
      return page(all.slice(start, start + q.itemsPerPage), 5)
    })
    await setup({ load, pageSize: 2 })
    io.reveal()
    await flushPromises()
    expect(text()).toContain('더 불러오지 못했습니다.')
    expect(rowNames()).toHaveLength(2)
    io.reveal()
    await flushPromises()
    expect(load).toHaveBeenCalledTimes(2)
    fail = false
    buttonByText('다시 시도')!.click()
    await flushPromises()
    expect(rowNames()).toHaveLength(4)
  })

  it('total 이 bigint 여도 숫자로 센다', async () => {
    const load = vi.fn(async () => page([member(1, '김민준')], 7n))
    await setup({ load, pageSize: 1 })
    expect(text()).toContain('총 7명')
    expect(moreButton()!.textContent).toContain('6명 남음')
  })
})

describe('TeamUserList — 실패 · 경합 · reload', () => {
  it('첫 쪽이 실패하면 목록을 비우고 문구 + 다시 시도 — 토스트와 겹치지 않게 handled', async () => {
    const error = apiError(500)
    const load = vi
      .fn()
      .mockResolvedValueOnce(page([member(1, '김민준')], 1))
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(page([member(1, '김민준')], 1))
    await setup({ load })
    await (wrapper!.vm as unknown as { reload(): Promise<void> }).reload()
    await flushPromises()
    expect(rowNames()).toEqual([])
    expect(text()).toContain('인원을 불러오지 못했습니다.')
    expect(error.handled).toBe(true)
    buttonByText('다시 시도')!.click()
    await flushPromises()
    expect(rowNames()).toEqual(['김민준'])
  })

  it('403 이면 권한 문구 — 다시 시도는 없다', async () => {
    const load = vi.fn(async () => {
      throw apiError(403)
    })
    await setup({ load })
    expect(text()).toContain(
      '이 팀의 인원을 볼 권한이 없습니다. 권한을 가진 관리자에게 요청하세요.',
    )
    expect(buttonByText('다시 시도')).toBeUndefined()
  })

  it('🔴 늦게 온 첫 쪽 응답은 버린다', async () => {
    const first = deferred<TeamUserPage<Member>>()
    const load = vi.fn((q: TeamUserQuery) =>
      q.teamNo === 2n ? first.promise : Promise.resolve(page([member(9, '다른팀')], 1)),
    )
    await setup({ load })
    await wrapper!.setProps({ teamNo: 3n })
    await flushPromises()
    first.resolve(page([member(1, '김민준')], 1))
    await flushPromises()
    expect(rowNames()).toEqual(['다른팀'])
  })

  it('reload() 는 같은 조건으로 첫 쪽부터 — 팀이 없으면 부르지 않는다', async () => {
    const load = vi.fn(async () => page([], 0))
    await setup({ load })
    const vm = wrapper!.vm as unknown as { reload(): Promise<void> }
    await vm.reload()
    expect(load).toHaveBeenCalledTimes(2)
    expect(lastQuery(load)).toMatchObject({ teamNo: 2n, page: 1 })
    await wrapper!.setProps({ teamNo: null })
    await flushPromises()
    await vm.reload()
    expect(load).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/components/team/team-user-list.render.test.ts`
Expected: FAIL — `Failed to resolve import "./TeamUserList.vue"`.

- [ ] **Step 4: 타입 · 문구**

`packages/admin-ui/src/components/team/team-user-list.ts`:

```ts
// TeamUserList 의 타입 · 기본 문구.

/** 킷이 아는 최소 행 — 프로젝트 필드(직책 · 상태 …)는 `#item` 슬롯에서 쓴다 */
export interface TeamUserRow {
  userNo: bigint
  userId: string
  userName: string
}

export interface TeamUserQuery {
  teamNo: bigint
  recursive: boolean
  /** 마지막으로 제출한 검색어. 비었으면 싣지 않는다 */
  keyword?: string
  page: number
  itemsPerPage: number
}

export interface TeamUserPage<R> {
  items: readonly R[]
  total: number | bigint
}

export interface TeamUserListMessages {
  searchLabel: string
  searchButton: string
  recursiveLabel: string
  noTeam: string
  empty: string
  emptyFiltered: string
  total: (total: number) => string
  loadMore: (rest: number) => string
  loadMoreFailed: string
  forbidden: string
  loadFailed: string
  retry: string
}

export const DEFAULT_TEAM_USER_LIST_MESSAGES: TeamUserListMessages = {
  // 🔴 "ID 검색" 이다 — hangang 서버 스키마에 이름 검색이 없고 넘겨도 조용히 무시된다. 이름 검색을 지원하는 서버만
  //    `messages.searchLabel` 을 바꾼다(hangang 이 남긴 경고).
  searchLabel: 'ID 검색',
  searchButton: '검색',
  recursiveLabel: '하위 팀 포함',
  noTeam: '팀을 고르면 인원이 보입니다.',
  empty: '인원이 없습니다.',
  emptyFiltered: '맞는 인원이 없습니다.',
  total: (total) => `총 ${total}명`,
  loadMore: (rest) => `더 불러오기(${rest}명 남음)`,
  loadMoreFailed: '더 불러오지 못했습니다.',
  forbidden: '이 팀의 인원을 볼 권한이 없습니다. 권한을 가진 관리자에게 요청하세요.',
  loadFailed: '인원을 불러오지 못했습니다.',
  retry: '다시 시도',
}
```

- [ ] **Step 5: 컴포넌트**

`packages/admin-ui/src/components/team/TeamUserList.vue`:

```vue
<script setup lang="ts" generic="R extends TeamUserRow">
  import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
  import {
    VAlert,
    VBtn,
    VCheckbox,
    VList,
    VListItem,
    VListItemSubtitle,
    VListItemTitle,
    VProgressLinear,
    VTextField,
  } from 'vuetify/components'
  import { ApiError } from '../../api/error.js'
  import { ADMIN_LIST_MAX_PAGE_SIZE } from '../table/data-table.js'
  import PanelLayout from '../ui/PanelLayout.vue'
  import {
    DEFAULT_TEAM_USER_LIST_MESSAGES,
    type TeamUserListMessages,
    type TeamUserPage,
    type TeamUserQuery,
    type TeamUserRow,
  } from './team-user-list.js'

  // 팀 화면 2열 — 트리에서 고른 팀의 인원 목록. 읽기 전용 선택기다(편집 진입점은 3열 하나 — hangang).
  //
  // 정본: hangang-home apps/admin/src/components/org/TeamUserList.vue
  // 바꾼 점:
  //  - API 직접 호출(`usersApi.list`)을 `load(query)` 어댑터로, 고정 행 모양을 `#item` 슬롯으로, "사용자 추가" 버튼을
  //    `#bottom` 슬롯으로(3d ⑧ L1).
  //  - 100명 절단 안내 대신 쪽 나눔 — 목록 끝의 "더 불러오기" 버튼이 화면에 들어오면 저절로 눌린다(스펙 D16). 위에는
  //    총계만 보인다.
  //  - 하위 팀 포함 · 팀이 바뀔 때 마지막으로 **제출한** 검색어를 쓴다 — hangang 은 칸에 쳐 두기만 한 글자가 섞여 나갔다.
  //
  // 🔴 응답 경합 — 첫 쪽 · 다음 쪽 · reload 가 같은 순번을 탄다. 팀을 빨리 바꾸면 먼저 보낸 느린 응답이 나중 팀의 목록을
  //    덮거나 끝에 붙는다(hangang).
  // 🔴 `recursive` 는 `teamNo` 와 짝이다 — 단독이면 서버가 둘 다 안 건다. 그래서 팀이 없으면 조회하지 않는다(hangang).

  const props = withDefaults(
    defineProps<{
      teamNo: bigint | null
      /** 메서드 꼴(bivariant) */
      load(query: TeamUserQuery): Promise<TeamUserPage<R>>
      pageSize?: number
      messages?: Partial<TeamUserListMessages>
    }>(),
    { pageSize: ADMIN_LIST_MAX_PAGE_SIZE, messages: () => ({}) },
  )

  const selected = defineModel<bigint | null>({ default: null })

  defineSlots<{
    item?(props: { item: R; selected: boolean }): unknown
    bottom?(): unknown
  }>()

  const text = computed<TeamUserListMessages>(() => ({
    ...DEFAULT_TEAM_USER_LIST_MESSAGES,
    ...props.messages,
  }))

  const keywordInput = ref('')
  /** 🔴 마지막으로 제출한 검색어 — 칸에 쳐 두고 제출 안 한 글자는 쓰지 않는다 */
  const applied = ref('')
  const recursive = ref(false)
  const items = shallowRef<R[]>([])
  const total = ref(0)
  const page = ref(0)
  const done = ref(true)
  const loading = ref(false)
  const loadingMore = ref(false)
  const failure = ref<'forbidden' | 'failed' | null>(null)
  /** 다음 쪽 실패 — 다시 시도를 누를 때까지 자동 불러오기를 멈춘다(실패 → 다시 보임 → 또 실패의 반복을 막는다) */
  const moreFailed = ref(false)
  let seq = 0

  function query(nextPage: number, teamNo: bigint): TeamUserQuery {
    const result: TeamUserQuery = {
      teamNo,
      recursive: recursive.value,
      page: nextPage,
      itemsPerPage: props.pageSize,
    }
    if (applied.value !== '') result.keyword = applied.value
    return result
  }

  /** 🔴 목록 위에 직접 보이므로 처리됨으로 표시한다 — 전역 토스트와 두 번 알리지 않는다(3a 규약) */
  function classify(error: unknown): 'forbidden' | 'failed' {
    if (error instanceof ApiError) {
      error.handled = true
      if (error.status === 403) return 'forbidden'
    }
    return 'failed'
  }

  /** 쪽 사이에 명단이 바뀌어 같은 사람이 다시 오면 버린다 */
  function append(current: readonly R[], incoming: readonly R[]): R[] {
    const seen = new Set(current.map((row) => row.userNo))
    const fresh = incoming.filter((row) => {
      if (seen.has(row.userNo)) return false
      seen.add(row.userNo)
      return true
    })
    return [...current, ...fresh]
  }

  function settle(result: TeamUserPage<R>, nextItems: R[], nextPage: number): void {
    items.value = nextItems
    total.value = Number(result.total)
    page.value = nextPage
    // 서버 total 이 틀려도 끝없이 부르지 않게 — 덜 찬 쪽이 오면 끝이다
    done.value = nextItems.length >= total.value || result.items.length < props.pageSize
  }

  async function load(): Promise<void> {
    const teamNo = props.teamNo
    const mine = ++seq
    loadingMore.value = false
    moreFailed.value = false
    failure.value = null
    if (teamNo == null) {
      items.value = []
      total.value = 0
      page.value = 0
      done.value = true
      loading.value = false
      return
    }
    loading.value = true
    try {
      const result = await props.load(query(1, teamNo))
      if (mine !== seq) return
      settle(result, append([], result.items), 1)
    } catch (error) {
      if (mine !== seq) return
      items.value = []
      total.value = 0
      page.value = 0
      done.value = true
      failure.value = classify(error)
    } finally {
      if (mine === seq) loading.value = false
    }
  }

  async function loadMore(): Promise<void> {
    const teamNo = props.teamNo
    if (teamNo == null || done.value || loading.value || loadingMore.value || moreFailed.value)
      return
    const mine = seq
    loadingMore.value = true
    try {
      const result = await props.load(query(page.value + 1, teamNo))
      if (mine !== seq) return
      settle(result, append(items.value, result.items), page.value + 1)
      rearm()
    } catch (error) {
      if (mine !== seq) return
      moreFailed.value = true
      classify(error)
    } finally {
      if (mine === seq) loadingMore.value = false
    }
  }

  function retryMore(): void {
    moreFailed.value = false
    void loadMore()
  }

  function onSearch(): void {
    if (props.teamNo == null || loading.value) return
    applied.value = keywordInput.value.trim()
    void load()
  }

  function select(row: R): void {
    selected.value = row.userNo
  }

  watch(
    () => props.teamNo,
    (next, previous) => {
      // 팀이 실제로 바뀌면 고른 사람을 걷는다 — 다른 팀 사람을 3열에 남기지 않는다(첫 마운트는 제외 — hangang)
      if (previous !== undefined && next !== previous && selected.value != null)
        selected.value = null
      void load()
    },
    { immediate: true },
  )

  watch(recursive, () => {
    void load()
  })

  // ── 스크롤하면 더 ─────────────────────────────────────────────────

  const sentinel = ref<HTMLElement | null>(null)
  let observer: IntersectionObserver | null = null

  /** 붙인 뒤에도 끝이 화면 안이면 이어서 부르도록 다시 관찰한다 — 관찰은 교차가 "바뀔 때" 만 알린다 */
  function rearm(): void {
    const el = sentinel.value
    if (observer == null || el == null) return
    observer.unobserve(el)
    observer.observe(el)
  }

  watch(
    sentinel,
    (el) => {
      observer?.disconnect()
      observer = null
      if (el == null || typeof IntersectionObserver === 'undefined') return
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) void loadMore()
        },
        { root: el.closest('.panel-layout__content-inner'), rootMargin: '0px 0px 120px 0px' },
      )
      observer.observe(el)
    },
    { flush: 'post' },
  )

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  defineExpose({ reload: load })
</script>

<template>
  <PanelLayout class="team-user-list" scrollable>
    <template #top>
      <div class="team-user-list__top">
        <form class="team-user-list__search" @submit.prevent="onSearch">
          <VTextField
            v-model="keywordInput"
            autocomplete="off"
            density="compact"
            hide-details
            :label="text.searchLabel"
            name="userId"
            variant="outlined"
          />
          <VBtn :disabled="loading || teamNo == null" :loading="loading" type="submit">
            {{ text.searchButton }}
          </VBtn>
        </form>
        <VCheckbox
          v-model="recursive"
          density="compact"
          :disabled="teamNo == null"
          hide-details
          :label="text.recursiveLabel"
          name="recursive"
        />
        <VAlert v-if="failure === 'forbidden'" density="compact" type="error" variant="tonal">
          {{ text.forbidden }}
        </VAlert>
        <VAlert v-else-if="failure === 'failed'" density="compact" type="error" variant="tonal">
          {{ text.loadFailed }}
          <template #append>
            <VBtn size="small" variant="text" @click="load">{{ text.retry }}</VBtn>
          </template>
        </VAlert>
        <p v-else-if="teamNo != null && total > 0" class="team-user-list__total">
          {{ text.total(total) }}
        </p>
      </div>
      <VProgressLinear v-if="loading" color="primary" indeterminate />
    </template>

    <p v-if="teamNo == null" class="team-user-list__empty">{{ text.noTeam }}</p>
    <p v-else-if="items.length === 0 && !loading && failure == null" class="team-user-list__empty">
      {{ applied === '' ? text.empty : text.emptyFiltered }}
    </p>
    <template v-else-if="items.length > 0">
      <VList density="compact">
        <VListItem
          v-for="row in items"
          :key="String(row.userNo)"
          :active="row.userNo === selected"
          @click="select(row)"
        >
          <slot name="item" :item="row" :selected="row.userNo === selected">
            <VListItemTitle>{{ row.userName }}</VListItemTitle>
            <VListItemSubtitle>{{ row.userId }}</VListItemSubtitle>
          </slot>
        </VListItem>
      </VList>
      <div v-if="!done && failure == null" ref="sentinel" class="team-user-list__more">
        <VAlert v-if="moreFailed" density="compact" type="error" variant="tonal">
          {{ text.loadMoreFailed }}
          <template #append>
            <VBtn size="small" variant="text" @click="retryMore">{{ text.retry }}</VBtn>
          </template>
        </VAlert>
        <VBtn
          v-else
          block
          :disabled="loadingMore"
          :loading="loadingMore"
          variant="tonal"
          @click="loadMore"
        >
          {{ text.loadMore(Math.max(0, total - items.length)) }}
        </VBtn>
      </div>
    </template>

    <template #bottom>
      <slot name="bottom" />
    </template>
  </PanelLayout>
</template>

<style scoped>
  .team-user-list__top {
    display: grid;
    gap: 8px;
    padding: 12px 12px 8px;
  }

  .team-user-list__search {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .team-user-list__total {
    margin: 0;
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  }

  .team-user-list__empty {
    padding: 32px 16px;
    margin: 0;
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-align: center;
  }

  .team-user-list__more {
    padding: 8px 12px 16px;
  }
</style>
```

`packages/admin-ui/src/index.ts` 의 "── 조직 ──" 절 끝에 덧붙인다:

```ts
export { default as TeamUserList } from './components/team/TeamUserList.vue'
export {
  type TeamUserRow,
  type TeamUserQuery,
  type TeamUserPage,
  type TeamUserListMessages,
} from './components/team/team-user-list.js'
```

- [ ] **Step 6: 통과 확인**

Run: `pnpm exec vitest run packages/admin-ui/src/components/team/team-user-list.render.test.ts`
Expected: 22 passed.

Run: `pnpm --filter @ssworks/admin-ui typecheck && pnpm --filter @ssworks/admin-ui build`
Expected: 오류 없음 — 제네릭 SFC 선언이 빌드된다(`SessionTable` 과 같은 경로).

- [ ] **Step 7: 커밋**

```bash
pnpm exec eslint --fix packages/admin-ui/src/components/team packages/admin-ui/src/test/setup.ts packages/admin-ui/src/index.ts
pnpm exec prettier --write packages/admin-ui/src/components/team packages/admin-ui/src/test/setup.ts packages/admin-ui/src/index.ts
git add packages/admin-ui/src/components/team packages/admin-ui/src/test/setup.ts packages/admin-ui/src/index.ts
git commit -m "feat(admin-ui): TeamUserList — load 어댑터 · 스크롤하면 다음 쪽 · 총계만 · 응답 경합

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: README · changeset · 문서 · 전체 검증

**Files:**

- Modify: `packages/admin-ui/README.md` (API 표 · Peer 의존 표 · "## 조직" 절)
- Create: `.changeset/admin-ui-teams.md`
- Modify: `CLAUDE.md`, `docs/HANDOFF.md`, `docs/01-phase0.md` §8 (진행표)
- Modify: `docs/superpowers/specs/2026-10-07-admin-ui-teams-design.md` (구현 중 정정이 있었으면 §11 을 만든다)

**Interfaces:**

- Consumes: Task 1~7 의 공개 이름(위 각 Task 의 Produces).

- [ ] **Step 1: README — Peer 의존 표**

`packages/admin-ui/README.md` 의 "## Peer 의존" 표 끝 행(`axios`) 다음에 넣는다:

```md
| `@he-tree/vue` | 예 | `TeamTree`(팀 트리 · 드래그) |
```

표 아래 🔴 문단의 첫 문장 "`pinia`·`axios` 도 **필수**다." 를 "`pinia`·`axios`·`@he-tree/vue` 도 **필수**다." 로 바꾼다. 그 문단 끝에 한 문장을 더한다: "he-tree CSS 는 import 하지 않아도 된다 — `TeamTree` 가 필요한 규칙을 `style.css` 에 담는다."

- [ ] **Step 2: README — API 표 행**

API 표에서 `copyText` 행 다음에 넣는다(열 너비는 prettier 가 맞춘다):

```md
| `TeamTree` · `TeamAction` · `TeamEdit` · `TeamEditTarget` · `TeamCommitSource` · `TeamMoveSource` · `TeamTreeMessages` | 팀 트리(he-tree). ↑↓ · ⋮ 메뉴(하위 팀 추가 · 이름 바꾸기 · 옮기기 · 삭제) · 노드 안 입력칸 · 부모 포함 검색, `draggable` 로 끌어 옮기기. `useTeamTree().tree` 를 `v-bind`. 아래 "조직" |
| `TeamMoveDialog` | 옮기기 대화상자 — 새 상위 팀 아래 맨 끝으로. `useTeamTree().moveDialog` 를 `v-bind` |
| `useTeamTree` · `UseTeamTreeOptions` · `TeamTreeController` · `TeamTreeBindings` · `TeamMoveDialogBindings` · `TeamMessages` · `TeamDialogText` · `TeamDoneEvent` · `TeamDoneAction` | 팀 트리 headless — 조회 경합 · 쓰기 넷(만들기 · 이름 · 삭제 · 이동) · 드래그 확인과 원위치 · 입력칸 오류는 그 자리에 |
| `TeamUserList` · `TeamUserRow` · `TeamUserQuery` · `TeamUserPage` · `TeamUserListMessages` | 팀 화면 2열 인원 목록 — `load` 어댑터 · ID 검색 · 하위 팀 포함 · 스크롤하면 다음 쪽 |
```

- [ ] **Step 3: README — "## 조직" 절**

README 끝("## 세션 · 비밀번호" 절 다음)에 덧붙인다:

````md
## 조직

팀 트리와 2열 인원 목록. 3열(사용자 폼)과 페이지 배치는 템플릿 몫이다.

### Phase 2 서버를 쓰는 새 서비스

```ts
const teams = useTeamTree({
  load: () => api.get<AdminTeamTree>('/admin/teams/tree').then((r) => r.items),
  create: (body) => api.post('/admin/teams', body),
  rename: (teamNo, body) => api.patch(`/admin/teams/${teamNo}`, body),
  remove: (teamNo) => api.del(`/admin/teams/${teamNo}`),
  move: ({ teamNo, ...body }) => api.patch(`/admin/teams/${teamNo}/move`, body),
  canWrite: () => can('org.teams:write'),
  onDone: (e) => toast.success(e.message),
})
```

```vue
<ColumnLayout>
  <ColumnPane width="400px">
    <TeamTree v-bind="teams.tree.value" draggable />
  </ColumnPane>
  <ColumnPane width="300px">
    <TeamUserList ref="userList" v-model="selectedUserNo" :team-no="teams.selected.value" :load="loadMembers">
      <template #item="{ item }">{{ item.userName }} · {{ item.roleName }}</template>
      <template #bottom><VBtn block :disabled="teams.selected.value == null" @click="startAdd">사용자 추가</VBtn></template>
    </TeamUserList>
  </ColumnPane>
  <ColumnPane>…사용자 폼(템플릿)…</ColumnPane>
</ColumnLayout>
<TeamMoveDialog v-bind="teams.moveDialog.value" />
<ConfirmDialog v-bind="teams.confirmDialog.value" />
```

```ts
const loadMembers = (q: TeamUserQuery) =>
  api.get<{ items: Member[]; total: number }>('/admin/users', {
    params: {
      teamNo: q.teamNo,
      recursive: q.recursive,
      userId: q.keyword,
      page: q.page,
      itemsPerPage: q.itemsPerPage,
    },
  })
// 3열에서 사용자를 저장한 뒤 — 같은 조건으로 다시
userList.value?.reload()
```

- 이동 요청은 기준 형제 번호 `{ teamNo, parentTeamNo, beforeTeamNo }`(`beforeTeamNo: null` = 맨 끝)다. ↑↓ · 드래그 · 옮기기가 모두 같은 모양이고, 순서 값은 서버가 계산한다.
- 드래그는 `draggable` 로 켠다. 같은 상위 팀 안의 순서는 바로 저장하고, 상위 팀이 바뀌면 확인을 받는다. 취소 · 실패면 놓기 전 모양으로 돌아간다. Alt+화살표 이동은 막는다 — 키보드 사용자는 ↑↓ 와 옮기기를 쓴다.
- 만들기 · 이름 바꾸기는 노드 안 입력칸이다. Enter · ✓ · **바깥 누르기**가 저장, Esc · ✕ 가 취소. 실패하면 입력칸과 글자를 두고 그 아래 서버 문구를 보인다(토스트 없음).
- 시스템 팀처럼 막을 노드는 `canAct: (node, action) => …` 로 막는다(`'addChild' | 'rename' | 'remove' | 'move'`). 어댑터를 주지 않은 동작은 아예 생기지 않는다.
- 최상위 팀을 화면에서 만들고 옮기려면 `topLevel: true` 와 페이지의 "최상위 팀 추가" 버튼(`teams.startCreate(null)`).

### hangang 형 서버(루트 하나 · 순서 값)

```ts
const teams = useTeamTree({
  load: async () => {
    const { item } = await teamsApi.tree()
    return item ? [item] : []
  },
  move: async (move) => {
    const body = toDisplayOrderMove(teams.nodes.value, move) // { parentTeamNo?, displayOrder } | null(제자리)
    if (body) await teamsApi.move(move.teamNo, body)
  },
  // 루트는 시드가 만든다 — 지우거나 옮기지 않는다
  canAct: (node, action) => !(node.teamNo === rootNo && (action === 'remove' || action === 'move')),
  …
})
```
````

- [ ] **Step 4: changeset**

`.changeset/admin-ui-teams.md`:

```md
---
'@ssworks/admin-shared': minor
'@ssworks/admin-ui': minor
---

PR #3d — 조직(팀 트리 · 팀 인원).

- **소비자가 할 일: `pnpm add @he-tree/vue@^2.10.5`** — admin-ui 의 새 필수 peer 다(엔트리가 하나라 `TeamTree` 를 안 써도 번들러가 해석해야 한다). he-tree CSS 는 import 하지 않아도 된다.
- admin-shared 새 API: 팀 스키마(`adminTeamNodeSchema` · `adminTeamTreeSchema` · `adminTeamCreateSchema` · `adminTeamRenameSchema` · `adminTeamMoveSchema` · `adminTeamMoveBodySchema` · `teamNameSchema`, 이름 64자), 트리 함수(`sortTeamTree` · `flattenTeamTree` · `filterTeamTree` · `findTeamPlacement` · `siblingMove` · `moveTargets` · `toDisplayOrderMove` · `indentTeamName`).
- admin-ui 새 API: `TeamTree`(he-tree, 노드 안 입력칸 · `draggable`) · `useTeamTree` · `TeamMoveDialog` · `TeamUserList`(쪽 나눔).
- 서버 계약: 트리 응답 `{ items }`(루트 여럿), 이동 본문은 기준 형제 번호 `{ parentTeamNo, beforeTeamNo }`(서버가 순서 값을 계산, 순환 검사), 소속 계정이 있는 팀 삭제는 `ERR_TEAM_HAS_MEMBERS`. 기존 순서 값 서버는 `toDisplayOrderMove()` 로 맞춘다.
- 기존 API 동작은 바뀌지 않는다.
```

- [ ] **Step 5: 전체 검증**

Run: `pnpm format && pnpm check`
Expected: lint → typecheck → test → build 모두 초록. 테스트 요약 줄(admin-shared · admin-ui 각각의 `Tests N passed`)을 적어 둔다.

Run: `pnpm format:check`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 6: 진행 문서**

- `CLAUDE.md` "진행 상태와 다음 단계" 표: `Phase 1 PR #3c` 행 다음에 행을 넣는다 — `| Phase 1 PR #3d — `TeamTree`(he-tree) · `useTeamTree`·`TeamMoveDialog`·`TeamUserList`· 팀 스키마 · 트리 함수 | 완료 | 스펙`docs/superpowers/specs/2026-10-07-admin-ui-teams-design.md`· 플랜`docs/superpowers/plans/2026-10-07-admin-ui-teams.md` |`. 그다음 행 `**Phase 1 PR #3d~3e — 조직(he-tree) / 약관(CodeMirror)**` 을 `**Phase 1 PR #3e — 약관(CodeMirror)**` 로 바꾼다.
- `docs/HANDOFF.md`: "지금 상태" 표의 admin-shared · admin-ui 행에 PR #3d 완료와 Step 5 의 테스트 수를 적는다. "다음 플랜" 행을 PR #3e(약관 — `LegalDocumentEditor`, CodeMirror 필수 peer)로 바꾸고 직전 PR 을 3d 스펙 · 플랜으로 바꾼다. "첫 세션에서 할 일" 3번의 "다음은 **PR #3d**" 를 "**PR #3d** 완료, 다음은 **PR #3e**" 로. "발행 전에 사람이 해야 하는 것" 의 Version Packages 문단 끝에 "3d 는 새 필수 peer(`@he-tree/vue`)가 있어 changeset 에 소비자 설치 안내를 적었다." 를 더한다.
- `docs/01-phase0.md` §8 표: admin-ui 행에 "PR #3d 완료(`TeamTree` · `useTeamTree` · `TeamMoveDialog` · `TeamUserList`)" 와 테스트 수, admin-shared 행의 테스트 수를 갱신한다. "다음:" 줄을 "다음: admin-ui PR #3e(약관), 그 뒤 admin-server." 로.
- 구현 중 스펙과 다르게 한 것(예: he-tree 선언 때문에 `Draggable` 을 감싼 일, 이벤트 이름 차이)이 있으면 스펙 끝에 `## 11. 구현 중 정정 (2026-10-07)` 을 만들고 `R1` · `R2` … 로 적는다(3c 스펙 §11 과 같은 꼴: 무엇을 · 왜 · 어디).

- [ ] **Step 7: 스모크**

`/smoke` 절차(`.claude/commands/smoke.md`)로 패킹한 tarball 을 임시 Vite 앱에 설치해 typecheck · build 한다. 이번에는 임시 앱에 `@he-tree/vue@^2.10.5` 도 설치하고, `main.ts` 에서 `TeamTree` 를 import 해 한 번 그린다. Windows 에서 긴 경로 오류(os error 3)가 나면 짧은 `%TEMP%` 경로에서 돌린다.

Expected: typecheck · build 초록. 결과를 보고에 적는다.

- [ ] **Step 8: 커밋**

```bash
pnpm exec prettier --write packages/admin-ui/README.md .changeset/admin-ui-teams.md CLAUDE.md docs/HANDOFF.md docs/01-phase0.md docs/superpowers/specs/2026-10-07-admin-ui-teams-design.md
git add packages/admin-ui/README.md .changeset/admin-ui-teams.md CLAUDE.md docs/HANDOFF.md docs/01-phase0.md docs/superpowers/specs/2026-10-07-admin-ui-teams-design.md
git commit -m "docs: PR #3d — README 조직 절, changeset(he-tree 필수 peer), 진행 문서

Co-Authored-By: Claude <noreply@anthropic.com>"
```
