# admin-ui ringside 둘째 보고 반영(PR #3i) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ringside 가 킷 0.8.0 으로 찾은 일곱 항목 중 admin-ui 몫 다섯(R1 IP 층 `scopes` · R4 기본 문구 export · R5 세로 폼 간격 README · R6 재인증 안내 문단 · R7 기본 정렬 열 순환)을 admin-ui minor 로 반영한다.

**Architecture:** R7 은 `useServerTable` 의 정렬 보정 watch 가 직전 값을 받아, 기본 열에서 온 "정렬 없음"을 반대 방향으로 넘긴다. R1 은 `ip-access.ts` 에 순수 도우미 셋(`resolveIpScopes` · `defaultIpScope` · `scopeTypeItems(messages, scopes, current)`)을 두고 `useIpAccessRules` 가 `scopes` 옵션으로 층 선택지 · 새 폼 기본 층 · 폼 갱신 가드를 정한다. R4 는 기본 문구 객체 여덟과 `CORE_AUDIT_ACTION_GROUPS` 를 얼려 `index.ts` 에서 내보낸다. R6 은 `ReauthDialog` 가 설명과 안내(`prompt`)를 다른 `<p>` 로 그린다. R5 는 README 와 실브라우저 측정.

**Tech Stack:** Vue 3.5 · Vuetify 4.2(dev 4.2.6) · Vite 8 lib 빌드 · TypeScript 6 · Vitest 5 + @vue/test-utils + happy-dom

**Spec:** `docs/superpowers/specs/2026-10-20-admin-kit-ringside-feedback-2-design.md` — 결정 ① · S1–S6 · E1–E5 · A1–A3 · O1–O4 · §2-8 · §3-1 · §5-1 · §6-1 · §7 · §8. 실행자는 스펙과 함께 읽는다. 입력 보고서는 `docs/reports/2026-10-20-admin-kit-report.md`. PR 2g(R2 · R3)는 별도 플랜이다.

## Global Constraints

- 브랜치 `feat/admin-ui-ringside-feedback-2`(main 에서 갈라짐 — 보고서 `4730d1a` · 스펙 `7ad57a8` · 이 플랜 커밋 위). `main` 에 직접 커밋하지 않는다.
- 🔴 시작 전: `docs/HANDOFF.md` 에 이 플랜 전의 로컬 변경(0.8.0 릴리스 기록)이 있다 — 사람이 정한 대로 먼저 별도 커밋한 뒤 브랜치를 만든다(Task 5 의 HANDOFF 커밋에 섞지 않는다). `.claude/settings.json` 의 로컬 변경은 커밋하지 않는다 — `git add` 는 파일을 이름으로 적는다.
- **admin-shared · admin-server 는 고치지 않는다**(PR 2g 몫). 템플릿(`../kim5257-project-template`) · ringside 는 읽기만 한다.
- 새 의존을 더하지 않는다. admin-shared peer 하한 그대로.
- SFC 는 Vuetify 컴포넌트를 `vuetify/components` 에서 명시 import 한다. 스타일은 순수 CSS `<style scoped>`. 스토어 · 라우터를 import 하지 않는다.
- `import type` 을 분리한다(eslint `consistent-type-imports`). 내부 상대 import 는 `.js` 확장자(`.vue` 는 그대로).
- `console.log` 금지. 🔴 **코드 · 정규식 · 명령에 백슬래시를 쓰지 않는다** — 도구 입력의 이스케이프가 풀려 글자가 바뀐다. 백슬래시가 들어간 편집을 했다면 node 로 바이트를 확인한다.
- 바꾸는 파일의 머리 주석(정본 · 바꾼 점)에 3i 변경을 한 줄 더한다. `🔴` 주석은 "지우면 사고가 나는 이유"다.
- 기본 문구는 지금 박힌 글자와 **한 글자도 다르지 않다**. 새 문구는 이 플랜에 적힌 글자 그대로다(재인증 안내 기본값 '현재 비밀번호를 입력하세요.').
- 기본 문구 객체는 `Object.freeze<타입>({ … })` 꼴로 얼리고 선언 타입은 `Readonly<타입>` 이다(`DEFAULT_IP_ACCESS_MESSAGES` 와 같은 꼴).
- 테스트: `src/**/*.test.ts`. DOM 이 필요하면 파일 머리 `// @vitest-environment happy-dom`. `data-testid` 를 심지 않는다 — 글자 · 접근 이름 · `name` · 컴포넌트 props 로 찾는다.
- 명령은 저장소 루트에서: 파일 하나 `pnpm --filter @ssworks/admin-ui exec vitest run <src 기준 경로>`, 패키지 `pnpm --filter @ssworks/admin-ui test`, 타입 `pnpm --filter @ssworks/admin-ui typecheck`, 빌드 `pnpm --filter @ssworks/admin-ui build`, lint `pnpm exec eslint <파일들>`, 마크다운 `pnpm exec prettier --write <파일>`(긴 md 는 두 번 돌리고 `--check`).
- 커밋 메시지: 한국어 conventional commits, 끝 줄 `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Windows · Linux 양쪽: Unix 파일 명령 대신 전용 도구, `> /dev/null` 금지.

## Review Focus

1. **정렬 없는 URL 로 돌아감**(`/list?sort=joinAt:asc` → 뒤로 가기로 `/list`) — 기대: 기본(내림)으로 복원된다. "빈 정렬 → 반대 방향" 규칙이 URL 복원에 새지 않는다(복원은 `[]` 를 넣지 않는다). → Task 1 URL 테스트 "정렬 없는 URL 로 돌아가면 기본".
2. **기본 열을 오름으로 둔 뒤 다른 열 헤더를 누름** — 기대: 그 열은 오름부터 시작하고(오름 → 내림 → 기본), 기본 열의 반대 방향 규칙이 다른 열에 새지 않는다. → Task 1 실물 표 테스트 "다른 열에 새지 않는다".
3. **`scopes` 를 평가 순서와 다르게 · 중복으로 넘김**(`['global', 'user', 'global']`) — 기대: 사용자 → 전체 두 항목, 오류 없음. → Task 2 `resolveIpScopes` 테스트 · composable 테스트.
4. **목록 밖 층의 기존 팀 규칙을 열고 사용자로 바꿨다가 다시 팀으로** — 기대: 팀은 선택지에서 사라졌고 `onUpdate:form` 으로 와도 사용자에 머문다(취소 뒤 다시 열면 팀이 다시 보인다). → Task 2 "다시 팀으로 돌아갈 수 없다".
5. **앱이 기본 문구를 펼쳐 일부만 바꾼 객체를 넘김** — 기대: 얼림이 펼치기를 막지 않고 결과 객체는 보통 객체다. 기본값에 직접 대입하면 던진다. → Task 3 테스트 둘.

---

## File Structure

| 파일 (모두 `packages/admin-ui/` 아래, 문서는 저장소 루트 기준)                                                                                | 책임                                                       | Task |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---- |
| `src/composables/useServerTable.ts` · `useServerTable.test.ts` · `useServerTable.url.test.ts` · `useServerTable.table.render.test.ts`         | 기본 정렬 열 순환(O2)                                      | 1    |
| `src/components/ip-access/ip-access.ts` · `ip-access.test.ts`                                                                                 | 층 도우미 셋                                               | 2    |
| `src/composables/useIpAccessRules.ts` · `useIpAccessRules.render.test.ts` · `src/components/ip-access/ip-access-manager.render.test.ts`       | `scopes` 옵션 · 선택지 · 기본 층 · 가드                    | 2    |
| `src/components/session/session-table.ts` · `team/team-tree.ts` · `team/team-user-list.ts` · `legal/legal-document.ts` · `audit/audit-log.ts` | 기본 문구 얼림 · 코어 묶음 항목 얼림                       | 3    |
| `src/composables/useTeamTree.ts` · `src/index.ts` · `src/default-messages.test.ts`(새 파일)                                                   | `DEFAULT_TEAM_MESSAGES` · export 아홉 · 계약 테스트        | 3    |
| `src/components/common/ReauthDialog.vue` · `reauth-dialog.render.test.ts`                                                                     | `prompt` · 두 문단                                         | 4    |
| `README.md` · `.changeset/admin-ui-ringside-feedback-2.md` · `CLAUDE.md` · `docs/01-phase0.md` · `docs/HANDOFF.md`                            | 문서 · 릴리스 · 진행                                       | 5    |
| `docs/verification/2026-10-20-admin-kit-ringside-feedback-2.md` · `docs/HANDOFF.md`                                                           | 스모크 · 실브라우저 검증 기록(PR 2g 가 같은 파일에 더한다) | 6    |

---

### Task 1: R7 — 기본 정렬 열은 내림 ↔ 오름

**Files:**

- Modify: `packages/admin-ui/src/composables/useServerTable.ts` (머리 주석 · `normalizeSort` 주석 · 새 `settleSort` · 정렬 보정 watch)
- Test: `packages/admin-ui/src/composables/useServerTable.test.ts` (기존 "빈 정렬" 테스트를 나눔)
- Test: `packages/admin-ui/src/composables/useServerTable.url.test.ts`
- Test: `packages/admin-ui/src/composables/useServerTable.table.render.test.ts` (머리 칸 하나 더함 · 헤더 클릭 둘)

**Interfaces:**

- Consumes: 없음
- Produces: 공개 시그니처 변경 없음. 동작만 — `sortBy` 에 `[]` 가 들어오고 직전 머리 열이 `sort.default.key` 면 `[{ key, order: 직전의 반대 }]` 로 되돌린다.

- [ ] **Step 1: 실패하는 테스트를 쓴다 — 단위**

`useServerTable.test.ts` 의 기존 테스트 `'🔴 빈 정렬(같은 헤더 세 번째 클릭) · 목록 밖 키는 기본 정렬로 되돌리고 다시 조회하지 않는다'`(`it(` 부터 그 `})` 까지)를 아래 셋으로 바꾼다:

```ts
it('🔴 다른 열에서 온 빈 정렬(그 헤더 세 번째 클릭) · 목록 밖 키는 기본 정렬로', async () => {
  const { fetch, table } = setup()
  await flushPromises()
  table().sortBy.value = [{ key: 'userId', order: 'desc' }]
  await flushPromises()
  table().sortBy.value = []
  await flushPromises()
  expect(table().sortBy.value).toEqual([{ key: 'joinAt', order: 'desc' }])
  table().sortBy.value = [{ key: 'password', order: 'asc' }]
  await flushPromises()
  expect(table().sortBy.value).toEqual([{ key: 'joinAt', order: 'desc' }])
  // 첫 조회 · userId 내림 · 기본으로 돌아옴 — 목록 밖 키는 지금과 같아 다시 조회하지 않는다
  expect(fetch).toHaveBeenCalledTimes(3)
})

it('🔴 기본 열에서 온 빈 정렬은 반대 방향 — 기본 열은 내림 ↔ 오름(3i O2)', async () => {
  const { fetch, table } = setup()
  await flushPromises()
  table().sortBy.value = []
  await flushPromises()
  expect(table().sortBy.value).toEqual([{ key: 'joinAt', order: 'asc' }])
  expect(fetch).toHaveBeenLastCalledWith(
    expect.objectContaining({ sortBy: ['joinAt'], sortOrder: ['asc'] }),
  )
  table().sortBy.value = []
  await flushPromises()
  expect(table().sortBy.value).toEqual([{ key: 'joinAt', order: 'desc' }])
  expect(fetch).toHaveBeenCalledTimes(3)
})

it('기본 방향이 오름이어도 기본 열은 두 방향을 오간다', async () => {
  const { table } = setup({
    sort: { keys: ['userId', 'joinAt'], default: { key: 'joinAt', order: 'asc' } },
  })
  await flushPromises()
  table().sortBy.value = [{ key: 'joinAt', order: 'desc' }]
  await flushPromises()
  table().sortBy.value = []
  await flushPromises()
  expect(table().sortBy.value).toEqual([{ key: 'joinAt', order: 'asc' }])
})
```

- [ ] **Step 2: 실패하는 테스트를 쓴다 — URL · 실물 표**

`useServerTable.url.test.ts` 의 `describe('useServerTable — urlSync', …)` 안, `'상태를 URL 에 싣고 기본값은 뺀다'` 테스트 바로 뒤에 더한다:

```ts
it('기본 열 오름은 sort=joinAt:asc 로 싣는다 · 🔴 정렬 없는 URL 로 돌아가면 기본(내림)이다(3i O3)', async () => {
  const { router, table } = await setup('/list')
  table().sortBy.value = []
  await flushPromises()
  expect(table().sortBy.value).toEqual([{ key: 'joinAt', order: 'asc' }])
  expect(router.currentRoute.value.query).toEqual({ sort: 'joinAt:asc' })
  await router.push('/list')
  await flushPromises()
  expect(table().sortBy.value).toEqual([{ key: 'joinAt', order: 'desc' }])
})

it('sort=joinAt:asc 를 복원한다 — 첫 조회가 오름', async () => {
  const { fetch, table } = await setup('/list?sort=joinAt:asc')
  expect(table().sortBy.value).toEqual([{ key: 'joinAt', order: 'asc' }])
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch).toHaveBeenCalledWith(
    expect.objectContaining({ sortBy: ['joinAt'], sortOrder: ['asc'] }),
  )
})
```

`useServerTable.table.render.test.ts`:

- `setup` 안 `h(DataTableBody, { headers: [{ title: 'ID', key: 'userId' }], …` 의 `headers` 를 `[{ title: 'ID', key: 'userId' }, { title: '가입', key: 'joinAt' }]` 로 바꾼다(기존 S1 · S2 는 영향 없다).
- `pagesOf` 정의 바로 뒤에 도우미를 더한다:

```ts
/** 머리 칸 — 글자로 찾는다(data-testid 를 심지 않는다) */
function header(title: string) {
  const th = wrapper!.findAll('th').find((cell) => cell.text().includes(title))
  expect(th, `가드 — 「${title}」 머리 칸이 있다`).toBeTruthy()
  return th!
}
```

- `describe('useServerTable + DataTableBody (실물 배선)', …)` 의 끝(S2 테스트 뒤)에 더한다:

```ts
it('🔴 S3: 기본 열 헤더는 내림 → 오름 → 내림으로 돈다(3i O2 — 실제 VDataTableServer 순환)', async () => {
  const { fetch, table } = await setup('/list', async () => ({ items: rows(3), total: 3 }))
  expect(table.sortBy.value).toEqual([{ key: 'joinAt', order: 'desc' }])
  await header('가입').trigger('click')
  await flushPromises()
  expect(table.sortBy.value).toEqual([{ key: 'joinAt', order: 'asc' }])
  expect(fetch).toHaveBeenLastCalledWith(
    expect.objectContaining({ sortBy: ['joinAt'], sortOrder: ['asc'] }),
  )
  await header('가입').trigger('click')
  await flushPromises()
  expect(table.sortBy.value).toEqual([{ key: 'joinAt', order: 'desc' }])
  expect(fetch).toHaveBeenCalledTimes(3)
})

it('S4: 기본 열 순환은 다른 열에 새지 않는다 — 다른 열은 오름 → 내림 → 기본', async () => {
  const { table } = await setup('/list', async () => ({ items: rows(3), total: 3 }))
  await header('가입').trigger('click')
  await flushPromises()
  expect(table.sortBy.value).toEqual([{ key: 'joinAt', order: 'asc' }])
  await header('ID').trigger('click')
  await flushPromises()
  expect(table.sortBy.value).toEqual([{ key: 'userId', order: 'asc' }])
  await header('ID').trigger('click')
  await flushPromises()
  expect(table.sortBy.value).toEqual([{ key: 'userId', order: 'desc' }])
  await header('ID').trigger('click')
  await flushPromises()
  expect(table.sortBy.value).toEqual([{ key: 'joinAt', order: 'desc' }])
})
```

(헤더 클릭 뒤 `sortBy` 가 전혀 바뀌지 않으면 클릭 대상이 틀린 것이다 — Vuetify 4 의 정렬 핸들러는 `<th>` 에 있다. 그때는 `th` 안의 `.v-data-table-header__content` 를 눌러 보고, 그래도 안 되면 멈추고 보고한다.)

- [ ] **Step 3: 테스트가 실패하는지 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useServerTable.test.ts src/composables/useServerTable.url.test.ts src/composables/useServerTable.table.render.test.ts`
Expected: FAIL — "기본 열에서 온 빈 정렬은 반대 방향" · "기본 방향이 오름이어도" · URL "기본 열 오름은 sort=joinAt:asc" · S3 · S4 가 `{ key: 'joinAt', order: 'desc' }` 를 받는다. 나머지(복원 · S1 · S2 · "다른 열에서 온 빈 정렬")는 초록.

- [ ] **Step 4: 구현한다**

`useServerTable.ts` 머리 주석 `// 바꾼 점:` 목록 끝(`//  - 오류 문구 해석은 하지 않는다 — …` 줄 뒤)에 한 줄:

```ts
//  - 기본 정렬 열은 헤더로 내림 ↔ 오름을 오간다(3i O2 — ringside 보고 §7). 다른 열은 오름 → 내림 → 기본 그대로.
```

`normalizeSort` 의 JSDoc 을 바꾼다:

```ts
/**
 * 🔴 키가 허용 목록 밖이거나 비었으면 기본 정렬. 한 열만 본다(hangang). 기본 열에서 온 빈 정렬은 `settleSort` 가 먼저
 *    가른다(3i O2).
 */
```

`normalizeSort` 함수 바로 뒤에 더한다:

```ts
/**
 * 🔴 헤더 순환의 "정렬 없음"(`[]`)이 기본 열에서 왔으면 반대 방향으로 넘긴다(3i O2). Vuetify 순환은 오름 → 내림 → 없음이라
 *    기본 정렬이 내림이면 첫 클릭이 곧 "없음" 이고, 그것을 기본값으로 되돌리면 기본 열은 오름에 닿지 못한다(ringside
 *    보고 §7). 이미 기본 정렬일 때 `[]` 를 넣어 되돌리던 코드는 반대 방향이 된다 — 되돌리기는 `[{ ...기본 }]` 이다(README).
 *    URL 복원은 `[]` 를 넣지 않으므로(`decodeSort` 는 늘 한 항목) 이 규칙을 타지 않는다.
 */
function settleSort(
  value: readonly AdminTableSort[],
  previous: readonly AdminTableSort[] | undefined,
): AdminTableSort[] {
  const head = previous?.[0]
  if (sort !== false && value.length === 0 && head?.key === sort.default.key) {
    return [{ key: head.key, order: head.order === 'asc' ? 'desc' : 'asc' }]
  }
  return normalizeSort(value)
}
```

정렬 보정 watch 를 바꾼다(`(value) => {` · `const normalized = normalizeSort(value)` 두 줄):

```ts
watch(
  sortBy,
  (value, previous) => {
    const normalized = settleSort(value, previous)
    const same =
      normalized.length === value.length &&
      normalized.every((s, i) => s.key === value[i]?.key && s.order === value[i]?.order)
    if (!same) sortBy.value = normalized
  },
  { flush: 'sync' },
)
```

`params` computed 의 `normalizeSort(sortBy.value)` 는 그대로 둔다(보정이 끝난 값을 읽는다).

- [ ] **Step 5: 테스트가 통과하는지 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useServerTable.test.ts src/composables/useServerTable.url.test.ts src/composables/useServerTable.table.render.test.ts`
Expected: PASS(전부).

Run: `pnpm --filter @ssworks/admin-ui test`
Expected: PASS — `useSessions` · `useAuditLogs` 등 `useServerTable` 을 쓰는 테스트도 초록. 빨간 테스트가 `sortBy.value = []` 를 기본 정렬 상태에서 넣고 내림을 기대하면, 그 테스트가 무엇을 재는지 보고 "다른 열에서 온 빈 정렬" 꼴로 고친다(고친 테스트 이름과 이유를 커밋 메시지 본문에 적는다).

- [ ] **Step 6: 타입 · lint**

Run: `pnpm --filter @ssworks/admin-ui typecheck` → 오류 0.
Run: `pnpm exec eslint packages/admin-ui/src/composables/useServerTable.ts packages/admin-ui/src/composables/useServerTable.test.ts packages/admin-ui/src/composables/useServerTable.url.test.ts packages/admin-ui/src/composables/useServerTable.table.render.test.ts` → 오류 0.

- [ ] **Step 7: 커밋**

```bash
git add packages/admin-ui/src/composables/useServerTable.ts packages/admin-ui/src/composables/useServerTable.test.ts packages/admin-ui/src/composables/useServerTable.url.test.ts packages/admin-ui/src/composables/useServerTable.table.render.test.ts
git commit -m "fix(admin-ui): 기본 정렬 열을 헤더로 오름차순에 — 정렬 없음이 기본 열에서 오면 반대 방향(ringside 보고 §7)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: R1 — `useIpAccessRules({ scopes })`

**Files:**

- Modify: `packages/admin-ui/src/components/ip-access/ip-access.ts` (`IP_SCOPE_ORDER` 근처 — 도우미 셋 · `emptyIpRuleForm` 인자)
- Modify: `packages/admin-ui/src/composables/useIpAccessRules.ts` (머리 주석 · 옵션 · setup · `setEditor` · `updateForm` · 바인딩)
- Test: `packages/admin-ui/src/components/ip-access/ip-access.test.ts`
- Test: `packages/admin-ui/src/composables/useIpAccessRules.render.test.ts`
- Test: `packages/admin-ui/src/components/ip-access/ip-access-manager.render.test.ts`

**Interfaces:**

- Consumes: admin-shared `IpScopeType`(`'global' | 'team' | 'user'`)
- Produces:
  - `ip-access.ts`: `export function resolveIpScopes(scopes?: readonly IpScopeType[]): readonly IpScopeType[]` · `export function defaultIpScope(scopes: readonly IpScopeType[]): IpScopeType` · `export function scopeTypeItems(messages: IpAccessMessages, scopes?: readonly IpScopeType[], current?: IpScopeType): IpSelectItem[]`(뒤 두 인자는 선택 — 기존 호출 `scopeTypeItems(M)` 그대로) · `export function emptyIpRuleForm(scopeType?: IpScopeType): IpRuleForm`(기본 `'global'`). 셋 다 내부 모듈이다 — `index.ts` 에 더하지 않는다.
  - `UseIpAccessRulesOptions.scopes?: readonly IpScopeType[]`(공개)

- [ ] **Step 1: 실패하는 테스트를 쓴다 — 도우미**

`ip-access.test.ts`:

- `@ssworks/admin-shared` import 목록에 `type IpScopeType,` 를 더한다.
- `./ip-access.js` import 목록에 `defaultIpScope,` · `resolveIpScopes,` 를 알파벳 자리에 더한다.
- `describe('범위 · 폼', …)` 안, `'새 폼은 전체 범위 · 빈 칸'` 테스트 뒤에 더한다:

```ts
it('층 목록 — 평가 순서로 펴고 중복은 한 번 · 빈 목록 · 모르는 값은 던진다(3i S1)', () => {
  expect(resolveIpScopes()).toEqual(['user', 'team', 'global'])
  expect(resolveIpScopes(['global', 'user', 'global'])).toEqual(['user', 'global'])
  expect(Object.isFrozen(resolveIpScopes(['user']))).toBe(true)
  expect(() => resolveIpScopes([])).toThrow(/scopes/)
  expect(() => resolveIpScopes(['user', 'teams' as IpScopeType])).toThrow(/teams/)
})

it('새 폼의 층 — 전체가 있으면 전체, 없으면 가장 가까운 층(3i S3)', () => {
  expect(defaultIpScope(['user', 'team', 'global'])).toBe('global')
  expect(defaultIpScope(['user', 'team'])).toBe('user')
  expect(defaultIpScope(['team'])).toBe('team')
  expect(emptyIpRuleForm('user')).toEqual({
    scopeType: 'user',
    scopeRefNo: '',
    cidr: '',
    description: '',
  })
})

it('층 선택지 — 목록 밖의 지금 층은 제 순번 자리에 남는다(3i S2)', () => {
  const values = (items: { value: string }[]) => items.map((item) => item.value)
  expect(values(scopeTypeItems(M, ['user', 'global']))).toEqual(['user', 'global'])
  expect(values(scopeTypeItems(M, ['user', 'global'], 'team'))).toEqual(['user', 'team', 'global'])
  expect(values(scopeTypeItems(M, ['user', 'global'], 'global'))).toEqual(['user', 'global'])
})
```

- [ ] **Step 2: 실패하는 테스트를 쓴다 — composable · 화면**

`useIpAccessRules.render.test.ts` 의 `describe('useIpAccessRules — 대상 후보', …)` 바로 앞에 새 describe 를 더한다:

```ts
describe('useIpAccessRules — 층 목록 scopes(3i)', () => {
  const values = (items: readonly { value: string }[]) => items.map((item) => item.value)

  it('기본은 층 셋', async () => {
    const { ip } = await setup()
    expect(values(ip.manager.value.scopeItems)).toEqual(['user', 'team', 'global'])
  })

  it('🔴 팀 없는 앱 — 사용자 · 전체만, 넘긴 순서와 무관하게 평가 순서', async () => {
    const { ip } = await setup({ scopes: ['global', 'user'] })
    await ip.openCreate()
    expect(values(ip.manager.value.scopeItems)).toEqual(['user', 'global'])
    expect(ip.form.value.scopeType).toBe('global')
  })

  it('전체가 빠지면 새 규칙은 가장 가까운 층 · 연 순간 고친 값이 없다', async () => {
    const { ip } = await setup({ scopes: ['user', 'team'] })
    await ip.openCreate()
    expect(ip.form.value).toEqual({ scopeType: 'user', scopeRefNo: '', cidr: '', description: '' })
    expect(await ip.closeEditor()).toBe(true)
    expect(ip.manager.value.discardDialog.modelValue).toBe(false)
  })

  it('목록 밖 층의 기존 규칙 — 열면 그 층이 선택지에 있고, 다른 층으로 바꾸면 사라진다', async () => {
    const { ip } = await setup({ scopes: ['user', 'global'] })
    await ip.openEdit(TEAM)
    expect(values(ip.manager.value.scopeItems)).toEqual(['user', 'team', 'global'])
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'user' })
    expect(ip.form.value.scopeType).toBe('user')
    expect(values(ip.manager.value.scopeItems)).toEqual(['user', 'global'])
  })

  it('🔴 목록 밖 층으로는 바꾸지 않는다 — 다시 팀으로 돌아갈 수 없다(3i S4)', async () => {
    const { ip } = await setup({ scopes: ['user', 'global'] })
    await ip.openCreate()
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'team', scopeRefNo: '4' })
    expect(ip.form.value.scopeType).toBe('global')
    expect(await ip.closeEditor()).toBe(true)
    await ip.openEdit(TEAM)
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'user' })
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'team' })
    expect(ip.form.value.scopeType).toBe('user')
  })
})
```

(빈 `scopes` 가 던지는 것은 Step 1 의 `resolveIpScopes` 테스트가 잰다 — composable 은 setup 첫머리에서 그 함수를 부른다. 마운트 중 예외를 Vue 가 다루는 방식에 기대는 테스트는 쓰지 않는다.)

`ip-access-manager.render.test.ts`:

- `../../composables/useIpAccessRules.js` import 에 `type UseIpAccessRulesOptions,` 를 더한다.
- `describe('흐름 + 화면 — useIpAccessRules 와 함께', …)` 의 `async function mountFlow(reauth: boolean) {` 를 `async function mountFlow(reauth: boolean, extra: Partial<UseIpAccessRulesOptions> = {}) {` 로, 그 안 `useIpAccessRules({ ...adapters, canManage: () => true, reauth })` 를 `useIpAccessRules({ ...adapters, canManage: () => true, reauth, ...extra })` 로 바꾼다.
- 그 describe 끝에 더한다:

```ts
it('🔴 scopes: [user, global] — 층 select 에 팀이 없다(3i S1)', async () => {
  await mountFlow(false, { scopes: ['user', 'global'] })
  buttonByText(M.createButton)!.click()
  await flushPromises()
  const scope = wrapper!.findAllComponents(VSelect).find((c) => c.props('label') === M.scopeLabel)!
  expect((scope.props('items') as { value: string }[]).map((i) => i.value)).toEqual([
    'user',
    'global',
  ])
})
```

- [ ] **Step 3: 테스트가 실패하는지 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/ip-access/ip-access.test.ts src/composables/useIpAccessRules.render.test.ts src/components/ip-access/ip-access-manager.render.test.ts`
Expected: FAIL — `resolveIpScopes` · `defaultIpScope` 가 없다(import 오류로 파일 전체가 빨강일 수 있다). 타입 검사가 없는 vitest 는 `scopes` 옵션을 무시해 composable 테스트가 층 셋을 받는다.

- [ ] **Step 4: 도우미를 구현한다**

`ip-access.ts` 의 `IP_SCOPE_ORDER` 선언 바로 뒤에 더한다:

```ts
/**
 * `useIpAccessRules({ scopes })` 를 평가 순서로 편다(3i S1). 넘긴 순서는 따르지 않고 중복은 한 번이다.
 * 🔴 빈 목록 · 모르는 값은 던진다 — 층을 고를 수 없는 화면은 설정 실수다.
 */
export function resolveIpScopes(
  scopes: readonly IpScopeType[] = IP_SCOPE_ORDER,
): readonly IpScopeType[] {
  const unknown = scopes.filter((scope) => !IP_SCOPE_ORDER.includes(scope))
  if (scopes.length === 0 || unknown.length > 0) {
    throw new Error(
      `useIpAccessRules 의 scopes 는 'user' · 'team' · 'global' 중 하나 이상이다: [${scopes.map(String).join(', ')}]`,
    )
  }
  return Object.freeze(IP_SCOPE_ORDER.filter((scope) => scopes.includes(scope)))
}

/** 새 규칙 폼의 층 — 전체가 있으면 전체(지금까지와 같다), 없으면 가장 가까운 층(3i S3) */
export function defaultIpScope(scopes: readonly IpScopeType[]): IpScopeType {
  return scopes.includes('global') ? 'global' : (scopes[0] ?? 'global')
}
```

`scopeTypeItems` 와 `emptyIpRuleForm` 를 바꾼다:

```ts
/**
 * 층 선택지 — 평가 순서. `current` 가 `scopes` 밖이면(편집을 연 기존 규칙) 그 층도 제 순번 자리에 둔다. 폼이 다른 층으로
 * 바뀌면 사라진다(3i S2).
 */
export function scopeTypeItems(
  messages: IpAccessMessages,
  scopes: readonly IpScopeType[] = IP_SCOPE_ORDER,
  current?: IpScopeType,
): IpSelectItem[] {
  return IP_SCOPE_ORDER.filter((value) => scopes.includes(value) || value === current).map(
    (value) => ({ value, title: scopeTypeLabel(value, messages) }),
  )
}

export function emptyIpRuleForm(scopeType: IpScopeType = 'global'): IpRuleForm {
  return { scopeType, scopeRefNo: '', cidr: '', description: '' }
}
```

`ip-access.ts` 머리 주석 `바꾼 점` 목록 끝에 한 줄: `//  - 층 목록(3i S1 — ringside 보고 §1): 팀 모듈 없는 앱이 사용자 · 전체만 고른다. 표시 순서는 늘 평가 순서.`

- [ ] **Step 5: composable 을 구현한다**

`useIpAccessRules.ts`:

1. `@ssworks/admin-shared` 의 `import type { … }` 목록에 `IpScopeType,` 를 더한다.
2. `../components/ip-access/ip-access.js` import 목록에 `defaultIpScope,` · `resolveIpScopes,` 를 알파벳 자리에 더한다.
3. 머리 주석의 바꾼 점 목록(없으면 정본 주석 블록 끝)에 한 줄을 더한다:

   ```ts
   //  - 층 목록 scopes(3i — ringside 보고 §1). 목록 밖 층의 기존 규칙은 고치는 동안만 선택지에 남는다(S2 · S4).
   ```

4. `UseIpAccessRulesOptions` 의 `messages?:` 앞에 더한다:

```ts
  /**
   * 기본 ['user', 'team', 'global']. 표시 순서는 늘 사용자 → 팀 → 전체(평가 순서). 팀 모듈(AdminTeamsModule)을 켜지 않은 앱은
   * ['user', 'global'] — 안 주면 "팀" 층이 남고 저장은 늘 400 이다. 🔴 빈 목록 · 모르는 값은 setup 에서 던진다.
   */
  scopes?: readonly IpScopeType[]
```

5. setup 의 `const scopeItems = scopeTypeItems(messages)` 를 지우고 그 자리에:

```ts
// 🔴 setup 첫머리에서 던진다 — 층을 고를 수 없는 화면은 설정 실수다(3i S1)
const scopes = resolveIpScopes(options.scopes)
const newScope = defaultIpScope(scopes)
```

6. `const form = ref<IpRuleForm>(emptyIpRuleForm())` → `emptyIpRuleForm(newScope)`, `let baseline: IpRuleForm = emptyIpRuleForm()` → `emptyIpRuleForm(newScope)`.
7. `setEditor` 의 `form.value = next === null || next === 'new' ? emptyIpRuleForm() : ruleToForm(next)` → `emptyIpRuleForm(newScope)`.
8. `updateForm` 을 바꾼다:

```ts
function updateForm(next: IpRuleForm): void {
  if (editing.value === null || busy.value) return
  // 🔴 목록 밖 층으로는 바꾸지 않는다(3i S4) — 선택지에 없는 층이 들어와도 상태가 갈리지 않게. 지금 층(목록 밖 기존 규칙)에
  //    머무는 것은 된다.
  const scopeType =
    next.scopeType === form.value.scopeType || scopes.includes(next.scopeType)
      ? next.scopeType
      : form.value.scopeType
  // 🔴 범위를 바꾸면 대상을 비운다(I19) — 팀 번호가 사용자 번호로, 본 적 없는 번호가 남지 않게
  form.value = withScopeType({ ...next, scopeType: form.value.scopeType }, scopeType)
  clientErrors.value = {}
  flow.clearFieldErrors()
  syncTarget()
}
```

9. `manager` computed 의 `scopeItems,` 를 `scopeItems: scopeTypeItems(messages, scopes, form.value.scopeType),` 로 바꾼다.

- [ ] **Step 6: 테스트가 통과하는지 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/ip-access src/composables/useIpAccessRules.render.test.ts src/composables/useIpAccessRules.write.render.test.ts src/composables/useIpPreview.test.ts`
Expected: PASS(전부 — 기존 "새 규칙 — 빈 폼"은 `scopeType: 'global'` 그대로).

Run: `pnpm --filter @ssworks/admin-ui typecheck` → 오류 0.
Run: `pnpm exec eslint packages/admin-ui/src/components/ip-access/ip-access.ts packages/admin-ui/src/components/ip-access/ip-access.test.ts packages/admin-ui/src/components/ip-access/ip-access-manager.render.test.ts packages/admin-ui/src/composables/useIpAccessRules.ts packages/admin-ui/src/composables/useIpAccessRules.render.test.ts` → 오류 0.

- [ ] **Step 7: 커밋**

```bash
git add packages/admin-ui/src/components/ip-access/ip-access.ts packages/admin-ui/src/components/ip-access/ip-access.test.ts packages/admin-ui/src/components/ip-access/ip-access-manager.render.test.ts packages/admin-ui/src/composables/useIpAccessRules.ts packages/admin-ui/src/composables/useIpAccessRules.render.test.ts
git commit -m "feat(admin-ui): useIpAccessRules scopes — 팀 모듈 없는 앱이 층을 사용자 · 전체로(ringside 보고 §1)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: R4 — 기본 문구 export · 얼림

**Files:**

- Create: `packages/admin-ui/src/default-messages.test.ts`
- Modify: `packages/admin-ui/src/components/session/session-table.ts` (`DEFAULT_SESSION_TABLE_MESSAGES` — 주석 · 얼림)
- Modify: `packages/admin-ui/src/components/team/team-tree.ts` (`DEFAULT_TEAM_TREE_MESSAGES`)
- Modify: `packages/admin-ui/src/components/team/team-user-list.ts` (`DEFAULT_TEAM_USER_LIST_MESSAGES`)
- Modify: `packages/admin-ui/src/components/legal/legal-document.ts` (`DEFAULT_LEGAL_MESSAGES` · `DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES`)
- Modify: `packages/admin-ui/src/composables/useTeamTree.ts` (`DEFAULT_MESSAGES` → `DEFAULT_TEAM_MESSAGES`)
- Modify: `packages/admin-ui/src/components/audit/audit-log.ts` (`CORE_AUDIT_ACTION_GROUPS` 항목 얼림)
- Modify: `packages/admin-ui/src/index.ts` (export 아홉)

**Interfaces:**

- Consumes: 없음
- Produces(`@ssworks/admin-ui` 공개): `DEFAULT_SESSION_TABLE_MESSAGES: Readonly<SessionTableMessages>` · `DEFAULT_IP_ACCESS_MESSAGES: Readonly<IpAccessMessages>` · `DEFAULT_AUDIT_LOG_MESSAGES: Readonly<AuditLogMessages>` · `DEFAULT_TEAM_TREE_MESSAGES: Readonly<TeamTreeMessages>` · `DEFAULT_TEAM_USER_LIST_MESSAGES: Readonly<TeamUserListMessages>` · `DEFAULT_TEAM_MESSAGES: Readonly<TeamMessages>` · `DEFAULT_LEGAL_MESSAGES: Readonly<LegalMessages>` · `DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES: Readonly<LegalDocumentEditorMessages>` · `CORE_AUDIT_ACTION_GROUPS: readonly Readonly<AuditActionGroup>[]`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-ui/src/default-messages.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import * as kit from './index.js'

// 3i E1 — 기본 문구는 공개다(3f/3g C2 · 3h S6 을 뒤집음). 앱이 덮을 키를 고르고 테스트에서 비교한다.
// 🔴 얼려 있어야 한다(E3) — 앱 한 곳의 대입이 킷 기본값을 모든 화면에서 바꾸지 않게.

const DEFAULTS: Record<string, object> = {
  DEFAULT_SESSION_TABLE_MESSAGES: kit.DEFAULT_SESSION_TABLE_MESSAGES,
  DEFAULT_IP_ACCESS_MESSAGES: kit.DEFAULT_IP_ACCESS_MESSAGES,
  DEFAULT_AUDIT_LOG_MESSAGES: kit.DEFAULT_AUDIT_LOG_MESSAGES,
  DEFAULT_TEAM_TREE_MESSAGES: kit.DEFAULT_TEAM_TREE_MESSAGES,
  DEFAULT_TEAM_USER_LIST_MESSAGES: kit.DEFAULT_TEAM_USER_LIST_MESSAGES,
  DEFAULT_TEAM_MESSAGES: kit.DEFAULT_TEAM_MESSAGES,
  DEFAULT_LEGAL_MESSAGES: kit.DEFAULT_LEGAL_MESSAGES,
  DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES: kit.DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES,
}

describe('기본 문구 export(3i E1–E4)', () => {
  it.each(Object.entries(DEFAULTS))('%s — index 에서 나오고 얼려 있다', (_name, value) => {
    expect(value).toBeTypeOf('object')
    expect(Object.keys(value).length).toBeGreaterThan(0)
    expect(Object.isFrozen(value)).toBe(true)
  })

  it('🔴 기본값에 대입하면 던진다(strict) — 킷 기본값이 바뀌지 않는다', () => {
    const target = kit.DEFAULT_SESSION_TABLE_MESSAGES as { userColumn: string }
    expect(() => {
      target.userColumn = '운영자'
    }).toThrow(TypeError)
    expect(kit.DEFAULT_SESSION_TABLE_MESSAGES.userColumn).toBe('사용자')
  })

  it('앱이 펼쳐 덮은 객체는 보통 객체다 — 얼림이 펼치기를 막지 않는다', () => {
    const messages = { ...kit.DEFAULT_IP_ACCESS_MESSAGES, scopeUser: '운영자' }
    expect(messages.scopeUser).toBe('운영자')
    expect(messages.scopeTeam).toBe(kit.DEFAULT_IP_ACCESS_MESSAGES.scopeTeam)
    expect(Object.isFrozen(messages)).toBe(false)
  })

  it('CORE_AUDIT_ACTION_GROUPS — 배열과 항목이 얼려 있다 · org.user 라벨은 "사용자"(E4)', () => {
    expect(Object.isFrozen(kit.CORE_AUDIT_ACTION_GROUPS)).toBe(true)
    expect(kit.CORE_AUDIT_ACTION_GROUPS.every((group) => Object.isFrozen(group))).toBe(true)
    expect(kit.CORE_AUDIT_ACTION_GROUPS.find((g) => g.prefix === 'org.user')?.label).toBe('사용자')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/default-messages.test.ts`
Expected: FAIL — index 에 없는 이름은 `undefined` 라 `toBeTypeOf('object')` 에서, `CORE_AUDIT_ACTION_GROUPS` 는 `undefined.every` 에서 실패한다.

- [ ] **Step 3: 얼린다**

각 선언의 여는 줄과, 그 객체를 닫는 맨 끝 `}` 줄(들여쓰기 없는 `}`)을 바꾼다. 안의 키 · 글자는 건드리지 않는다.

- `session-table.ts`: 선언 위 JSDoc 을 바꾼다 —

```ts
/**
 * 기본 문구 — 공개다(3i E1 — 3f/3g C2 · 3h S6 을 뒤집음: 앱이 덮을 키를 고르고 테스트에서 비교한다). 3h 전에
 * `SessionTable` 에 박혀 있던 글자 그대로다. `useSessions` 가 확인 창 제목의 기본값으로 `revokeUserButton` 을 읽는다.
 * 🔴 얼린다 — 앱 한 곳의 대입이 모든 화면의 기본값을 바꾸지 않게(E3).
 */
export const DEFAULT_SESSION_TABLE_MESSAGES: Readonly<SessionTableMessages> =
  Object.freeze<SessionTableMessages>({
```

그 객체의 닫는 `}` 를 `})` 로.

- `team-tree.ts`: `export const DEFAULT_TEAM_TREE_MESSAGES: TeamTreeMessages = {` → `export const DEFAULT_TEAM_TREE_MESSAGES: Readonly<TeamTreeMessages> = Object.freeze<TeamTreeMessages>({`, 닫는 `}` → `})`.
- `team-user-list.ts`: `DEFAULT_TEAM_USER_LIST_MESSAGES` 를 같은 꼴로(`Readonly<TeamUserListMessages>` · `Object.freeze<TeamUserListMessages>({`).
- `legal-document.ts`: `DEFAULT_LEGAL_MESSAGES`(`LegalMessages`)와 `DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES`(`LegalDocumentEditorMessages`)를 같은 꼴로. 둘 사이의 `const CONFLICT_TAIL = …` 는 그대로다.
- `useTeamTree.ts`: `const DEFAULT_MESSAGES: TeamMessages = {` →

```ts
/** 기본 문구 — 공개(3i E2). 🔴 얼린다(E3) */
export const DEFAULT_TEAM_MESSAGES: Readonly<TeamMessages> = Object.freeze<TeamMessages>({
```

닫는 `}` → `})`, 그리고 setup 의 `{ ...DEFAULT_MESSAGES, ...options.messages }` → `{ ...DEFAULT_TEAM_MESSAGES, ...options.messages }`. 파일 안에 `DEFAULT_MESSAGES` 가 더 있으면 모두 새 이름으로.

- `audit-log.ts`: `CORE_AUDIT_ACTION_GROUPS` 를 바꾼다 —

```ts
/** 코어 동작 묶음 — 공개(3i E4). 🔴 배열과 항목을 모두 얼린다 — `mergeActionGroups` 는 복사해서 덮는다 */
export const CORE_AUDIT_ACTION_GROUPS: readonly Readonly<AuditActionGroup>[] = Object.freeze(
  [
    { prefix: 'auth', label: '인증' },
    { prefix: 'auth.login', label: '로그인' },
    { prefix: 'session', label: '세션' },
    { prefix: 'org.role', label: '역할' },
    { prefix: 'org.user', label: '사용자' },
    { prefix: 'org.team', label: '팀' },
    { prefix: 'setting', label: '설정' },
  ].map((group) => Object.freeze(group)),
)
```

`DEFAULT_AUDIT_LOG_MESSAGES` · `DEFAULT_IP_ACCESS_MESSAGES` 는 이미 얼려 있다 — 그대로.

- [ ] **Step 4: export 한다**

`src/index.ts` — 각 블록의 `export {` 첫 항목 자리에 값 export 를 더한다(타입 export 앞):

- `./components/session/session-table.js` 블록: `DEFAULT_SESSION_TABLE_MESSAGES,`
- `./components/team/team-tree.js` 블록: `DEFAULT_TEAM_TREE_MESSAGES,`
- `./composables/useTeamTree.js` 블록: `useTeamTree,` 뒤에 `DEFAULT_TEAM_MESSAGES,`
- `./components/team/team-user-list.js` 블록: `DEFAULT_TEAM_USER_LIST_MESSAGES,`
- `./components/legal/legal-document.js` 블록: `DEFAULT_LEGAL_MESSAGES,` · `DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES,`
- `./components/audit/audit-log.js` 블록: `CORE_AUDIT_ACTION_GROUPS,` · `DEFAULT_AUDIT_LOG_MESSAGES,`
- `./components/ip-access/ip-access.js` 블록: `DEFAULT_IP_ACCESS_MESSAGES,`

- [ ] **Step 5: 테스트가 통과하는지 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/default-messages.test.ts`
Expected: PASS.

Run: `pnpm --filter @ssworks/admin-ui test`
Expected: PASS — 기본 문구를 그리는 컴포넌트 테스트는 고치지 않고 초록이다(글자가 그대로라는 증거). 어떤 테스트가 기본값 객체에 대입하다 `TypeError` 로 빨갛게 되면, 그 테스트는 펼친 사본을 쓰도록 고친다.

Run: `pnpm --filter @ssworks/admin-ui typecheck` → 오류 0(`Readonly<…>` 를 `…` 자리로 넘기는 곳은 TS 가 받는다 — readonly 속성은 대입 호환이다).
Run: `pnpm exec eslint packages/admin-ui/src/default-messages.test.ts packages/admin-ui/src/index.ts packages/admin-ui/src/components/session/session-table.ts packages/admin-ui/src/components/team/team-tree.ts packages/admin-ui/src/components/team/team-user-list.ts packages/admin-ui/src/components/legal/legal-document.ts packages/admin-ui/src/composables/useTeamTree.ts packages/admin-ui/src/components/audit/audit-log.ts` → 오류 0.

- [ ] **Step 6: 커밋**

```bash
git add packages/admin-ui/src/default-messages.test.ts packages/admin-ui/src/index.ts packages/admin-ui/src/components/session/session-table.ts packages/admin-ui/src/components/team/team-tree.ts packages/admin-ui/src/components/team/team-user-list.ts packages/admin-ui/src/components/legal/legal-document.ts packages/admin-ui/src/composables/useTeamTree.ts packages/admin-ui/src/components/audit/audit-log.ts
git commit -m "feat(admin-ui): 기본 문구 여덟 · CORE_AUDIT_ACTION_GROUPS 를 얼려서 export(ringside 보고 §4)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: R6 — `ReauthDialog` 설명과 안내를 다른 문단으로 · `prompt`

**Files:**

- Modify: `packages/admin-ui/src/components/common/ReauthDialog.vue`
- Test: `packages/admin-ui/src/components/common/reauth-dialog.render.test.ts`

**Interfaces:**

- Consumes: 없음
- Produces: `ReauthDialog` prop `prompt?: string`(기본 '현재 비밀번호를 입력하세요.'). `ReauthDialogBindings` 는 그대로(A3).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`reauth-dialog.render.test.ts`:

- `mountDialog` 의 props 타입에 `prompt?: string;` 을 더한다(`{ modelValue?: boolean; message?: string; prompt?: string; submitting?: boolean; error?: string }`).
- `passwordInput` 정의 뒤에 도우미를 더한다:

```ts
/** 카드 본문의 문단 글자 — 설명 · 안내가 다른 문단인지 잰다 */
function paragraphs(): (string | undefined)[] {
  return [...document.body.querySelectorAll('.v-card-text p')].map((p) => p.textContent?.trim())
}
```

- 기존 테스트 `'무엇을 하려는지와 다음 행동을 함께 적는다'`(`it(` 부터 그 `})` 까지)를 아래 셋으로 바꾼다:

```ts
it('🔴 설명과 안내는 다른 문단이다 — 설명이 마침표 없이 끝나도 문장이 붙지 않는다(3i A2)', async () => {
  await mountDialog({ message: '「글쓰기 금지」 7일 — 사유: 도배' })
  expect(paragraphs()).toEqual(['「글쓰기 금지」 7일 — 사유: 도배', '현재 비밀번호를 입력하세요.'])
})

it('설명이 비면 안내 문단 하나', async () => {
  await mountDialog()
  expect(paragraphs()).toEqual(['현재 비밀번호를 입력하세요.'])
})

it('prompt 로 안내를 바꾼다(3i A1)', async () => {
  await mountDialog({
    message: '스토리지 설정을 저장합니다.',
    prompt: '운영자 본인의 현재 비밀번호를 입력하세요.',
  })
  expect(paragraphs()).toEqual([
    '스토리지 설정을 저장합니다.',
    '운영자 본인의 현재 비밀번호를 입력하세요.',
  ])
})
```

- [ ] **Step 2: 테스트가 실패하는지 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/common/reauth-dialog.render.test.ts`
Expected: FAIL — 문단이 하나(`'「글쓰기 금지」 7일 — 사유: 도배 현재 비밀번호를 입력하세요.'`)이고, `prompt` 를 무시한다.

- [ ] **Step 3: 구현한다**

`ReauthDialog.vue`:

1. 머리 주석의 `// 정본: hangang-home apps/admin/src/components/common/ReauthDialog.vue` 줄 바로 뒤에:

```ts
// 바꾼 점(3i A1 · A2): 설명과 안내를 다른 문단으로 · 안내는 `prompt` — 설명이 마침표 없이 끝나면(운영자가 쓴 사유)
//   한 문단으로 붙어 문장 경계가 사라졌다(ringside 보고 §6).
```

2. props 의 `message` JSDoc 과 그 뒤에 `prompt` 를 둔다:

```ts
      /** 무엇을 하려는지 한 문장. 안내(`prompt`)와 다른 문단에 그린다. 비면 안내만. */
      message?: string
      /** 설명 아래 문단의 안내. 기본 「현재 비밀번호를 입력하세요.」 */
      prompt?: string
```

3. `withDefaults` 의 기본값에 `prompt: '현재 비밀번호를 입력하세요.',` 를 `message: '',` 바로 뒤에 더한다.
4. 템플릿의 `<p class="mb-4 text-body-2">{{ message }} 현재 비밀번호를 입력하세요.</p>` 를 바꾼다:

```vue
<p v-if="message" class="mb-2 text-body-2">{{ message }}</p>
<p class="mb-4 text-body-2">{{ prompt }}</p>
```

- [ ] **Step 4: 테스트가 통과하는지 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/common/reauth-dialog.render.test.ts`
Expected: PASS.

Run: `pnpm --filter @ssworks/admin-ui test` → PASS(재인증 문구를 한 문단으로 재는 테스트는 이 파일뿐이다 — 스펙 §6-1).
Run: `pnpm --filter @ssworks/admin-ui typecheck` → 오류 0.
Run: `pnpm exec eslint packages/admin-ui/src/components/common/ReauthDialog.vue packages/admin-ui/src/components/common/reauth-dialog.render.test.ts` → 오류 0.

- [ ] **Step 5: 커밋**

```bash
git add packages/admin-ui/src/components/common/ReauthDialog.vue packages/admin-ui/src/components/common/reauth-dialog.render.test.ts
git commit -m "feat(admin-ui): ReauthDialog 설명과 안내를 다른 문단으로 · prompt prop(ringside 보고 §6)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: README · changeset · 진행 문서 · `pnpm check`

**Files:**

- Modify: `packages/admin-ui/README.md`
- Create: `.changeset/admin-ui-ringside-feedback-2.md`
- Modify: `CLAUDE.md` (진행표)
- Modify: `docs/01-phase0.md` (§8)
- Modify: `docs/HANDOFF.md` (제목 날짜 · 「지금 상태」 · 「PR #3i 가 넘긴 것」)

**Interfaces:**

- Consumes: Task 1~4 의 공개 이름 — `scopes` · `DEFAULT_*_MESSAGES` 여덟 · `CORE_AUDIT_ACTION_GROUPS` · `prompt`
- Produces: 문서만

- [ ] **Step 1: README 「다이얼로그 · 필드」 · 「Vuetify 프리셋」**

「다이얼로그 · 필드」 표의 `ReauthDialog` 행 설명 칸을 아래 글로 바꾼다:

```markdown
민감 쓰기 전 본인 비밀번호 재확인. `@confirm(password)`, 입력 `name="currentPassword"`. 설명 `message` 와 안내 `prompt`(기본 「현재 비밀번호를 입력하세요.」)는 다른 문단
```

「Vuetify 프리셋」 절의 마지막 목록 항목(「`@ssworks/admin-ui/vite` 는 Node 에서 읽히는」 으로 시작하는 줄) 뒤에 빈 줄을 두고 더한다:

````markdown
🔴 **세로 폼은 칸 사이 간격을 앱이 준다.** 프리셋의 `hideDetails: 'auto'` 는 메시지가 없는 칸의 아래 자리를 없앤다 — 칸끼리 붙어 있다가 오류 문구가 나오면 그 문구가 아래 칸의 떠 있는 라벨(outlined)과 겹친다. 킷 폼(`PasswordChangeForm` · `IpRuleEditor`)처럼 칸 사이 `gap: 12px` 를 둔다.

```vue
<VCard>
  <VCardText>
    <div class="form">
      <VSelect v-model="form.kind" :items="kinds" label="종류" :error-messages="fieldErrors.kind" />
      <VTextField v-model="form.days" label="기간(일)" :error-messages="fieldErrors.days" />
      <VTextarea v-model="form.reason" label="사유" :error-messages="fieldErrors.reason" />
    </div>
  </VCardText>
</VCard>

<style scoped>
  .form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
</style>
```
````

- [ ] **Step 2: README 「목록 · 쓰기」 · 「IP 접근 제어」**

「목록 · 쓰기」 끝 목록의 `- 표는 "적용된" 필터만 본다. …` 줄 뒤에 더한다:

```markdown
- 정렬 헤더는 오름 → 내림 → 기본 정렬로 돈다. 🔴 기본 정렬 열만은 내림 ↔ 오름을 오간다(0.9.0 — 그 전에는 기본 열이 오름에 닿지 못했다). URL 에는 기본값만 빠진다(`sort=joinAt:asc` 는 남는다). 코드로 기본 정렬로 되돌리려면 `sortBy.value = [{ key: 'joinAt', order: 'desc' }]` — 이미 기본 정렬일 때 `[]` 를 넣으면 반대 방향이 된다.
```

「IP 접근 제어」 → 「Phase 2 서버를 쓰는 새 서비스」의 `- **본인 표시**: …` 줄 뒤에 더한다:

```markdown
- **팀 없는 앱**: `AdminTeamsModule` 을 켜지 않았으면 `scopes: ['user', 'global']` 을 준다 — 층 선택에서 "팀" 이 빠진다(안 주면 팀 번호 칸이 남고 저장은 늘 400). 표시 순서는 늘 사용자 → 팀 → 전체다. 목록 밖 층의 기존 규칙을 열면 그 층은 그 규칙을 고치는 동안만 선택지에 남는다. 팀 모듈이 있는데 팀 목록 권한만 없는 앱은 `scopes` 를 두지 않는다(번호 칸). 층 설명 문구(`hintLayerShadow` — "사용자 → 팀 → 전체")는 `messages` 로 맞춘다.
```

- [ ] **Step 3: README export 표 · 「용어 바꾸기」**

「셸 · 내비게이션 · 인프라」 export 표에서 아래 행의 첫 칸 끝에 가운뎃점(`·`)과 그 이름을 코드 글꼴로 이어 붙인다(설명 칸은 그대로):

- `SessionTable` 행 ← `DEFAULT_SESSION_TABLE_MESSAGES`
- `TeamTree` 행 ← `DEFAULT_TEAM_TREE_MESSAGES`
- `useTeamTree` 행 ← `DEFAULT_TEAM_MESSAGES`
- `TeamUserList` 행 ← `DEFAULT_TEAM_USER_LIST_MESSAGES`
- `useLegalDocuments` 행 ← `DEFAULT_LEGAL_MESSAGES`
- `LegalDocumentEditor` 행 ← `DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES`
- `LegalDocumentEditor` 행 뒤에 두 행을 더한다 —
  - 첫 칸 `` `AuditLogViewer` · `useAuditLogs` · `UseAuditLogsOptions` · `AuditLogs` · `AuditLogViewerBindings` · `AuditActorOption` · `AuditActionGroup` · `AuditLogDraft` · `AuditLogFilter` · `AuditFilterItem` · `AuditLogMessages` · `DEFAULT_AUDIT_LOG_MESSAGES` · `CORE_AUDIT_ACTION_GROUPS` ``, 설명 `감사 로그 조회(「감사 로그」)`
  - 첫 칸 `` `IpAccessManager` · `useIpAccessRules` · `UseIpAccessRulesOptions` · `IpAccessRules` · `IpAccessManagerBindings` · `IpRuleDoneEvent` · `IpRuleForm` · `IpPreviewState` · `IpPreviewView` · `IpUserOption` · `IpWriteContext` · `IpSelectItem` · `IpAccessAlert` · `IpAccessMessages` · `DEFAULT_IP_ACCESS_MESSAGES` ``, 설명 `IP 접근 제어 관리(「IP 접근 제어」)`
- 표 바로 뒤에 빈 줄을 두고 아래 한 줄:

```markdown
`DEFAULT_*_MESSAGES` 는 그 화면의 기본 문구다(얼려 있다 — 대입하면 던진다). 덮을 키를 고르고 테스트에서 비교할 때 쓴다 — 덮기는 펼쳐서 `messages` 로 넘긴다.
```

README 맨 끝(「IP 접근 제어」 → 「알려진 한계 · 수동 확인」 뒤)에 새 절을 더한다:

````markdown
## 용어 바꾸기

킷 화면은 코어 `users` 를 "사용자" 라 부른다. 다른 말(예: 서비스 회원과 가르려는 "운영자")을 쓰는 앱은 아래를 맞춘다.

| 어디              | 바꾸는 법                                                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 세션 표 · 확인 창 | `useSessions({ messages: { userColumn, revokeUserButton } })` — 「관리자 전체 목록」                                                                             |
| IP 화면           | `useIpAccessRules({ messages })` — "사용자" 가 든 키는 `DEFAULT_IP_ACCESS_MESSAGES` 에서 찾는다(함수 문구 포함)                                                  |
| 감사 로그         | 라벨은 admin-shared `defineAuditCatalog({ labels, targetLabels })`, 동작 묶음은 같은 prefix 로 덮는다(`actionGroups: [{ prefix: 'org.user', label: '운영자' }]`) |

🔴 한 단어를 일괄 치환하는 옵션은 없다 — 한국어 조사(을/를 · 은/는)가 단어의 받침에 따라 바뀐다. 키별로 덮는다.

덮은 결과에 옛 말이 남지 않았는지는 테스트로 잰다 — 킷을 올려 문구가 늘면 잡힌다. 함수 문구는 불러서 잰다.

```ts
import { DEFAULT_IP_ACCESS_MESSAGES } from '@ssworks/admin-ui'
import { ipMessages } from './ip-messages'

it('IP 화면 문구에 "사용자" 가 남지 않았다', () => {
  const merged = { ...DEFAULT_IP_ACCESS_MESSAGES, ...ipMessages }
  const left = Object.entries(merged)
    .map(([key, value]) => [key, typeof value === 'function' ? String(value(3)) : value] as const)
    .filter(([, text]) => typeof text === 'string' && text.includes('사용자'))
  expect(left).toEqual([])
})
```
````

(함수 문구의 인자 모양은 키마다 다르다 — 예시는 숫자 하나를 받는 `summaryEvaluated` 같은 키를 대표로 부른다. 앱 테스트는 키별로 맞춘다.)

Run: `pnpm exec prettier --write packages/admin-ui/README.md` 두 번 → `pnpm exec prettier --check packages/admin-ui/README.md` → 통과.

- [ ] **Step 4: changeset**

`.changeset/admin-ui-ringside-feedback-2.md`:

```markdown
---
'@ssworks/admin-ui': minor
---

ringside 둘째 보고 반영(PR #3i — `docs/superpowers/specs/2026-10-20-admin-kit-ringside-feedback-2-design.md`).

- `useIpAccessRules({ scopes })` — 층 목록. 팀 모듈(`AdminTeamsModule`)을 켜지 않은 앱은 `scopes: ['user', 'global']` 을 준다(안 주면 "팀" 층이 남고 저장은 늘 400). 표시 순서는 늘 사용자 → 팀 → 전체.
- 기본 문구를 공개한다 — `DEFAULT_SESSION_TABLE_MESSAGES` · `DEFAULT_IP_ACCESS_MESSAGES` · `DEFAULT_AUDIT_LOG_MESSAGES` · `DEFAULT_TEAM_TREE_MESSAGES` · `DEFAULT_TEAM_USER_LIST_MESSAGES` · `DEFAULT_TEAM_MESSAGES` · `DEFAULT_LEGAL_MESSAGES` · `DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES` · `CORE_AUDIT_ACTION_GROUPS`. 모두 얼려 있다 — 대입하면 던진다. 덮으려면 펼쳐서 `messages` 로 넘긴다.
- `ReauthDialog` — 설명(`message`)과 안내를 다른 문단으로 그리고, 안내는 `prompt` prop 으로 바꾼다(기본 「현재 비밀번호를 입력하세요.」). 🔴 두 문구를 한 문단 글자로 재던 앱 테스트는 문단별로 고친다.
- 🔴 `useServerTable` — 기본 정렬 열은 헤더로 내림 ↔ 오름을 오간다(그 전에는 기본 열이 오름에 닿지 못했다). 동작 변경: 이미 기본 정렬일 때 `sortBy.value = []` 로 되돌리던 코드는 반대 방향이 된다 — `sortBy.value = [{ ...기본 }]` 으로 바꾼다.
- README: 세로 폼은 칸 사이 `gap: 12px`(프리셋 `hideDetails: 'auto'`) · 「용어 바꾸기」.
```

- [ ] **Step 5: 진행 문서**

`CLAUDE.md` 진행표 — `| Phase 4 — 첫 신규 프로젝트(ringside) 실전 검증 → 1.0 |` 행 바로 앞에 행을 더한다:

```markdown
| Phase 1 후속 PR #3i — ringside 둘째 보고 반영 UI(`useIpAccessRules` `scopes` · 기본 문구 export · `ReauthDialog` `prompt` · 기본 정렬 열 순환 · 세로 폼 간격 README) | 완료 | 스펙 `docs/superpowers/specs/2026-10-20-admin-kit-ringside-feedback-2-design.md` · 플랜 `docs/superpowers/plans/2026-10-20-admin-ui-ringside-feedback-2.md` |
```

`docs/01-phase0.md` §8 — `admin-ui ringside 보고 반영 PR #3h(2026-10-18) 완료 — …` 문단 바로 뒤에 빈 줄을 두고:

```markdown
admin-ui ringside 둘째 보고 반영 PR #3i(2026-10-20) 완료 — `useIpAccessRules({ scopes })`(팀 모듈 없는 앱의 층) · 기본 문구 여덟 + `CORE_AUDIT_ACTION_GROUPS` 공개(얼림 — 3f/3g C2 를 뒤집음) · `ReauthDialog` 설명 · 안내 두 문단과 `prompt` · `useServerTable` 기본 정렬 열 내림 ↔ 오름 · README 세로 폼 간격 · 용어 바꾸기(스펙 `docs/superpowers/specs/2026-10-20-admin-kit-ringside-feedback-2-design.md` · 플랜 `docs/superpowers/plans/2026-10-20-admin-ui-ringside-feedback-2.md`). 입력은 ringside 둘째 보고(`docs/reports/2026-10-20-admin-kit-report.md`). 서버 몫(전권 전용 · 서버 문구)은 PR 2g.
```

`docs/HANDOFF.md`:

- 제목 `# HANDOFF — 2026-10-18` → `# HANDOFF — 2026-10-20`.
- 「지금 상태」 `@ssworks/admin-ui` 행에서 「0.8.0 공개, 2026-10-18)」 바로 뒤에 아래 글을 붙인다(앞에 공백 하나):

```markdown
· **PR #3i**(ringside 둘째 보고 UI — `useIpAccessRules` `scopes` · 기본 문구 export · `ReauthDialog` `prompt` · 기본 정렬 열 순환 — `main` 에 로컬 병합, 0.9.0 예정)
```

- 「지금 상태」 「다음 플랜」 행의 머리 「**PR #3h 뒤**:」 바로 앞에 아래 글을 넣는다(뒤에 공백 하나):

```markdown
**PR #3i 뒤**: PR 2g(전권 전용 `fullAccessOnly` · 서버 문구 `messages` — 같은 스펙, 플랜 `docs/superpowers/plans/2026-10-20-admin-kit-full-access-messages.md`). 두 PR 이 `main` 에 들어간 뒤 Version Packages(0.9.0 ×3).
```

- 「알려진 미확인·보류」 의 `- **PR #3h 가 넘긴 것(2026-10-18)** …` 항목 묶음 뒤에 더한다:

```markdown
- **PR #3i 가 넘긴 것(2026-10-20)** — 입력 `docs/reports/2026-10-20-admin-kit-report.md` · 스펙 `docs/superpowers/specs/2026-10-20-admin-kit-ringside-feedback-2-design.md`
  - 실서버 확인이 넘긴 결함 ①(기본 정렬 열 오름)은 이 PR 에서 닫음. ②(조회 실패 직후 빈 상태)는 그대로.
  - R5 실측 결과는 검증 기록 `docs/verification/2026-10-20-admin-kit-ringside-feedback-2.md` §3(Task 6 에서 채운다).
  - **ringside 적용법(UI 몫 — 0.9.0 공개 하루 뒤 설치)**: ① IP 화면 `useIpAccessRules({ scopes: ['user', 'global'] })` ② 덮을 키를 고르는 테스트는 `DEFAULT_*_MESSAGES` import 로(설치된 `dist/index.js` 를 읽지 않는다) ③ 회원 목록 기본 정렬 결함 메모(ringside CLAUDE.md "알려진 킷 결함")를 지운다 ④ 세로 폼(제재 부과 대화상자)에 `gap: 12px` ⑤ 재인증 설명은 그대로 — 안내가 다른 문단이 된다. 서버 몫(①' 카탈로그 `fullAccessOnly` · ②' 서버 `messages`)은 PR 2g 가 더한다.
  - **템플릿 세션 입력**(`preset/admin` — push 는 사람): 0.9.0 핀은 PR 2g 뒤. 템플릿은 팀 모듈을 켜므로 `scopes` 를 두지 않는다. 템플릿 테스트가 `sortBy.value = []` 로 기본 정렬을 되돌리면 `[{ ...기본 }]` 로.
```

Run: `pnpm exec prettier --write CLAUDE.md docs/01-phase0.md docs/HANDOFF.md .changeset/admin-ui-ringside-feedback-2.md` 두 번 → `--check` 통과.

- [ ] **Step 6: 전체 검사**

Run: `pnpm check`
Expected: lint → typecheck → test → build → check:dts 모두 초록.

Run: `pnpm format:check` → 통과.

- [ ] **Step 7: 커밋**

```bash
git add packages/admin-ui/README.md .changeset/admin-ui-ringside-feedback-2.md CLAUDE.md docs/01-phase0.md docs/HANDOFF.md
git commit -m "docs(admin-ui): PR #3i — README(층 scopes · 세로 폼 간격 · 정렬 순환 · export 표 · 용어 바꾸기) · changeset · 진행 문서

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: 스모크 · 실브라우저 검증 · 검증 기록

**Files:**

- Create: `docs/verification/2026-10-20-admin-kit-ringside-feedback-2.md`(prettier 밖 — `.prettierignore` 의 `docs/verification/`)
- Modify: `docs/HANDOFF.md` (「지금 상태」 검증 행)
- 저장소 밖(커밋하지 않음): `$LOCALAPPDATA/Temp/aksi/` — 짧은 경로(긴 경로에서 pnpm 12 설치가 os error 3)

**Interfaces:**

- Consumes: Task 1~5 의 빌드 산출물 · `.claude/commands/smoke.md` 절차
- Produces: 검증 기록(측정표)

- [ ] **Step 1: 패킹 · 스모크 앱**

`.claude/commands/smoke.md` 1~4 를 그대로 따른다. 작업 폴더는 Git Bash 의 `"$LOCALAPPDATA/Temp/aksi"`(포그라운드로 — 백그라운드 Bash 산출물은 저장소 밖에 남지 않은 적이 있다). 앱 `package.json` 의 `packageManager` 는 `pnpm@12.8.1`. 더할 것:

- dependencies 에 `vue-router@^5`(admin-ui peer — 측정 페이지가 해시 라우터를 쓴다).
- devDependencies 에 `playwright-core`(측정 스크립트용 — 저장소에는 더하지 않는다).
- 앱 `vite.config.ts` 의 `plugins` 맨 앞에 `vuetifyLayerOrder()`(`import { vuetifyLayerOrder } from '@ssworks/admin-ui/vite'`), `build.rolldownOptions.input` 에 `{ main: 'index.html', measure: 'measure.html' }`(Vite 8 — `rollupOptions` 가 아니다).
- 스모크 앱의 `src/App.vue`(smoke.md 가 만든 것)에서 새 공개 이름을 쓴다 — 타입 검사가 export 를 잰다:

```ts
import {
  CORE_AUDIT_ACTION_GROUPS,
  DEFAULT_AUDIT_LOG_MESSAGES,
  DEFAULT_IP_ACCESS_MESSAGES,
  DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES,
  DEFAULT_LEGAL_MESSAGES,
  DEFAULT_SESSION_TABLE_MESSAGES,
  DEFAULT_TEAM_MESSAGES,
  DEFAULT_TEAM_TREE_MESSAGES,
  DEFAULT_TEAM_USER_LIST_MESSAGES,
  type UseIpAccessRulesOptions,
} from '@ssworks/admin-ui'

const scopes: UseIpAccessRulesOptions['scopes'] = ['user', 'global']
const defaults = [
  DEFAULT_AUDIT_LOG_MESSAGES.readOnlyNote,
  DEFAULT_IP_ACCESS_MESSAGES.scopeUser,
  DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES.kindTabs,
  DEFAULT_LEGAL_MESSAGES.published('약관'),
  DEFAULT_SESSION_TABLE_MESSAGES.userColumn,
  DEFAULT_TEAM_MESSAGES.nameRequired,
  DEFAULT_TEAM_TREE_MESSAGES.treeLabel,
  Object.keys(DEFAULT_TEAM_USER_LIST_MESSAGES).length,
  CORE_AUDIT_ACTION_GROUPS.length,
  scopes,
]
```

(`defaults` 를 템플릿 어딘가에서 `{{ defaults.length }}` 로 쓴다 — 쓰지 않은 변수 lint 를 피한다.)

- [ ] **Step 2: 측정 페이지**

앱 `measure.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>measure</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/measure.ts"></script>
  </body>
</html>
```

앱 `src/measure.ts`:

```ts
import { createAdminVuetify } from '@ssworks/admin-ui'
import { createApp, h } from 'vue'
import { createRouter, createWebHashHistory, RouterView } from 'vue-router'
import 'vuetify/styles'
import '@ssworks/admin-ui/style.css'
import FormGap from './FormGap.vue'
import ReauthView from './ReauthView.vue'
import SortTable from './SortTable.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/form', component: FormGap },
    { path: '/reauth', component: ReauthView },
    { path: '/table', component: SortTable },
  ],
})

createApp({ render: () => h(RouterView) })
  .use(createAdminVuetify())
  .use(router)
  .mount('#app')
```

앱 `src/FormGap.vue` — 보고서 §5 의 제재 부과 대화상자 모양(칸 넷 · 위 셋에 오류 · 값이 있어 라벨이 떠 있다), 간격 없음 · `gap: 12px` 두 벌:

```vue
<script setup lang="ts">
  import { VApp, VCard, VCardText, VMain, VSelect, VTextField, VTextarea } from 'vuetify/components'

  const kinds = ['글쓰기 금지', '접속 차단']
  const variants = ['nogap', 'gap'] as const
</script>

<template>
  <VApp>
    <VMain>
      <div class="cards">
        <VCard v-for="variant in variants" :key="variant" :class="`card-${variant}`" width="480">
          <VCardText>
            <div :class="variant === 'gap' ? 'form form--gap' : 'form'">
              <VSelect
                :error-messages="['종류를 다시 고르세요.']"
                :items="kinds"
                label="종류"
                model-value="글쓰기 금지"
              />
              <VTextField
                :error-messages="['1 이상이어야 합니다.']"
                label="기간(일)"
                model-value="0"
              />
              <VTextarea
                :error-messages="['사유를 10자 이상 적으세요.']"
                label="사유"
                model-value="도배"
              />
              <VTextField label="메모" model-value="-" />
            </div>
          </VCardText>
        </VCard>
      </div>
    </VMain>
  </VApp>
</template>

<style scoped>
  .cards {
    display: flex;
    gap: 48px;
    padding: 24px;
  }
  .form {
    display: flex;
    flex-direction: column;
  }
  .form--gap {
    gap: 12px;
  }
</style>
```

앱 `src/ReauthView.vue`:

```vue
<script setup lang="ts">
  import { ref } from 'vue'
  import { VApp, VMain } from 'vuetify/components'
  import { ReauthDialog } from '@ssworks/admin-ui'

  const open = ref(true)
</script>

<template>
  <VApp>
    <VMain>
      <ReauthDialog v-model="open" message="「글쓰기 금지」 7일 — 사유: 도배" />
    </VMain>
  </VApp>
</template>
```

앱 `src/SortTable.vue` — 해시 URL 에 정렬이 남는지 본다:

```vue
<script setup lang="ts">
  import { VApp, VMain } from 'vuetify/components'
  import { DataTableBody, useServerTable } from '@ssworks/admin-ui'

  type Row = { userId: string; joinAt: string }
  const all: Row[] = [
    { userId: 'kim', joinAt: '2026-01-03' },
    { userId: 'lee', joinAt: '2026-02-11' },
    { userId: 'park', joinAt: '2026-03-20' },
  ]
  const headers = [
    { title: '아이디', key: 'userId' },
    { title: '가입', key: 'joinAt' },
  ]
  const { page, itemsPerPage, sortBy, items, total, loading } = useServerTable<Row>({
    fetch: async (params) => {
      const key = (params.sortBy[0] ?? 'joinAt') as keyof Row
      const dir = params.sortOrder[0] === 'asc' ? 1 : -1
      const sorted = [...all].sort((a, b) => (a[key] < b[key] ? -dir : a[key] > b[key] ? dir : 0))
      return { items: sorted, total: sorted.length }
    },
    sort: { keys: ['userId', 'joinAt'], default: { key: 'joinAt', order: 'desc' } },
    urlSync: { read: () => undefined, toQuery: () => ({}) },
  })
</script>

<template>
  <VApp>
    <VMain>
      <DataTableBody
        v-model:items-per-page="itemsPerPage"
        v-model:page="page"
        v-model:sort-by="sortBy"
        :headers="headers"
        :items="items"
        :items-length="total"
        :loading="loading"
      />
    </VMain>
  </VApp>
</template>
```

- [ ] **Step 3: 타입 · 빌드**

앱 폴더에서(Git Bash):

```bash
pnpm exec vue-tsc --noEmit
pnpm exec vite build
```

Expected: 둘 다 성공.

- [ ] **Step 4: 실브라우저 측정**

앱 `measure.mjs`:

```js
import { chromium } from 'playwright-core'
import { preview } from 'vite'

const server = await preview({ preview: { port: 5191, strictPort: true } })
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'chrome' })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const base = 'http://localhost:5191/measure.html'
const results = {}

// R5 — 위 칸 오류 문구 아래쪽 − 아래 칸 떠 있는 라벨 위쪽(양수면 겹침, px)
await page.goto(`${base}#/form`, { waitUntil: 'networkidle' })
results.form = await page.evaluate(() => {
  const overlaps = (card) => {
    const fields = [...document.querySelectorAll(`.${card} .v-input`)]
    return fields.slice(0, -1).map((field, i) => {
      const msg = field.querySelector('.v-messages__message')
      const label = fields[i + 1].querySelector('.v-field-label--floating')
      if (!msg || !label) return { pair: i, missing: !msg ? 'message' : 'label' }
      const value = msg.getBoundingClientRect().bottom - label.getBoundingClientRect().top
      return {
        pair: i,
        overlapPx: Math.round(value * 10) / 10,
        labelVisible: getComputedStyle(label).visibility,
      }
    })
  }
  return { nogap: overlaps('card-nogap'), gap: overlaps('card-gap') }
})

// R6 — 재인증 창의 문단
await page.goto(`${base}#/reauth`, { waitUntil: 'networkidle' })
results.reauth = await page.evaluate(() => {
  const ps = [...document.querySelectorAll('.v-overlay .v-card-text p')]
  const rects = ps.map((p) => p.getBoundingClientRect())
  return {
    texts: ps.map((p) => p.textContent.trim()),
    separated: rects.length === 2 && rects[1].top >= rects[0].bottom,
  }
})

// R7 — 기본 열 헤더 클릭 순환과 URL
await page.goto(`${base}#/table`, { waitUntil: 'networkidle' })
const firstIds = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('tbody tr')].map((tr) => tr.children[0].textContent.trim()),
  )
const joinHeader = page.locator('th', { hasText: '가입' })
results.table = { start: { ids: await firstIds(), url: page.url() } }
await joinHeader.click()
await page.waitForTimeout(300)
results.table.click1 = { ids: await firstIds(), url: page.url() }
await joinHeader.click()
await page.waitForTimeout(300)
results.table.click2 = { ids: await firstIds(), url: page.url() }

await browser.close()
await server.close()
console.log(JSON.stringify(results, null, 2))
```

Run: `node measure.mjs`(Chrome 이 없으면 `BROWSER_CHANNEL=msedge node measure.mjs`)
Expected:

- `form.nogap`: 오류가 있는 쌍(0 · 1 · 2) 중 하나 이상의 `overlapPx` 가 0 보다 크다(보고서 재현). `form.gap`: 셋 모두 0 이하. `labelVisible` 은 모두 `visible`.
- `reauth.texts` = `['「글쓰기 금지」 7일 — 사유: 도배', '현재 비밀번호를 입력하세요.']` · `separated: true`.
- `table`: `start.ids` = `['park', 'lee', 'kim']`(가입 내림) · URL 에 sort 없음 → `click1.ids` = `['kim', 'lee', 'park']` · URL 에 `sort=joinAt:asc` → `click2.ids` = `['park', 'lee', 'kim']` · URL 에 sort 없음.

🔴 멈출 때: `form.nogap` 이 겹치지 않으면(보고서가 재현되지 않으면) 측정이 원인을 증명하지 못한다 — 값을 그대로 보고하고 멈춘다. `form.gap` 이 여전히 겹치면 README 안내가 틀렸다 — 스펙 §2-8 대로 R5 를 다시 연다(멈추고 보고). 다른 값이 기대와 다르면 멈추고 값 그대로 보고한다(고치지 않는다).

- [ ] **Step 5: 검증 기록**

`docs/verification/2026-10-20-admin-kit-ringside-feedback-2.md` — 아래 틀에 Step 1~4 의 실제 값을 채운다(값을 지어내지 않는다). PR 2g 가 §5 이후를 더한다:

```markdown
# 검증 — ringside 둘째 보고 반영 (PR #3i · 2g, 2026-10-20)

스펙 `docs/superpowers/specs/2026-10-20-admin-kit-ringside-feedback-2-design.md` §8.

## 1. 저장소(PR #3i)

- 브랜치 `feat/admin-ui-ringside-feedback-2` · 끝 커밋 `<해시>`
- `pnpm check` 초록 — admin-ui <N> 테스트 · 워크스페이스 <N>
- `pnpm format:check` 통과

## 2. 스모크(`$LOCALAPPDATA/Temp/aksi`)

- tarball: admin-shared <버전> · admin-ui <버전>
- `vue-tsc --noEmit` <결과> · `vite build` <결과> — 새 export 아홉 · `scopes` 타입 사용

## 3. 실브라우저(<브라우저 · 버전>, 1600×1000)

| 항목                                   | 기대                              | 실제 |
| -------------------------------------- | --------------------------------- | ---- |
| R5 간격 없음 — 쌍 0 · 1 · 2 겹침(px)   | 하나 이상 > 0                     | <값> |
| R5 `gap: 12px` — 쌍 0 · 1 · 2 겹침(px) | 모두 ≤ 0                          | <값> |
| R6 문단                                | 설명 · 안내 둘, 나뉨              | <값> |
| R7 처음                                | park · lee · kim, sort 없음       | <값> |
| R7 가입 클릭 1                         | kim · lee · park, sort=joinAt:asc | <값> |
| R7 가입 클릭 2                         | park · lee · kim, sort 없음       | <값> |

## 4. 남은 것

- <측정 중 본 것 · 기대와 다른 값 · 사람이 볼 것>
```

- [ ] **Step 6: HANDOFF 검증 행 · 커밋**

`docs/HANDOFF.md` 「지금 상태」 「검증」 행의 끝(「docs/verification/2026-10-18-admin-ui-ringside-feedback.md.」 뒤)에 아래 글을 붙인다(앞에 공백 하나, `<…>` 는 실제 값):

```markdown
PR #3i(2026-10-20)는 Windows 에서 pnpm check 초록, 스모크(`$LOCALAPPDATA/Temp/aksi` — 새 export 아홉 · scopes)와 실브라우저 측정(<브라우저> — 세로 폼 겹침 간격 없음 <값> → gap 12px <값> · 재인증 두 문단 · 기본 열 헤더 내림 → 오름 → 내림 · URL sort=joinAt:asc)을 통과했다 — docs/verification/2026-10-20-admin-kit-ringside-feedback-2.md.
```

또 「PR #3i 가 넘긴 것」의 「R5 실측 결과는 … (Task 6 에서 채운다)」 줄을 실제 결과 한 줄로 바꾼다.

Run: `pnpm exec prettier --write docs/HANDOFF.md` 두 번 → `--check` 통과.

```bash
git add docs/verification/2026-10-20-admin-kit-ringside-feedback-2.md docs/HANDOFF.md
git commit -m "docs(admin-ui): PR #3i 검증 기록 — 스모크 · 실브라우저 세로 폼 겹침 · 재인증 문단 · 기본 열 정렬 순환

Co-Authored-By: Claude <noreply@anthropic.com>"
```

브랜치 끝: whole-branch 리뷰(opus) → 사람이 정한 대로 `main` 에 로컬 병합(push · PR 은 사람). PR 2g 는 그 `main` 위에서 시작한다.
