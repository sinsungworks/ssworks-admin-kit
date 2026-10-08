# admin-ui 조직(팀 트리 · 팀 인원) 설계 (Phase 1 PR #3d)

작성일: 2026-10-07 · 상태: 확정(구현 전) · 선행: PR #3a 스펙(`2026-10-03-admin-ui-list-write-design.md`) §2 결정 ③(he-tree 필수 peer) · §4-3 `useWriteFlow`, PR #3c 스펙(`2026-10-06-admin-ui-sessions-passwords-design.md`) §4-6(`useSessions` 모양) · §11, `docs/phase0-reports/fe-pages.md` §1-D · §2-2 · §3 · §4, `be-modules.md`

## 1. 목표

팀 화면의 공통 부분을 패키지에 넣는다. 3열 배치(트리 · 인원 · 사용자 폼)와 사용자 폼은 템플릿(B)에 남긴다.

- admin-shared 에 팀 스키마와 트리 순수 함수(정렬 · 평탄화 · 검색 · 이동 계산)를 먼저 둔다. Phase 2 서버와 admin-ui 가 같은 모양 · 같은 계산을 본다.
- admin-ui 에 `TeamTree`(표시 · 이벤트, he-tree 위) · `useTeamTree`(조회 · 쓰기 흐름) · `TeamMoveDialog`(옮기기) · `TeamUserList`(2열 인원 목록)를 넣는다.

새 peer 의존: **`@he-tree/vue` `^2.10.5`(필수)** — 3a 결정 ③ 그대로.

## 2. 결정

### 2-1. 3d 경계 결정 (2026-10-06 · 07)

결정 문서(HTML)로 고른 뒤 설계 절마다 승인받았다.

| 결정                      | 확정                                                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① 트리 바탕               | **R1** — he-tree 하나로 그린다. 드래그는 켜는 옵션(`draggable`, 기본 꺼짐 = hangang 동작: ↑↓ 버튼, 형제 순서만)                                                         |
| ② 상위 팀 변경            | **P2** — 드래그 모드뿐 아니라 버튼 모드에도 "옮기기" 대화상자(새 상위 팀을 고르면 그 아래 맨 끝). 권장안 P1(드래그에서만)에서 바꿈                                      |
| ③ 드래그 이동 확정        | **M1** — 킷이 확인 → 저장 → 원위치. **확인은 상위 팀이 바뀔 때만**, 같은 상위 팀 안의 순서 바꾸기는 ↑↓ 처럼 바로 저장(설계 ③ 검토에서 추가 승인)                        |
| ④ 키보드 이동(Alt+화살표) | **K1** — 막는다. 키보드 사용자는 ↑↓ 버튼 · 옮기기 대화상자로                                                                                                            |
| ⑤ 이동 값 계약            | **O3** — 기준 형제 번호 `{ teamNo, parentTeamNo, beforeTeamNo }`(`beforeTeamNo: null` = 맨 끝). 서버가 `displayOrder` 를 계산한다. 권장안 O1(자리 값)에서 바꿈          |
| ⑥ 삭제 수단               | **X1** — 행 메뉴 + `ConfirmDialog`. 휴지통 드롭존 없음                                                                                                                  |
| ⑦ 화면 흐름               | **U2 수정** — `TeamTree` + `useTeamTree`. 만들기 · 이름 바꾸기는 대화상자가 아니라 **노드 안 입력칸**, 입력칸 **바깥을 누르면 저장**(axion · crm). 권장안 U1에서 바꿈   |
| ⑧ 2열 사용자 목록         | **L1** — `TeamUserList` 를 킷에(`load` 어댑터 + `#item` 슬롯). 100명이 넘으면 **스크롤하면 자동으로 다음 쪽**, 목록 위에는 **총계만**("총 130명")(설계 ⑤ 검토에서 정함) |
| 릴리스                    | changeset minor. 새 필수 peer 설치가 소비자가 할 일                                                                                                                     |

### 2-2. 3d 설계 결정

| #   | 결정                                                                                                                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 🔴 **순서 규칙은 하나다.** 형제는 `displayOrder` 오름차순, 같은 값이면 받은 순서. 이 정렬은 `sortTeamTree()` 하나가 하고 트리 표시 · 평탄화 · 이동 계산이 모두 그 결과를 쓴다. hangang 은 트리는 서버 순서를 믿고 페이지는 다시 정렬하는 두 갈래라, 보이는 이웃과 계산에 쓰는 이웃이 어긋날 여지가 있었다                                 |
| D2  | 🔴 `TeamTree` 는 `nodes` 를 고치지 않는다. he-tree 에는 정렬한 **내부 사본**을 넘긴다 — he-tree 는 끌어 놓을 때 받은 배열을 제자리에서 바꾼다(`updateBehavior: 'modify'`). 드래그 원위치는 사본을 `nodes` 에서 다시 만드는 것이다(서버 재조회 불필요)                                                                                     |
| D3  | 펼침 상태는 **접은 팀 번호 집합**으로 컴포넌트가 기억한다. he-tree 는 배열이 바뀌면 펼침을 처음(모두 펼침)으로 되돌리므로, 재조회 · 원위치 뒤에도 접은 팀이 접힌 채 남게 한다                                                                                                                                                             |
| D4  | 노드 안 입력칸의 상태(`edit` — 대상 · 이름 · 저장 중 · 오류)는 `useTeamTree` 가 가진다. 그래서 재조회로 트리가 다시 그려져도 친 글자 · 오류가 남는다                                                                                                                                                                                      |
| D5  | 🔴 입력칸 바깥 누르기 = 저장(⑦)의 함정 넷을 막는다. ① ✓ · ✕ 는 누를 때 입력칸 포커스를 빼앗지 않는다(빼앗으면 ✕ 를 누르는 순간 저장이 먼저 돈다). ② Esc 로 취소해 입력칸이 사라질 때의 포커스 빠짐은 무시한다. ③ 창 자체가 포커스를 잃은 경우(`document.hasFocus()` 거짓 — Alt+Tab)는 저장하지 않는다. ④ 저장 중에는 다시 저장하지 않는다 |
| D6  | 🔴 입력칸 · 행 버튼 묶음의 키 입력은 트리로 올려 보내지 않는다. he-tree 루트가 Space · Enter · 방향키를 `preventDefault` 해서 입력칸에서 공백이 안 먹고 버튼이 Enter 로 안 눌린다(axion `TeamTreeNode.vue` 가 겪음)                                                                                                                       |
| D7  | 🔴 Alt+화살표는 트리 감싸개가 캡처 단계에서 가로챈다(④ K1). he-tree 2.10 의 키보드 이동은 `eachDraggable` · `eachDroppable` 을 검사하지 않고 `after-drop` 도 내지 않아 확인과 "못 옮기는 팀" 잠금을 건너뛴다(조사 실험으로 확인)                                                                                                          |
| D8  | 드래그 확정은 실제로 옮겨졌을 때만 오는 he-tree `change` 에서 한다. 놓은 뒤 내부 사본에서 그 팀의 자리(`findTeamPlacement`)를 읽어 이동 요청을 만든다. 제자리면 아무것도 내지 않는다(axion 은 `after-drop` 을 써서 제자리에서도 확인창을 띄웠다)                                                                                          |
| D9  | 검색어가 있는 동안은 순서 이동(↑↓ · 드래그)을 잠근다. 걸러진 화면에서 숨은 형제와 자리가 바뀌는 사고를 막는다(hangang 은 막지 않았다). 만들기 · 이름 바꾸기 · 삭제 · 옮기기는 그대로                                                                                                                                                      |
| D10 | 요청이 실제로 나갔으면 성공 · 실패 모두 재조회한다(이름 중복은 "목록이 낡았다"는 뜻일 수 있다 — hangang). 관문 취소 · 진행 중 막힘이면 재조회하지 않는다(3c D6 과 같음)                                                                                                                                                                   |
| D11 | 입력칸 저장 실패는 입력칸 아래에 보인다 — 어댑터 호출을 감싸 `ApiError` 를 잡는 즉시 `handled = true`(3a 규약: 지연 전역 토스트보다 먼저)로 표시하고 문구를 `edit.error` 에 넣은 뒤 다시 던진다. 삭제 · 이동 실패는 `useWriteFlow` 기본대로 전역 토스트(서버 `message`)                                                                   |
| D12 | 어댑터를 주지 않은 동작은 생기지 않는다(3c ④-A1 과 같은 규칙). 트리에 넘기는 판정은 "어댑터 있음 && 소비자 `canAct`" 다                                                                                                                                                                                                                   |
| D13 | 새로 만든 팀을 저절로 고르지 않는다(hangang) — 2열 · 3열이 갑자기 바뀌지 않게. 재조회 뒤 고른 팀이 트리에 없으면 선택을 해제한다(다른 관리자가 지운 경우 포함 — hangang 은 자기가 지운 뒤에만 했다)                                                                                                                                       |
| D14 | he-tree 의 노드 상태 타입(`Stat`, `@he-tree/tree-utils`)을 공개 타입에 내보내지 않는다 — alpha 패키지이고 pnpm 엄격 설치에서 소비자 typecheck 가 그 타입을 못 찾는다. `@he-tree/tree-utils` 는 의존으로 들이지 않는다                                                                                                                     |
| D15 | he-tree CSS 는 소비자가 import 하지 않는다. 필요한 규칙(트리 선 · 끌 때 자리 표시 · 화면 낭독기용 숨김 글자 · 포커스)만 `TeamTree.vue` `<style scoped>`(`:deep`)로 옮기고 색은 Vuetify 토큰을 쓴다 — `dist/style.css` 에 모인다(킷 규약: 전역 CSS 를 import 하지 않는다)                                                                  |
| D16 | `TeamUserList` 는 쪽 나눔으로 받는다(`page` · `itemsPerPage`, 킷 목록 규약). 목록 끝의 "더 불러오기" 는 **진짜 버튼**이고, 그것이 화면에 들어오면(IntersectionObserver) 저절로 눌린다 — 무한 스크롤에서 키보드 · 화면 낭독기 사용자가 갇히지 않게, happy-dom 에서는 버튼으로 시험할 수 있게                                               |

## 3. 정본과 흡수 목록

| 산출물                | 정본                                                                                            | 흡수할 것                                                                                                                                                                       | 버릴 것                                                                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 팀 스키마 · 트리 함수 | hangang `teams-messages.ts`(`flattenTeamTree` · `indentTeamName`) + axion `flattenTeams`        | 깊이 우선 평탄화 · 하위 팀 수 · 앞뒤 형제, U+3000 들여쓰기(코드포인트 고정), 부모 포함 검색(R17), 이름 64자                                                                     | 단일 루트 전제(`root \| null`), 형제 순서 값 계산(→ O3 기준 형제 번호)                                                                                                                    |
| `TeamTree`            | hangang `components/org/TeamTree.vue`(규칙) + axion `TeamTree.vue` · `TeamTreeNode.vue`(드래그) | hangang: emit 전용 · 두 겹 잠금 · 선택은 읽기 · `@click.stop` · 부모 포함 검색. axion: he-tree 설정 · 드롭 시점 좌표 · 확인 · 원위치 · 편집 중 검색 끔 · 입력칸 `@keydown.stop` | hangang 의 VList 평탄화 렌더 · `data-team-*` 속성 · 하드코딩 색. axion 의 컴포넌트 안 API 호출 · `-1n` 임시 번호 · 휴지통 드롭존 · 정지/칩 도메인. crm 전체(즉시 저장 · 필터 사본 드래그) |
| `useTeamTree`         | hangang `pages/org/teams.vue` 의 흐름                                                           | 응답 경합 · 쓰기 한 곳 · 실패해도 재조회 · 삭제 뒤 선택 해제 · 실패 문구를 재조회 뒤에 세움 · 재인증 없음                                                                       | 페이지에 흩어진 상태, `AxiosError` 판정(→ `ApiError`), `VAlert` 알림(→ `onDone` · 전역 토스트), 생성 · 개명 대화상자(→ ⑦ 노드 안 입력칸)                                                  |
| `TeamMoveDialog`      | hangang `teams.vue` 생성 대화상자의 상위 팀 고르기                                              | 들여쓴 조직도 순서 선택지 · 값 수동 초기화(지연 마운트)                                                                                                                         | —                                                                                                                                                                                         |
| `TeamUserList`        | hangang `components/org/TeamUserList.vue`(테스트 20건)                                          | ID 검색(제출 때만) · 하위 팀 포함 · 팀 바뀌면 선택 해제 · 응답 경합 · `reload` 노출 · bigint `total`                                                                            | API 직접 호출(→ `load`), 고정 행 모양(→ `#item`), "사용자 추가" 버튼(→ `#bottom`), 100명 절단(→ D16)                                                                                      |

## 4. 공개 API

### 4-1. admin-shared 팀 스키마 (`src/teams.ts`)

```ts
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

/** 이동 요청(⑤ O3). beforeTeamNo: null = 그 상위 팀 아래 맨 끝 */
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

- `AdminTeamNode` 는 재귀 추론 대신 인터페이스로 적는다(공개 타입을 읽기 쉽게). 스키마가 그 인터페이스를 만족하는지는 타입 테스트로 잡는다.
- 이 스키마들에 `.refine()` 을 걸지 않는다(3b §11 R1 — `.omit()` 이 깨진다).

### 4-2. admin-shared 트리 함수 (`src/team-tree.ts`)

```ts
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
  /** 들여쓴 표시 이름(`indentTeamName`). 최상위면 '최상위' */
  title: string
  depth: number
}

export function sortTeamTree(nodes: readonly AdminTeamNode[]): AdminTeamNode[]
export function flattenTeamTree(nodes: readonly AdminTeamNode[]): TeamTreeRow[]
export function filterTeamTree(nodes: readonly AdminTeamNode[], query: string): AdminTeamNode[]
export function findTeamPlacement(
  nodes: readonly AdminTeamNode[],
  teamNo: bigint,
): { parentTeamNo: bigint | null; beforeTeamNo: bigint | null } | null
export function siblingMove(
  nodes: readonly AdminTeamNode[],
  teamNo: bigint,
  direction: 'up' | 'down',
): AdminTeamMove | null
export function moveTargets(
  nodes: readonly AdminTeamNode[],
  teamNo: bigint,
  options?: { topLevel?: boolean; canReceive?: (node: AdminTeamNode) => boolean },
): TeamMoveTarget[]
export function toDisplayOrderMove(
  nodes: readonly AdminTeamNode[],
  move: AdminTeamMove,
): { parentTeamNo?: bigint; displayOrder: number } | null
export const TEAM_INDENT_UNIT = '　'
export const TEAM_BRANCH_MARK = '└ '
export function indentTeamName(teamName: string, depth: number): string
```

1. **`sortTeamTree`** — 모든 단계의 형제를 `displayOrder` 오름차순(같으면 받은 순서)으로 정렬한 **사본**. 입력을 바꾸지 않는다(D1).
2. **`flattenTeamTree`** — `sortTeamTree` 결과를 깊이 우선으로 펼친다. 루트가 여럿이면 차례로. 빈 배열이면 `[]`.
3. **`filterTeamTree`** — 앞뒤 공백을 지우고 대소문자를 무시한 부분 일치. 결과는 "일치한 팀 + 그 조상"의 정렬된 사본. 🔴 부모가 일치해도 일치하지 않은 자식은 따라오지 않는다(hangang R17 — 계약은 "그 노드와 그 조상"이지 "그 노드의 후손 전부"가 아니다). 빈 검색어면 `sortTeamTree(nodes)`.
4. **`findTeamPlacement`** — 그 팀의 지금 자리: 상위 팀 번호(최상위면 `null`)와 바로 뒤 형제 번호(막내면 `null`). 순서는 **주어진 배열 순서 그대로**(정렬하지 않는다 — 드래그로 바뀐 내부 사본의 자리를 읽는 함수다). 없으면 `null`.
5. **`siblingMove`** — 정렬 기준. `up`: 바로 앞 형제 앞으로(`beforeTeamNo` = 앞 형제). `down`: 바로 뒤 형제 뒤로(`beforeTeamNo` = 그다음 형제, 없으면 `null`). 첫째의 `up` · 막내의 `down` · 없는 번호는 `null`. `parentTeamNo` 는 지금 상위 팀 그대로.
6. **`moveTargets`** — "옮기기" 선택지. 조직도 순서(`flattenTeamTree`). 🔴 자기 자신 · 자기 하위 팀(순환) · 지금 상위 팀 · `canReceive` 가 거짓인 팀을 뺀다. `topLevel: true` 이고 그 팀이 최상위가 아니면 맨 앞에 `{ parentTeamNo: null, title: '최상위' }`.
7. **`toDisplayOrderMove`** — O3 요청을 hangang 서버 규칙(형제 순서 값, 빈 번호 허용, 이웃 값으로 보내면 정확히 한 칸)으로 바꾼다. 정렬 기준.
   - 같은 상위 팀: 제자리(`beforeTeamNo` 가 지금 바로 뒤 형제)면 `null`. `beforeTeamNo` 가 자기보다 앞이면 그 형제의 값, 뒤면 그 형제 바로 앞 형제의 값, `null` 이면 막내의 값. `parentTeamNo` 키를 싣지 않는다(hangang: 생략 = 순서만).
   - 다른 상위 팀: `beforeTeamNo` 의 값, `null` 이면 새 형제 중 최댓값 + 1(형제가 없으면 0). `parentTeamNo` 를 싣는다.
   - 없는 팀 · 그 상위 팀의 자식이 아닌 `beforeTeamNo` · `parentTeamNo: null` 로 상위 팀을 바꾸는 요청(hangang 은 최상위를 표현 못 함)은 `Error` 를 던진다 — 킷 이벤트가 만들지 않는 값이라 소비자 결함이다.
8. **`indentTeamName`** — hangang 그대로. `depth <= 0` 이면 이름, 아니면 `U+3000 × (depth − 1)` + `└ ` + 이름. 🔴 U+0020 은 HTML 공백 접기로 깊이 3 과 7 이 같아진다.

### 4-3. `TeamTree`

```ts
export type TeamAction = 'addChild' | 'rename' | 'remove' | 'move'

export type TeamEdit =
  | { kind: 'rename'; teamNo: bigint; name: string; pending: boolean; error: string | null }
  | {
      kind: 'create'
      parentTeamNo: bigint | null
      name: string
      pending: boolean
      error: string | null
    }

export type TeamEditTarget =
  { kind: 'rename'; teamNo: bigint } | { kind: 'create'; parentTeamNo: bigint | null }

export interface TeamTreeMessages {
  treeLabel: string // '팀 트리'
  searchLabel: string // '팀 검색'
  empty: string // '팀이 없습니다.'
  noResult: string // '검색 결과가 없습니다.'
  loadFailed: string // '팀을 불러오지 못했습니다.'
  retry: string // '다시 시도'
  up: (teamName: string) => string // '「영업1팀」 위로'
  down: (teamName: string) => string // '「영업1팀」 아래로'
  menu: (teamName: string) => string // '「영업1팀」 메뉴'
  toggle: (teamName: string, open: boolean) => string // '「영업1팀」 접기' · '펼치기'
  addChild: string // '하위 팀 추가'
  rename: string // '이름 바꾸기'
  reparent: string // '옮기기'
  remove: string // '삭제'
  nameInput: string // '팀 이름'
  save: string // '저장'
  cancel: string // '취소'
}
```

| prop · 모델 · 이벤트 · 슬롯                                   | 내용                                                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `nodes`                                                       | `readonly AdminTeamNode[]`. 고치지 않는다(D2)                                 |
| `v-model`(`modelValue`)                                       | 고른 팀 `bigint \| null`. 기본 `null`                                         |
| `canWrite`                                                    | 기본 `false`(권한 가드 fail-closed 규약)                                      |
| `busy` · `loading` · `loadFailed`                             | 기본 `false`                                                                  |
| `draggable`                                                   | 기본 `false`                                                                  |
| `showOrderButtons`                                            | 행의 ↑↓ 버튼. 기본 `true`(§11 R13)                                            |
| `topLevel`                                                    | 최상위 사이에 놓기 · 최상위 초안 행. 기본 `false`                             |
| `canAct?(node, action)`                                       | 메서드 꼴. 기본 모두 허용                                                     |
| `edit`                                                        | `TeamEdit \| null`. 기본 `null`                                               |
| `resetKey`                                                    | 숫자. 바뀌면 내부 사본을 `nodes` 에서 다시 만든다(드래그 원위치 신호). 기본 0 |
| `messages?`                                                   | `Partial<TeamTreeMessages>`                                                   |
| `@move(move, source)`                                         | `AdminTeamMove`, `'button' \| 'drag'`                                         |
| `@reparent(teamNo)` · `@remove(teamNo)`                       | 메뉴의 옮기기 · 삭제. 확인 · 대화상자는 부모                                  |
| `@edit-start(target)`                                         | `TeamEditTarget`                                                              |
| `@edit-input(name)` · `@edit-commit(source)` · `@edit-cancel` | `source`: `'enter' \| 'button' \| 'blur'`                                     |
| `@reload`                                                     | 조회 실패 자리의 다시 시도                                                    |
| `#badge="{ node }"`                                           | 이름 옆 칩 자리(axion 의 정지 · 전용 같은 것)                                 |

#### 4-3-1. 동작 계약

1. **그리기.** he-tree `Draggable`(가상 스크롤 끔, `defaultOpen`). 모델은 `sortTeamTree(nodes)` 의 사본 — 검색어가 있으면 `filterTeamTree(nodes, query)`. `role="tree"` · `treeitem` · `aria-level` 은 he-tree 가 단다. 트리 이름은 `messages.treeLabel`, he-tree `i18n` 안내 문구는 한국어로.
2. **행.** `[펼침] 이름 [#badge] … ↑ ↓ ⋮`. ⋮ 메뉴는 하위 팀 추가 · 이름 바꾸기 · 옮기기 · 삭제. 버튼 접근 이름에 팀 이름을 넣는다(hangang 은 모든 행이 같은 라벨이었다). Vuetify 컴포넌트는 `vuetify/components` 에서 명시 import.
3. 🔴 **잠금.** `locked = !canWrite || busy || edit != null`. 잠기면 쓰기 버튼 전부 `:disabled` 이고 **핸들러 첫 줄도 다시 본다**(hangang — `:disabled` 는 마우스만 막는다). **선택은 잠그지 않는다**(읽기 동작).
4. **가장자리 · 판정.** `siblingMove` 가 `null` 이면 그 방향 버튼 비활성. `canAct(node, 'move')` 가 거짓이면 ↑↓ · 옮기기 · 드래그 없음, `'addChild'` · `'rename'` · `'remove'` 는 각 메뉴 항목. 옮기기는 선택지가 없으면 비활성.
5. **검색.** 위쪽 `VTextField`(`name="teamSearch"`), 화면에서만 거른다. 검색어가 있으면 결과 전부 펼침, ↑↓ · 드래그 잠금(D9). 빈 상태 `empty` / `noResult`.
6. **펼침.** 접은 팀 번호를 기억해 `nodes` · `resetKey` 가 바뀌어도 유지(D3).
7. **조회 상태.** `loading` 이면 위에 진행 막대. `loadFailed` 이고 트리가 비었으면 그 자리에 `loadFailed` 문구 + 다시 시도(`@reload`), 트리가 있으면 위에 한 줄.
8. **노드 안 입력칸.** `edit` 가 있으면 — `rename` 은 그 행 이름 자리, `create` 는 상위 팀을 펼친 뒤 맨 끝의 **초안 행**(최상위면 루트 목록 맨 끝). 입력칸(`name="teamName"`, 글자 수 표시) + ✓ + ✕, 오류는 그 아래. 열릴 때 포커스(이름 바꾸기는 전체 선택). 저장 중이면 입력칸 `readonly` · ✓ `:loading` + `:disabled` · ✕ `:disabled`. 키: Enter → `edit-commit('enter')`, Esc → `edit-cancel`, ✓ → `edit-commit('button')`, 바깥 누르기 → `edit-commit('blur')`(D5 의 네 함정 제외). 입력칸 · 버튼 묶음의 키는 트리로 안 올린다(D6). 입력칸이 열려 있으면 드래그 꺼짐.
9. **드래그.** `draggable && !locked && 검색어 없음` 일 때 켜진다. `eachDraggable` = `canAct(node, 'move')`. `eachDroppable`(그 팀 아래로 넣을 수 있는가) = 그 팀이 끄는 팀의 지금 상위 팀이거나(같은 상위 팀 안 순서 바꾸기) `canAct(그 팀, 'addChild')`. `rootDroppable` = `topLevel` 이거나 끄는 팀이 최상위 팀(최상위 형제끼리 순서 바꾸기, R4). `change` 에서 끈 팀의 `findTeamPlacement` 를 읽어 지금 자리와 다르면 `@move({ teamNo, parentTeamNo, beforeTeamNo }, 'drag')`, 같으면 아무것도 안 낸다(D8).
10. 🔴 **Alt+화살표.** 감싸개의 `keydown` 캡처에서 `altKey` + 화살표면 `preventDefault` · `stopPropagation`(D7).

### 4-4. `useTeamTree`

```ts
export type TeamDoneAction = 'create' | 'rename' | 'remove' | 'move' | 'reparent'

export interface TeamDoneEvent {
  action: TeamDoneAction
  /** create 응답에 번호가 없으면 null */
  teamNo: bigint | null
  teamName: string
  /** 기본 문구(§4-4-1) — 화면이 그대로 토스트로 띄우면 된다 */
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
  onMove: (move: AdminTeamMove, source: 'button' | 'drag') => void
  onReparent: (teamNo: bigint) => void
  onRemove: (teamNo: bigint) => void
  onEditStart: (target: TeamEditTarget) => void
  onEditInput: (name: string) => void
  onEditCommit: (source: 'enter' | 'button' | 'blur') => void
  onEditCancel: () => void
  onReload: () => void
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

export function useTeamTree(options: UseTeamTreeOptions): TeamTreeController
```

setup 안에서 부른다. 쓰기는 `useWriteFlow()` 하나를 쓴다(진행 중 잠금 · 확인 관문 · 오류 분류).

#### 4-4-1. 기본 문구

| 키              | 기본                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `created`       | 「{팀}」을(를) 만들었습니다.                                                                                                        |
| `renamed`       | 팀 이름을 「{팀}」(으)로 바꿨습니다.                                                                                                |
| `removed`       | 「{팀}」을(를) 지웠습니다.                                                                                                          |
| `moved`         | 「{팀}」의 순서를 바꿨습니다.                                                                                                       |
| `reparented`    | 「{팀}」을(를) 「{상위}」 아래로 옮겼습니다. · 상위가 null 이면 「{팀}」을(를) 최상위로 옮겼습니다.                                 |
| `removeConfirm` | 팀 삭제 · 「{팀}」을(를) 지웁니다. / 「{팀}」과(와) 그 아래 팀 {n}개를 함께 지웁니다. + 소속 계정이 있으면 지울 수 없습니다. · 삭제 |
| `moveConfirm`   | 팀 옮기기 · 「{팀}」을(를) 「{상위}」 아래로 옮깁니다. 하위 팀과 소속 인원이 함께 옮겨집니다. · 옮기기                              |
| `nameRequired`  | 팀 이름을 입력하세요.                                                                                                               |
| `nameTooLong`   | 팀 이름은 {max}자 이하로 정하세요.                                                                                                  |
| `saveFailed`    | 저장하지 못했습니다. (서버 문구가 비었을 때)                                                                                        |

조사는 hangang 처럼 `을(를)` · `과(와)` · `(으)로` 로 쓴다.

#### 4-4-2. 동작 계약

1. **조회.** 🔴 순번으로 늦게 온 옛 응답을 버린다(쓰기 뒤 재조회와 첫 조회가 겹치면 먼저 보낸 느린 응답이 나중에 와서 이긴다 — gise · hangang). 실패하면 `nodes` 를 두고 `loadError` 를 채운다(다음 조회 시작에 비움). 바인딩의 `loadFailed = loadError != null`.
2. **조회 뒤 정리.** 고른 팀이 트리에 없으면 `selected = null`(D13). `edit` 의 대상(이름 바꾸던 팀 · 하위 팀을 붙이던 상위 팀)이 없으면 `edit = null`.
3. **바쁨.** `busy = loading || submitting`.
4. **판정.** 바인딩 `canWrite = canWrite()`, `canAct(node, a) = 어댑터 있음(a) && (options.canAct?.(node, a) ?? true)` — `addChild` ↔ `create`, `rename` ↔ `rename`, `remove` ↔ `remove`, `move` ↔ `move`(D12). 각 동작 핸들러 첫 줄에서 `canWrite()` · 판정을 **다시** 부른다.
5. **동작별 흐름**(D10 — 요청이 나갔으면 성공 · 실패 모두 재조회, 관문 취소면 재조회 없음):

   | 동작                    | 관문                                              | 요청                         | 성공                                          | 실패                                     |
   | ----------------------- | ------------------------------------------------- | ---------------------------- | --------------------------------------------- | ---------------------------------------- |
   | ↑↓ (`move`, `'button'`) | 없음                                              | `move`                       | 재조회 · `onDone(move)`                       | 재조회 · 전역 토스트                     |
   | 드래그 · 같은 상위 팀   | 없음                                              | `move`                       | 재조회 · `onDone(move)`                       | `resetKey++` · 재조회 · 전역 토스트      |
   | 드래그 · 다른 상위 팀   | `confirm` · `reversible: true` · `moveConfirm`    | `move`                       | 재조회 · `onDone(reparent)`                   | `resetKey++` · 재조회 · 전역 토스트      |
   | 옮기기 대화상자         | 없음(대화상자가 곧 확인)                          | `move`(`beforeTeamNo: null`) | 대화상자 닫기 · 재조회 · `onDone(reparent)`   | 대화상자 닫기 · 재조회 · 전역 토스트     |
   | 하위 팀 추가            | 없음                                              | `create`                     | `edit = null` · 재조회 · `onDone(create)`     | 재조회 · `edit` 유지 + `edit.error`(D11) |
   | 이름 바꾸기             | 없음                                              | `rename`                     | `edit = null` · 재조회 · `onDone(rename)`     | 재조회 · `edit` 유지 + `edit.error`(D11) |
   | 삭제                    | `confirm` · `reversible: false` · `removeConfirm` | `remove`                     | 재조회 · `onDone(remove)`(선택은 2.에서 정리) | 재조회 · 전역 토스트(409 는 서버 문구)   |

   드래그 · 다른 상위 팀에서 확인을 취소(취소 · Esc)하면 `resetKey++` 만 하고 요청 · 재조회는 없다.

6. **입력칸.** `edit-start` → 다른 입력칸이 열려 있거나 잠겨 있으면 무시, 아니면 `edit` 를 연다(이름 바꾸기는 지금 이름, 만들기는 빈 이름). `edit-input` → `edit.name`. `edit-commit(source)`:
   - 저장 중이면 무시.
   - 이름(앞뒤 공백 제거)이 그대로(이름 바꾸기)면 요청 없이 닫는다.
   - 비었으면 — `source === 'blur'` 면 요청 없이 닫고(초안은 치움), 아니면 `edit.error = nameRequired`.
   - 64자를 넘으면 `edit.error = nameTooLong(64)`.
   - 아니면 `edit.pending = true` 로 요청(5.의 표). 실패 문구는 `toFieldErrors(error).teamName?.[0]` → `error.message` → `saveFailed` 순.
   - `edit-cancel` → 저장 중이 아니면 `edit = null`.
7. **옮기기 대화상자.** `reparent(teamNo)` → 대화상자 열기. 선택지 `moveTargets(nodes, teamNo, { topLevel, canReceive: (n) => canAct(n, 'addChild') })`. 확정 → `move({ teamNo, parentTeamNo, beforeTeamNo: null })`.
8. **권한.** `canWrite()` 가 거짓이면 모든 동작이 요청 없이 끝난다.

### 4-5. `TeamMoveDialog`

| prop · 모델 · 이벤트     | 내용                               |
| ------------------------ | ---------------------------------- |
| `v-model`(`modelValue`)  | 열림                               |
| `teamName`               | 옮길 팀 이름(제목 「{팀}」 옮기기) |
| `targets`                | `readonly TeamMoveTarget[]`        |
| `submitting`             | 기본 `false`                       |
| `@confirm(parentTeamNo)` | `bigint \| null`                   |

1. `BaseDialog` persistent(바깥 누르기 · Esc 로 닫히지 않음). 본문: "고른 팀 아래 맨 끝으로 옮깁니다. 하위 팀과 소속 인원이 함께 옮겨집니다." + 상위 팀 고르기(`VAutocomplete`, `name="parentTeamNo"`, 들여쓴 `title` 로 보이고 원래 `teamName` 으로 검색).
2. 🔴 최상위 선택지는 `null` 값 대신 내부 키로 구분한다 — Vuetify 선택 상자는 `null` 을 "고르지 않음"으로 본다.
3. 🔴 열릴 때마다 고른 값 · 검색어를 비운다(`VDialog` 지연 마운트라 setup 상태가 남는다 — hangang).
4. 옮기기 버튼은 고르기 전 비활성, 제출 중 `:loading` + `:disabled`. 제출 중에는 취소도 잠근다.

`TeamMoveDialogBindings` 는 위 props 와 `'onUpdate:modelValue'` · `onConfirm`.

### 4-6. `TeamUserList`

```ts
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
  searchLabel: string // 'ID 검색'
  searchButton: string // '검색'
  recursiveLabel: string // '하위 팀 포함'
  noTeam: string // '팀을 고르면 인원이 보입니다.'
  empty: string // '인원이 없습니다.'
  emptyFiltered: string // '맞는 인원이 없습니다.'
  total: (total: number) => string // '총 130명'
  loadMore: (rest: number) => string // '더 불러오기(30명 남음)'
  loadMoreFailed: string // '더 불러오지 못했습니다.'
  forbidden: string // '이 팀의 인원을 볼 권한이 없습니다. 권한을 가진 관리자에게 요청하세요.'
  loadFailed: string // '인원을 불러오지 못했습니다.'
  retry: string // '다시 시도'
}
```

`<script setup lang="ts" generic="R extends TeamUserRow">`.

| prop · 모델 · 슬롯 · expose  | 내용                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `teamNo`                     | `bigint \| null`                                                                     |
| `load(query)`                | `(TeamUserQuery) => Promise<TeamUserPage<R>>`                                        |
| `pageSize`                   | 기본 `ADMIN_LIST_MAX_PAGE_SIZE`(100)                                                 |
| `messages?`                  | `Partial<TeamUserListMessages>`. 서버가 이름 검색을 지원하면 `searchLabel` 을 바꾼다 |
| `v-model`(`modelValue`)      | 고른 `userNo`. 기본 `null`                                                           |
| `#item="{ item, selected }"` | 행 내용. 기본은 제목 `userName` · 부제 `userId`                                      |
| `#bottom`                    | 아래 고정 영역                                                                       |
| `reload()`                   | 같은 조건으로 첫 쪽부터 다시. 팀이 없으면 부르지 않는다. `modelValue` 는 그대로      |

#### 4-6-1. 동작 계약

1. **배치.** `PanelLayout` — `#top`: 검색 폼(`name="userId"`, 제출 때만) + 하위 팀 포함(`name="recursive"`, 팀이 없으면 비활성) + 문구 자리. 본문: 목록. `#bottom`: 슬롯.
2. **팀 없음.** `teamNo == null` 이면 요청 없이 `noTeam`(hangang — `recursive` 는 `teamNo` 와 짝이라 단독이면 서버가 둘 다 무시).
3. 🔴 **응답 경합.** 조회마다 순번. 첫 쪽 · 다음 쪽 · `reload()` 모두 같은 순번을 탄다 — 그사이 조건이 바뀌었으면 응답을 버린다.
4. **검색어.** 제출할 때만 적용한다. 하위 팀 포함 · 팀이 바뀔 때도 **마지막으로 제출한** 검색어를 쓴다(hangang 은 제출 안 한 글자가 섞여 나갔다). 팀이 바뀌어도 하위 팀 포함 · 적용된 검색어는 남는다(hangang 판정 M-2).
5. **선택 해제.** `teamNo` 가 실제로 바뀌면(첫 마운트 제외) 고른 사람이 있을 때 `update:modelValue(null)`.
6. **총계.** 위에 `total(Number(total))` 만("총 130명"). 받은 수는 보이지 않는다.
7. **다음 쪽.** 받은 수 < `total` 이고 마지막 쪽이 `pageSize` 만큼 찼으면 목록 끝에 `loadMore(남은 수)` 버튼. 그 버튼이 목록 스크롤 영역에 들어오면(IntersectionObserver, `rootMargin` 아래 120px) 저절로 다음 쪽(`page + 1`). 버튼은 키보드로도 누를 수 있고, 불러오는 중엔 `:loading` + `:disabled`. IntersectionObserver 가 없는 환경에선 버튼만.
8. **멈춤 · 겹침.** 받은 수 ≥ `total` 이거나 한 쪽이 `pageSize` 보다 적게 오면 끝. 쪽 사이에 같은 `userNo` 가 다시 오면 버린다.
9. **실패.** 첫 쪽 실패 — 목록을 비우고 `forbidden`(403) 또는 `loadFailed` + 다시 시도. 다음 쪽 실패 — 받은 사람은 두고 끝에 `loadMoreFailed` + 다시 시도, 다시 시도를 누를 때까지 자동 불러오기 멈춤. `ApiError` 는 `handled = true` 로 표시한다(전역 토스트와 겹치지 않게 — 3a 규약).
10. **읽기 전용.** 목록은 고르기만 한다. 편집 진입점은 3열 하나(hangang).

## 5. 의존성

- `@ssworks/admin-ui` `peerDependencies` 에 `"@he-tree/vue": "^2.10.5"`(필수), `devDependencies` 에 같은 판. `vite.config.ts` `external` 에 `/^@he-tree\/vue(\/.*)?$/`.
- `@he-tree/tree-utils` 는 들이지 않는다(D14). admin-shared 는 새 의존 없음.

## 6. 파일

| 파일                                                           | 내용                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `packages/admin-shared/src/teams.ts` · `teams.test.ts`         | §4-1                                                                     |
| `packages/admin-shared/src/team-tree.ts` · `team-tree.test.ts` | §4-2                                                                     |
| `packages/admin-shared/src/index.ts`                           | 내보내기                                                                 |
| `packages/admin-ui/src/components/team/team-tree.ts`           | `TeamAction` · `TeamEdit` · `TeamEditTarget` · `TeamTreeMessages` 기본값 |
| `packages/admin-ui/src/components/team/TeamTree.vue`           | §4-3                                                                     |
| `packages/admin-ui/src/components/team/TeamMoveDialog.vue`     | §4-5                                                                     |
| `packages/admin-ui/src/components/team/team-user-list.ts`      | `TeamUserRow` · `TeamUserQuery` · `TeamUserPage` · 문구 기본값           |
| `packages/admin-ui/src/components/team/TeamUserList.vue`       | §4-6                                                                     |
| `packages/admin-ui/src/composables/useTeamTree.ts`             | §4-4                                                                     |
| `packages/admin-ui/src/test/setup.ts`                          | `installIntersectionObserver()` 도우미(가짜, 손으로 교차 발화)           |
| `*.render.test.ts`(컴포넌트 · composable 옆)                   | §7                                                                       |
| `packages/admin-ui/src/index.ts`                               | "── 조직 ──" 절                                                          |
| `packages/admin-ui/package.json` · `vite.config.ts`            | §5                                                                       |
| `packages/admin-ui/README.md` · `.changeset/admin-ui-teams.md` | §8                                                                       |

## 7. 테스트 계약

- **admin-shared**
  - 스키마: 재귀 노드 · bigint · `parentTeamNo` / `beforeTeamNo` 의 `null` · `teamNameSchema` 앞뒤 공백 제거 · 1자 · 64자 · 65자 · `adminTeamMoveBodySchema` 에 `teamNo` 없음 · `AdminTeamNode` 인터페이스 ↔ 스키마 추론 타입 일치(타입 테스트).
  - `sortTeamTree`: 형제 뒤집힘 바로잡음, 같은 값이면 받은 순서, 입력 불변.
  - `flattenTeamTree`: 깊이 우선 순서 · 루트 여럿 · 빈 배열 · 상위 팀 번호/이름(루트 null) · 하위 팀 수 · 앞뒤 형제(가장자리 null).
  - `filterTeamTree`: 조상 따라옴 · 일치하지 않은 자식 안 따라옴 · 형제 둘 일치해도 부모 한 번 · 대소문자 · 앞뒤 공백 · 빈 검색어 · 아무것도 안 맞으면 `[]`.
  - `findTeamPlacement`: 주어진 순서 그대로(정렬 안 함) · 막내 · 최상위 · 없는 번호.
  - `siblingMove`: up · down(그다음 형제 · 끝이면 null) · 첫째 up · 막내 down · 없는 번호.
  - `moveTargets`: 자기 · 하위 팀 · 지금 상위 팀 · `canReceive` 거짓 제외 · 조직도 순서 · 들여쓰기 · `topLevel`(최상위인 팀엔 안 붙음).
  - `toDisplayOrderMove`: 빈 번호(0 · 5 · 9)에서 위 · 아래 · 맨 끝 · 제자리 null · 같은 상위 팀이면 `parentTeamNo` 키 없음 · 다른 상위 팀 앞/끝/빈 형제 · 오류 셋.
  - `indentTeamName`: U+3000 · U+2514 U+0020 코드포인트 고정 · 깊이 0 · 깊이별 구별.
- **`TeamTree`**(happy-dom, `installVisualViewport()`): `aria-level` 로 깊이 · 정렬된 순서 · `nodes` 불변 · 선택 emit(잠겨도) · 잠금 두 겹(`vm.$emit('click')` 로 `:disabled` 우회해도 emit 없음) · 가장자리 비활성 · `canAct` 별 메뉴 · 검색(부모 포함, ↑↓ 잠금) · 접은 팀이 `nodes` 교체 · `resetKey` 뒤에도 접힘 · 조회 실패 두 모양 · 입력칸(Enter · ✓ · 바깥 누르기 → commit 출처, ✕ · Esc → cancel 만, `document.hasFocus` 거짓이면 commit 없음, 저장 중 readonly, 실패 뒤 `nodes` 가 바뀌어도 글자 · 오류 유지, 초안 행 위치) · 입력칸 Space 가 트리로 안 감 · Alt+화살표에 `change` 없음 · 드래그(he-tree `change` 를 직접 내보내 — 제자리 무시, `@move(…, 'drag')`, `resetKey` 로 원위치). 마우스 합성 드래그는 쓰지 않는다(조사: 깨지기 쉽다).
- **`useTeamTree`**(실제 `TeamTree` · `ConfirmDialog` · `TeamMoveDialog` 를 붙인 렌더): §4-4-2 의 1~8 — 응답 경합 · 실패해도 `nodes` 유지 · 고른 팀 · 입력칸 대상 정리 · 흐름표 일곱 줄 각각(관문 · 요청 · 재조회 유무 · `onDone` 문구) · 확인 취소면 재조회 없음 + `resetKey` · 입력칸 오류는 `handled` + 토스트 없음 · 삭제 실패는 토스트 · `canWrite` 를 부를 때마다 평가(비반응 플래그) · 어댑터 없는 동작은 바인딩 판정이 거짓 · `topLevel` · `startCreate(null)`.
- **`TeamMoveDialog`**: 선택지 · 검색(원래 이름으로) · 최상위 선택이 `null` 로 나감 · 고르기 전 비활성 · 다시 열면 비워짐 · 제출 중 잠금.
- **`TeamUserList`**(가짜 IntersectionObserver): hangang 20건 이식 + 쪽 나눔(버튼 · 자동 · 멈춤 둘 · 겹침 제거 · 다음 쪽 경합 버림 · 다음 쪽 실패 유지 · 자동 멈춤 · 다시 시도) · 총계만 표시 · bigint `total` · 적용된 검색어만 · 403 구분 · `handled`.
- 테스트 전용 `data-testid` 를 심지 않는다 — 접근 이름 · 글자 · `name` 으로 찾는다.

## 8. 릴리스 · 문서

- changeset **minor**(admin-shared · admin-ui, `fixed` 묶음). 첫 줄에 **소비자가 할 일**: `pnpm add @he-tree/vue@^2.10.5`(새 필수 peer). 내용: 새 API(§4), 서버 계약(§9). 기존 API 동작은 바뀌지 않는다.
- README: API 표 행 + "## 조직" 절(템플릿 페이지 엮는 법 — Phase 2 서버 · hangang 형 서버 두 예, `toDisplayOrderMove` 어댑터, `TeamUserList` 쪽 나눔 어댑터).
- `CLAUDE.md` · `docs/HANDOFF.md` · `docs/01-phase0.md` §8 진행표 갱신(테스트 수는 `pnpm check` 결과).
- **플랜 Task 1 에서 먼저 확인할 위험**: ① he-tree 타입이 킷 tsconfig(`moduleResolution: Bundler`)에서 풀리는가 ② 제네릭 SFC(`TeamUserList`)의 선언이 `vite-plugin-dts` 로 빌드되는가 — 안 되면 `R = TeamUserRow` 고정으로 내리고 §11 에 적는다 ③ he-tree 가 happy-dom 에서 Vuetify 와 함께 렌더되는가.
- 끝에 `/smoke`: 패킹한 tarball 을 he-tree 와 함께 임시 Vite 앱에 설치해 typecheck · build.

## 9. Phase 2 서버 계약 (이 PR 에서 구현하지 않음)

| 요청                             | 본문                             | 응답 · 오류                                                                                                          |
| -------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `GET admin/teams/tree`           | —                                | `{ items: AdminTeamNode[] }`(루트 여럿, 없으면 `[]`)                                                                 |
| `POST admin/teams`               | `{ teamName, parentTeamNo }`     | `{ teamNo }` · 이름 중복 409 `ERR_DUPLICATE_TEAM_NAME` · 없는 상위 팀 404 `ERR_NO_TEAM`                              |
| `PATCH admin/teams/:teamNo`      | `{ teamName }`                   | `{}` · 이름 중복 409 · 없는 팀 404                                                                                   |
| `DELETE admin/teams/:teamNo`     | 없음                             | `{}` · 하위 팀째 지움 · 서브트리에 소속 계정이 있으면 409 `ERR_TEAM_HAS_MEMBERS`(행 잠금으로 세고 지움 — hangang A3) |
| `PATCH admin/teams/:teamNo/move` | `{ parentTeamNo, beforeTeamNo }` | `{}` · 서버가 `displayOrder` 를 계산                                                                                 |

- 이동 검사: `beforeTeamNo` 가 `parentTeamNo` 의 자식이 아니면 400 `ERR_COMMON_VALIDATION`. 🔴 `parentTeamNo` 가 자기 자신이거나 자기 하위 팀이면 400 `ERR_TEAM_MOVE_CYCLE`(hangang 에 없던 검사). `beforeTeamNo === teamNo` 도 400.
- 삭제 409 는 전용 코드로 나눈다 — hangang 의 `ERR_COMMON_CONFLICT` 는 뜻이 셋이라 화면이 서버 문구에 기댔다. 문구는 사람이 읽을 수 있게 싣는다(킷은 전역 토스트로 그대로 보인다).
- 이름 중복의 동시 요청은 DB UNIQUE 가 최종 방어선이고, 그 위반도 `ERR_DUPLICATE_TEAM_NAME` 으로 바꿔 낸다(hangang 은 `ERR_COMMON_DUPLICATED` 로 새어 나갔다).
- 재인증 · revision 은 없다(세 곳 모두 같음). 권한 키는 소비자 카탈로그가 정한다.
- 기존 서버는 `useTeamTree` 어댑터에서 맞춘다 — hangang: `tree` 결과 `{ item }` → `[item]`, 이동은 `toDisplayOrderMove`.

## 10. 비범위 · 보류

- 팀 고르기 대화상자(crm `TeamSelect` · `TeamSelectDialog`) — 다음 PR.
- 3열 사용자 폼 · 3열 페이지 조립 · 사용자 추가 흐름 — 템플릿(B).
- axion 정지 · 해제 · 칩 내용 — X. 칩 자리는 `#badge` 슬롯.
- Phase 2 서버 구현 — §9 계약만.
- 아주 큰 트리의 가상 스크롤(he-tree `virtualization` 끔).
- 체크박스 다중 선택 트리(crm `checkable`, 미완성).
- 열린 입력칸이 있을 때 페이지 이탈 경고 — 바깥 누르기가 저장이라 두지 않는다.
- 약관 편집기 — PR #3e.

## 11. 구현 중 정정 (2026-10-07)

- **R1 — vue-demi 빌드 스크립트를 `pnpm-workspace.yaml` 의 `allowBuilds: { vue-demi: false }` 로 거부했다.** he-tree 의 하위 의존 `vue-demi` 의 postinstall 을 pnpm 이 막고, pnpm 12 는 `install --frozen-lockfile` 이 종료 코드 1 로 끝난다. Vue 3 에서는 그 스크립트가 Vue 2 용 파일 전환뿐이라 거부해도 된다. 소비자도 같은 안내를 본다(README · changeset)(Task 1).
- **R2 — admin-shared 테스트는 `structuredClone` 을 쓰지 않는다.** admin-shared 의 tsconfig 는 `types: []` 와 ES 전용 lib 을 일부러 유지한다(프레임워크 무의존 가드). 불변성 시험은 새로 만든 트리와 비교한다(Task 3).
- **R3 — `TeamNameInput` (D5 · §4-3-1 #8).** ✓/✕ 는 포인터 전용(`tabindex="-1"`)이다. 키보드는 Enter 저장 · Esc 취소 · Tab 으로 나가면 blur 저장. 래퍼의 `mousedown` 하나가 입력칸 자신 외의 곳을 눌러도 포커스를 입력칸에 두고, 래퍼의 `keydown.stop` 이 편집 키를 he-tree 로 보내지 않는다. 저장 중에는 Esc · Enter 를 무시한다(묵은 "취소됨" 표시가 남아 뒤의 blur 가 저장하지 않던 문제). 계획했던 `rebuilding` 플래그는 뺐다 — Vue 는 요소를 지우기 전에 템플릿 ref 를 null 로 만들어, 다시 그리는 중의 blur 는 이미 `field == null || !isConnected` 가드에 걸린다(Task 4).
- **R4 — `rootDroppable` 은 `topLevel` 만이 아니라 `topLevel || (끄는 팀이 최상위)` 다(§4-3-1 #9).** `topLevel` 없이도 최상위 형제끼리 순서 바꾸기가 되어야 한다(Task 4).
- **R5 — `TeamMoveDialog` 는 열 때마다 선택과 함께 검색어도 Vuetify 의 `v-model:search` 로 비운다(§4-5 #3).** VAutocomplete 는 선택이 바뀔 때만 검색어를 비우고 그 밖에는 두기 때문이다(Task 5).
- **R6 — 옮겨 받기는 `addChild` 로 센다(§4-4 #4/#7), 곧 `create` 어댑터가 있어야 한다.** 대화상자의 대상 · ⋮ 옮기기 · 드래그가 같은 규칙을 쓴다. `move` 만 주고 `create` 를 안 준 소비자는 순서 바꾸기만 되고 상위 팀 변경은 안 된다(`최상위` 는 `topLevel` 만 따른다). 핸들러는 확정 · 확인 시점에 규칙을 다시 본다 — `confirmReparent` 는 제시된 대상일 것, `commitEdit` 은 rename/addChild 를 다시 확인, 상위 팀이 바뀌는 드래그는 받는 쪽을 다시 확인. 드래그 성공 뒤 이어지는 재조회가 적용되지 않으면 `resetKey` 를 올려, 트리가 컴포저블이 판정하는 `nodes` 와 같아지게 한다(Task 6).
- **R7 — `TeamUserList` 의 첫 쪽 불러오기 내부 함수는 `loadFirst` 다.** 지역 `load` 가 `load` prop 과 이름이 겹쳤다. 팀이 바뀌면 새 팀을 부르기 전에 앞 팀의 행을 치워, 불러오는 동안 다른 팀의 사용자를 고를 수 없다(Task 7).
- **R8 — `TeamTree` 의 행은 팀으로 키를 잡고(`node-key`), ↑↓ 로 옮긴 뒤엔 포커스가 옮긴 팀의 버튼으로 돌아온다.** he-tree 의 기본 키는 순서 번호라, 재조회 뒤 포커스가 있던 버튼(과 열린 ⋮ 메뉴)이 옆 팀의 것이 되었다(최종 리뷰, 2026-10-07).
- **R9 — 입력칸이 열려 있으면 검색창을 끈다.** §3 "편집 중 검색 끔" 을 이제 구현했다(2026-10-07).
- **R10 — 입력칸 저장의 `ApiError` 는 화면(scope)이 살아 있고, 같은 입력칸이 열려 있고, 상태 코드가 404 가 아닐 때만 처리됨으로 표시한다.** 보일 자리가 없으면 전역 토스트가 알린다. 화면이 사라진 뒤에는 재조회도 하지 않는다(2026-10-07).
- **R11 — Alt+화살표는 드래그가 켜진 동안만 가로챈다(D7 을 좁힘).** he-tree 는 드래그가 꺼져 있으면 그 키를 무시하고, 브라우저의 Alt+←/→(뒤로 · 앞으로)는 계속 동작해야 한다(2026-10-07).
- **R12 — 드래그 자리 표시(2026-10-08, 브라우저 확인 중 요청).** ① R8 의 행 키(`node-key`)가 he-tree 의 자리 표시(`placeholderData`, 빈 객체)를 팀으로 읽다가 던져, 끄는 동안 렌더가 멈추고 놓일 자리가 보이지 않았다 — 자리 표시는 따로 키를 준다. 기존 드래그 테스트는 `move()` 만 불러 자리 표시를 끼우지 않아 이것을 못 잡았다. 이제 he-tree 가 dragover 에서 하듯 `add(placeholderData)` 로 끼우는 도우미로 잰다. he-tree 는 자리 표시를 드롭 대상 후보 · `statHandler` 에서 이미 빼므로, 그것을 받는 킷 함수는 행 키 하나였다. ② 사용자 요청으로 he-tree `#placeholder` 슬롯에 끄는 팀의 행을 옅게(45%) 그린다 — 이름 · `#badge` · 하위 팀이 있으면 ▸(가지째 옮겨진다). 버튼은 없고 `aria-hidden` 이다(위치는 he-tree 의 화면 낭독기 안내가 알린다). 자리 표시 높이를 32px 에서 행 높이 36px 로 맞췄다(D15 의 옮긴 규칙). 도착 상위 팀 문구 · 받는 상위 팀 강조는 고르지 않았다.
- **R13 — `showOrderButtons`(기본 `true`) 로 행의 ↑↓ 를 숨긴다(2026-10-08, 브라우저 확인 중 요청).** 표시 옵션이라 `draggable` 처럼 `useTeamTree().tree` 바인딩에 넣지 않고 화면이 직접 붙인다. 끄면 ↑↓ 만 사라지고 ⋮ 메뉴 · 드래그는 그대로다. 🔴 대가: 형제 순서를 키보드로 바꿀 길이 없어진다 — Alt+화살표는 K1 로 막혀 있고 옮기기는 상위 팀 아래 맨 끝으로만 보낸다(§2-2 ④ 의 "키보드 사용자는 ↑↓ 버튼 · 옮기기" 가 깨진다). 숨기면 ⋮ 메뉴에 위로 · 아래로를 두는 안과 드래그를 켜면 저절로 숨기는 `'auto'` 안은 고르지 않았다 — 기본값이 지금과 같아 기존 화면은 바뀌지 않는다.
- **R14 — `TeamUserList` 의 목록(`VList`)은 줄어들지 않고 자기 스크롤을 갖지 않는다(D16 결함 수정, 2026-10-08 브라우저 확인 T14).** `VList` 는 Vuetify 기본 `overflow: auto` 라, 세로 flex 인 목록 칸(`PanelLayout` 안쪽) 안에서 줄어들어 스스로 스크롤 상자가 됐다(높이 471px · 내용 6256px). 그러면 끝의 "더 불러오기" 가 처음부터 관찰 기준(목록 칸) 안에 보여, 스크롤하기 전에 다음 쪽을 끝까지 차례로 다 불렀다 — 130명 팀은 눈에 안 띄지만 1,000명 팀이면 10쪽을 한꺼번에 부른다. `flex: none; overflow: visible` 로 스크롤을 목록 칸 한 곳에 모은다. 고친 뒤 헤드리스에서 스크롤 전 요청 `page=1` 한 번(100명), 끝까지 내리면 `page=2`(130명)를 쟀다. happy-dom 은 레이아웃을 못 재 기존 테스트(가짜 IntersectionObserver)가 놓쳤다 — 테스트는 그 규칙을 지닌 클래스만 잡는다.
- **R15 — `adminTeamNodeSchema` 의 타입을 `z.ZodType<AdminTeamNode>` 로 적는다(§4-1 보강, 2026-10-08 브라우저 확인 앱 빌드에서 발견).** §4-1 은 "인터페이스를 만족하는지는 타입 테스트로 잡는다" 했지만 그 테스트는 소스에서 돈다. 추론에 맡긴 재귀 스키마를 발행 d.ts 가 elided any 로 지워 `AdminTeamTree['items'][number]['children']` 이 `Record<string, unknown>[]` 가 됐고, README 의 `load: () => api.get<AdminTeamTree>(…).then((r) => r.items)` 가 소비자 앱(vue-tsc)에서 컴파일되지 않았다. admin-ui 는 admin-shared 를 `dist/` 로 읽으므로 admin-ui `team-types.test.ts`(typecheck)가 발행 d.ts 를 잰다. 노드 스키마는 `ZodType` 이 되어 `.extend()` 같은 객체 메서드가 없다 — 노드 모양을 넓히는 소비자는 인터페이스를 넓히고 스키마를 새로 쓴다.
