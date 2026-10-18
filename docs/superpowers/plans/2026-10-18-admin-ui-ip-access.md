# admin-ui IP 접근 제어 화면(PR #3g) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin-ui 에 IP 접근 제어 흐름 `useIpAccessRules` 와 화면 한 벌 `IpAccessManager` 를 넣어, 새 관리자 앱이 어댑터만 넘기면 IP 규칙 관리 화면(현재 IP · 변경 영향 미리보기 · 편집 · 목록)이 서게 한다.

**Architecture:** 판정 · 문구는 순수 함수 모듈 `components/ip-access/ip-access.ts` 에 두고 단위 테스트로 고정한다. 미리보기 상태 기계(질의 · 디바운스 · 순번 · flush)는 내부 composable `useIpPreview` 로 떼어 따로 잰다. `useIpAccessRules` 가 목록 · 편집 · 대상 후보 · 쓰기(`useWriteFlow` 관문)를 묶어 `manager` 바인딩을 내고, 제네릭 SFC `IpAccessManager` 가 내부 부품 넷(카드 · 편집 패널 · 대상 칸 · 표)과 창 셋을 그린다. 3f 의 행위자 자동완성 가드는 공용 내부 부품 `RemoteSearchField` 로 빼서 3f · 3g 가 함께 쓴다.

**Tech Stack:** Vue 3.5 · Vuetify 4.2 · TypeScript 6 · Vitest 5 + @vue/test-utils + happy-dom · @ssworks/admin-shared 0.4.0+ (IP 계약 · 팀 트리 타입)

**Spec:** `docs/superpowers/specs/2026-10-18-admin-ui-audit-ip-design.md` — 이 플랜은 그중 3g(§2-1 · §2-2 C1–C9 · §2-4 I1–I24 · §4-3 · §4-4 · §4-5 · §4-6 IP 부분 · §7 IP 부분 · §8 3g 부분 · §9)를 구현한다. 실행자는 스펙과 함께 읽는다. 3f 는 main 에 들어가 있다(0.6.0).

## Global Constraints

- 브랜치 `feat/admin-ui-ip-access`(main `40cb1a9` 에서 갈라짐). `main` 에 직접 커밋하지 않는다.
- **admin-shared · admin-server 는 고치지 않는다.** IP · 팀 export 는 모두 admin-shared 0.4.0 에 있다 — admin-ui peer 하한(`>=0.4.0 <1.0.0`)은 그대로다.
- SFC 는 Vuetify 컴포넌트를 `vuetify/components` 에서 명시 import 한다. 스타일은 순수 CSS `<style scoped>`. 스토어 · 라우터를 import 하지 않는다.
- `import type` 을 분리한다. 내부 상대 import 는 `.js` 확장자(`.vue` 는 그대로).
- `console.log` 금지. 정규식에 백슬래시 문자 클래스를 쓰지 않는다 — `[0-9]` 로 적는다.
- 새 파일 머리 주석에 **정본**(출처)과 **바꾼 점**을 적는다. `🔴` 주석은 "지우면 사고가 나는 이유"다.
- Boolean prop 에 `undefined` 기본값을 주지 않는다.
- 테스트: `src/**/*.test.ts`. DOM 이 필요하면 파일 머리 `// @vitest-environment happy-dom`. 오버레이 컴포넌트(`VSelect` · `VAutocomplete` · `VDialog`)를 그리는 파일은 모듈 최상단에서 `installVisualViewport()`. `data-testid` 를 심지 않는다 — 글자 · 접근 이름 · `name` 으로 찾는다. 가짜 타이머는 `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })`, `afterEach` 에서 `vi.useRealTimers()`.
- 미리보기 디바운스는 `300`ms(`IP_PREVIEW_DEBOUNCE_MS`) — 편집(만들기 · 수정) 질의만. 현행 · 삭제는 바로.
- 용어는 킷 README 를 따른다: 사용자 · 팀 · 전체(hangang 의 계정 · 팀 · 전역이 아니다). 기본 문구는 이 플랜에 적힌 글자 그대로다.
- 명령은 저장소 루트에서: 패키지 하나 `pnpm --filter @ssworks/admin-ui test`, 파일 하나 `pnpm --filter @ssworks/admin-ui exec vitest run <경로>`, 타입 `pnpm --filter @ssworks/admin-ui typecheck`, lint `pnpm exec eslint <파일들>`.
- 커밋 메시지: 한국어 conventional commits, 끝 줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `.claude/settings.json` 의 로컬 변경은 커밋하지 않는다.
- Windows · Linux 양쪽: Unix 파일 명령 대신 전용 도구, `> /dev/null` 금지.

## Review Focus

1. **편집 중 범위를 팀 → 사용자로 바꿈** — 기대: 팀 번호가 사용자 번호로 남아 엉뚱한 사람에게 규칙이 걸리지 않는다(범위를 바꾸면 대상이 빈다). → Task 1 `withScopeType` · Task 4 "범위를 바꾸면 대상을 비운다".
2. **CIDR 을 친 직후(디바운스 중) [저장]** — 기대: 미리보기를 마친 뒤 관문이 열리고 창 문구가 그 입력의 최종 영향이다. → Task 5 "디바운스 중에 눌러도 미리보기를 마친 뒤 관문".
3. **[저장] 연타 · Enter 연타** — 기대: 요청은 한 번. → Task 5 "두 번 눌러도 한 번만".
4. **지우려는 규칙을 다른 관리자가 먼저 지움(미리보기 404)** — 기대: 관문을 열지 않고 "이미 지워진 규칙" 안내, 목록 재조회. → Task 5 "미리보기 404 면 관문을 열지 않는다".
5. **서버가 클라이언트 주소를 못 읽음(`clientIp: null`)** — 기대: 통과 줄이 빈 괄호가 아니라 "알 수 없는 주소"로 적힌다. → Task 2 `passLine` 테스트.

---

## File Structure

| 파일 (모두 `packages/admin-ui/` 아래)                                                                                                             | 책임                                                           | Task  |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----- |
| `src/components/ip-access/ip-access.ts` · `.test.ts`                                                                                              | IP 타입 · 기본 문구 · 폼/질의/본문 · 미리보기 문구 · 관문 문구 | 1 · 2 |
| `src/composables/useIpPreview.ts` · `.test.ts`                                                                                                    | 미리보기 상태 기계(내부)                                       | 3     |
| `src/composables/useIpAccessRules.ts` · `.render.test.ts`                                                                                         | 목록 · 편집 · 후보 · 바인딩                                    | 4     |
| `src/composables/useIpAccessRules.write.render.test.ts`                                                                                           | 쓰기(저장 · 삭제 · 관문 · 오류)                                | 5     |
| `src/components/common/RemoteSearchField.vue` · `remote-search-field.render.test.ts`                                                              | 서버 검색 자동완성 칸(내부, 3f · 3g 공용)                      | 6     |
| `src/components/audit/AuditLogFilterBar.vue`                                                                                                      | 행위자 칸을 `RemoteSearchField` 로                             | 6     |
| `src/components/ip-access/IpPreviewCard.vue` · `IpRuleTable.vue` · `ip-access-parts.render.test.ts`                                               | 카드 · 표(내부)                                                | 7     |
| `src/components/ip-access/IpTargetField.vue` · `IpRuleEditor.vue` · `IpAccessManager.vue` · `ip-access-manager.render.test.ts`                    | 대상 칸 · 편집 패널 · 화면 한 벌                               | 8     |
| `src/index.ts` · `README.md` · `../../.changeset/admin-ui-ip-access.md` · `../../CLAUDE.md` · `../../docs/01-phase0.md` · `../../docs/HANDOFF.md` | 공개 · 문서 · 릴리스                                           | 9     |

---

### Task 1: IP 타입 · 기본 문구 · 폼 · 질의 · 본문

**Files:**

- Create: `packages/admin-ui/src/components/ip-access/ip-access.ts`
- Create: `packages/admin-ui/src/components/ip-access/ip-access.test.ts`

**Interfaces:**

- Consumes: admin-shared `IP_ACCESS_SCHEMA_MESSAGES` · `IP_CIDR_MAX_LENGTH` · `IP_RULE_DESCRIPTION_MAX_LENGTH` · `ipCidrSchema` · 타입 `AdminIpPreview` · `AdminIpPreviewQuery` · `AdminIpRule` · `AdminIpRuleCreate` · `AdminIpRuleUpdate` · `AdminTeamNode` · `IpScopeType`
- Produces (모두 `components/ip-access/ip-access.ts` 에서 export):
  - 타입: `IpUserOption` · `IpWriteContext` · `IpRuleForm { scopeType: IpScopeType; scopeRefNo: string; cidr: string; description: string }` · `IpRuleFormField = keyof IpRuleForm` · `IpPreviewOp = 'create' | 'update' | 'delete'` · `IpPreviewState` · `IpPreviewView { state; op: IpPreviewOp | null; result: AdminIpPreview | null; clientIp: string | null }` · `IpPreviewTarget` · `IpSelectItem { value: string; title: string }` · `IpAccessAlert { kind: 'error' | 'warning'; text: string }` · `IpGateKind = 'create' | 'update' | 'remove'` · `IpAccessMessages`(아래 전체)
  - 값: `IP_RULE_FORM_FIELDS` · `IP_SCOPE_ORDER` · `DEFAULT_IP_ACCESS_MESSAGES`
  - 함수: `scopeTypeLabel(scopeType, messages)` · `scopeTypeItems(messages)` · `emptyIpRuleForm()` · `ruleToForm(rule)` · `sameIpRuleForm(a, b)` · `withScopeType(form, scopeType)` · `ipRuleFormProblems(form, messages): Record<string, string[]>` · `isIpRuleFormPreviewable(form)` · `previewQueryOf(target): AdminIpPreviewQuery | null` · `previewQueryKey(query | null): string` · `toCreateBody(form)` · `toUpdateBody(form, revision)` · `flattenTeamPaths(tree): IpSelectItem[]` · `userOptionTitle({ userName, userId })` · `ruleScopeTitle(rule, messages)` · `ruleScopeSub(rule, messages)` · `formScopeTitle(form, targetTitle, messages)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-ui/src/components/ip-access/ip-access.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  IP_ACCESS_SCHEMA_MESSAGES,
  type AdminIpRule,
  type AdminTeamNode,
} from '@ssworks/admin-shared'
import {
  DEFAULT_IP_ACCESS_MESSAGES as M,
  IP_RULE_FORM_FIELDS,
  emptyIpRuleForm,
  flattenTeamPaths,
  formScopeTitle,
  ipRuleFormProblems,
  isIpRuleFormPreviewable,
  previewQueryKey,
  previewQueryOf,
  ruleScopeSub,
  ruleScopeTitle,
  ruleToForm,
  sameIpRuleForm,
  scopeTypeItems,
  toCreateBody,
  toUpdateBody,
  userOptionTitle,
  withScopeType,
  type IpRuleForm,
} from './ip-access.js'

// 정본: hangang-home apps/admin/src/pages/settings/ip-access-messages.ts 의 판정 사례를 킷 계약(사용자 · 팀 · 전체,
//       admin-shared 의 같은 CIDR 파서)으로 옮겼다.

const rule = (over: Partial<AdminIpRule> = {}): AdminIpRule => ({
  ruleNo: 12n,
  scopeType: 'team',
  scopeRefNo: 4n,
  scopeName: '상담센터',
  scopeUserId: null,
  cidr: '203.0.113.0/24',
  description: '상담센터 사무실',
  revision: 3,
  createAt: '2026-10-01T00:00:00.000Z',
  updateAt: '2026-10-02T00:00:00.000Z',
  ...over,
})

const form = (over: Partial<IpRuleForm> = {}): IpRuleForm => ({ ...emptyIpRuleForm(), ...over })

describe('범위 · 폼', () => {
  it('🔴 범위 항목은 가까운 층부터 — 그 순서가 평가 순서다', () => {
    expect(scopeTypeItems(M)).toEqual([
      { value: 'user', title: '사용자' },
      { value: 'team', title: '팀' },
      { value: 'global', title: '전체' },
    ])
  })

  it('새 폼은 전체 범위 · 빈 칸', () => {
    expect(emptyIpRuleForm()).toEqual({
      scopeType: 'global',
      scopeRefNo: '',
      cidr: '',
      description: '',
    })
  })

  it('규칙 → 폼 — 번호는 문자열, null 은 빈 칸', () => {
    expect(ruleToForm(rule())).toEqual({
      scopeType: 'team',
      scopeRefNo: '4',
      cidr: '203.0.113.0/24',
      description: '상담센터 사무실',
    })
    expect(
      ruleToForm(
        rule({ scopeType: 'global', scopeRefNo: null, scopeName: null, description: null }),
      ),
    ).toEqual({ scopeType: 'global', scopeRefNo: '', cidr: '203.0.113.0/24', description: '' })
  })

  it('같은 폼인가 — 네 칸 모두', () => {
    expect(IP_RULE_FORM_FIELDS).toEqual(['scopeType', 'scopeRefNo', 'cidr', 'description'])
    expect(sameIpRuleForm(form({ cidr: 'a' }), form({ cidr: 'a' }))).toBe(true)
    expect(sameIpRuleForm(form({ cidr: 'a' }), form({ cidr: 'a ' }))).toBe(false)
  })

  it('🔴 범위를 바꾸면 대상을 비운다 — 팀 번호가 사용자 번호로 남지 않게', () => {
    const team = form({ scopeType: 'team', scopeRefNo: '4', cidr: '10.0.0.0/8' })
    expect(withScopeType(team, 'user')).toEqual({ ...team, scopeType: 'user', scopeRefNo: '' })
    expect(withScopeType(team, 'global')).toEqual({ ...team, scopeType: 'global', scopeRefNo: '' })
    expect(withScopeType(team, 'team')).toEqual(team)
  })
})

describe('칸 검증 — 비밀번호를 묻기 전에', () => {
  it('맞으면 빈 객체', () => {
    expect(ipRuleFormProblems(form({ cidr: '203.0.113.0/24' }), M)).toEqual({})
    expect(
      ipRuleFormProblems(form({ scopeType: 'team', scopeRefNo: ' 4 ', cidr: '::/0' }), M),
    ).toEqual({})
  })

  it('대상 — 팀 · 사용자는 번호가 있어야 하고 숫자만, 전체는 보지 않는다', () => {
    expect(ipRuleFormProblems(form({ scopeType: 'team', cidr: '10.0.0.0/8' }), M)).toEqual({
      scopeRefNo: [M.scopeRefRequired],
    })
    expect(
      ipRuleFormProblems(form({ scopeType: 'user', scopeRefNo: 'abc', cidr: '10.0.0.0/8' }), M),
    ).toEqual({ scopeRefNo: [M.scopeRefDigits] })
    expect(ipRuleFormProblems(form({ scopeRefNo: 'abc', cidr: '10.0.0.0/8' }), M)).toEqual({})
  })

  it('CIDR — 빈 값 · 43자 초과 · 🔴 서버와 같은 파서(프리픽스 없음 · 선행 0)', () => {
    expect(ipRuleFormProblems(form(), M).cidr).toEqual([M.cidrRequired])
    expect(ipRuleFormProblems(form({ cidr: '1'.repeat(44) }), M).cidr).toEqual([M.cidrTooLong])
    expect(ipRuleFormProblems(form({ cidr: '10.0.0.1' }), M).cidr).toEqual([
      IP_ACCESS_SCHEMA_MESSAGES.cidr,
    ])
    expect(ipRuleFormProblems(form({ cidr: '010.0.0.0/8' }), M).cidr).toEqual([
      IP_ACCESS_SCHEMA_MESSAGES.cidr,
    ])
  })

  it('설명 — 200자 초과', () => {
    expect(
      ipRuleFormProblems(form({ cidr: '10.0.0.0/8', description: 'x'.repeat(201) }), M).description,
    ).toEqual([M.descriptionTooLong])
    expect(
      ipRuleFormProblems(form({ cidr: '10.0.0.0/8', description: 'x'.repeat(200) }), M),
    ).toEqual({})
  })
})

describe('미리보기 질의', () => {
  const ready = form({ cidr: ' 203.0.113.0/24 ' })

  it('칸이 다 찼는가 — CIDR 은 같은 파서, 팀 · 사용자는 숫자 번호', () => {
    expect(isIpRuleFormPreviewable(ready)).toBe(true)
    expect(isIpRuleFormPreviewable(form({ cidr: '203.0.113.0/' }))).toBe(false)
    expect(isIpRuleFormPreviewable(form({ scopeType: 'team', cidr: '10.0.0.0/8' }))).toBe(false)
    expect(
      isIpRuleFormPreviewable(form({ scopeType: 'team', scopeRefNo: '4', cidr: '10.0.0.0/8' })),
    ).toBe(true)
  })

  it('🔴 패널 닫힘은 {}(현행), 덜 찬 폼은 null(부르지 않음) — 둘은 다르다', () => {
    expect(previewQueryOf({ op: null })).toEqual({})
    expect(previewQueryOf({ op: 'create', form: form() })).toBeNull()
    expect(previewQueryOf({ op: 'create', form: form({ cidr: '10.0.0.1' }) })).toBeNull()
    expect(
      previewQueryOf({
        op: 'update',
        ruleNo: 12n,
        form: form({ scopeType: 'team', scopeRefNo: 'abc', cidr: '10.0.0.0/8' }),
      }),
    ).toBeNull()
  })

  it('🔴 전체 범위는 scopeRefNo 를 싣지 않는다 · CIDR 은 앞뒤 공백을 뗀다', () => {
    const query = previewQueryOf({ op: 'create', form: ready })
    expect(query).toEqual({ op: 'create', scopeType: 'global', cidr: '203.0.113.0/24' })
    expect(Object.keys(query ?? {})).not.toContain('scopeRefNo')
  })

  it('수정 · 삭제는 ruleNo 를 싣는다', () => {
    expect(
      previewQueryOf({
        op: 'update',
        ruleNo: 12n,
        form: form({ scopeType: 'team', scopeRefNo: '4', cidr: '10.0.0.0/8' }),
      }),
    ).toEqual({ op: 'update', ruleNo: 12n, scopeType: 'team', scopeRefNo: 4n, cidr: '10.0.0.0/8' })
    expect(previewQueryOf({ op: 'delete', ruleNo: 12n })).toEqual({ op: 'delete', ruleNo: 12n })
  })

  it('질의 키 — null 과 현행이 다르고, 같은 질의는 같은 키', () => {
    expect(previewQueryKey(null)).toBe('none')
    expect(previewQueryKey({})).not.toBe(previewQueryKey(null))
    const a = previewQueryOf({ op: 'create', form: ready })
    const b = previewQueryOf({ op: 'create', form: form({ cidr: '203.0.113.0/24' }) })
    expect(previewQueryKey(a)).toBe(previewQueryKey(b))
    expect(previewQueryKey(a)).not.toBe(
      previewQueryKey(previewQueryOf({ op: 'create', form: form({ cidr: '203.0.113.0/25' }) })),
    )
  })
})

describe('본문', () => {
  it('만들기 — 번호는 bigint, 전체는 null, 빈 설명은 null, 앞뒤 공백 뗌', () => {
    expect(
      toCreateBody(
        form({
          scopeType: 'team',
          scopeRefNo: ' 4 ',
          cidr: ' 10.0.0.0/8 ',
          description: ' 사무실 ',
        }),
      ),
    ).toEqual({ scopeType: 'team', scopeRefNo: 4n, cidr: '10.0.0.0/8', description: '사무실' })
    expect(toCreateBody(form({ cidr: '::/0' }))).toEqual({
      scopeType: 'global',
      scopeRefNo: null,
      cidr: '::/0',
      description: null,
    })
  })

  it('🔴 수정 — 네 칸과 revision 을 늘 싣는다(부분 갱신에 기대지 않는다)', () => {
    const body = toUpdateBody(form({ cidr: '10.0.0.0/8' }), 3)
    expect(body).toEqual({
      scopeType: 'global',
      scopeRefNo: null,
      cidr: '10.0.0.0/8',
      description: null,
      revision: 3,
    })
    expect(Object.keys(body).sort()).toEqual([
      'cidr',
      'description',
      'revision',
      'scopeRefNo',
      'scopeType',
    ])
  })
})

describe('대상 · 범위 표기', () => {
  const tree: AdminTeamNode[] = [
    {
      teamNo: 1n,
      teamName: '본사',
      displayOrder: 0,
      children: [
        {
          teamNo: 2n,
          teamName: '고객지원',
          displayOrder: 0,
          children: [{ teamNo: 3n, teamName: '상담센터', displayOrder: 0, children: [] }],
        },
        { teamNo: 4n, teamName: '개발', displayOrder: 1, children: [] },
      ],
    },
  ]

  it('팀 트리 → 경로 항목 — 트리 순서 그대로', () => {
    expect(flattenTeamPaths(tree)).toEqual([
      { value: '1', title: '본사' },
      { value: '2', title: '본사 › 고객지원' },
      { value: '3', title: '본사 › 고객지원 › 상담센터' },
      { value: '4', title: '본사 › 개발' },
    ])
    expect(flattenTeamPaths([])).toEqual([])
  })

  it('사용자 항목 글자', () => {
    expect(userOptionTitle({ userName: '김운영', userId: 'ops01' })).toBe('김운영 (ops01)')
  })

  it('규칙 범위 — 전체 · 팀 이름 · 사용자 이름(아이디) · 🔴 대상이 지워졌으면 번호만', () => {
    expect(
      ruleScopeTitle(rule({ scopeType: 'global', scopeRefNo: null, scopeName: null }), M),
    ).toBe('전체')
    expect(ruleScopeTitle(rule(), M)).toBe('팀 · 상담센터')
    expect(
      ruleScopeTitle(
        rule({ scopeType: 'user', scopeRefNo: 3n, scopeName: '김운영', scopeUserId: 'ops01' }),
        M,
      ),
    ).toBe('사용자 · 김운영 (ops01)')
    expect(ruleScopeTitle(rule({ scopeRefNo: 9n, scopeName: null }), M)).toBe('팀 #9')
  })

  it('규칙 범위 아래 줄 — 번호, 대상 없음, 전체는 없음', () => {
    expect(ruleScopeSub(rule(), M)).toBe('#4')
    expect(ruleScopeSub(rule({ scopeRefNo: 9n, scopeName: null }), M)).toBe(M.deadTarget)
    expect(
      ruleScopeSub(rule({ scopeType: 'global', scopeRefNo: null, scopeName: null }), M),
    ).toBeNull()
  })

  it('폼 범위 — 고른 대상 글자가 있으면 그것, 없으면 번호', () => {
    expect(formScopeTitle(form(), null, M)).toBe('전체')
    expect(formScopeTitle(form({ scopeType: 'team', scopeRefNo: '3' }), '본사 › 상담센터', M)).toBe(
      '팀 · 본사 › 상담센터',
    )
    expect(formScopeTitle(form({ scopeType: 'team', scopeRefNo: '3' }), null, M)).toBe('팀 #3')
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/ip-access/ip-access.test.ts`
Expected: FAIL — `./ip-access.js` 를 찾지 못함.

- [ ] **Step 3: 구현한다**

`packages/admin-ui/src/components/ip-access/ip-access.ts`:

```ts
import {
  IP_ACCESS_SCHEMA_MESSAGES,
  IP_CIDR_MAX_LENGTH,
  IP_RULE_DESCRIPTION_MAX_LENGTH,
  ipCidrSchema,
  type AdminIpPreview,
  type AdminIpPreviewQuery,
  type AdminIpRule,
  type AdminIpRuleCreate,
  type AdminIpRuleUpdate,
  type AdminTeamNode,
  type IpScopeType,
} from '@ssworks/admin-shared'

// IP 접근 제어 화면의 타입 · 문구 · 순수 함수 — `useIpAccessRules` · `useIpPreview` · `IpAccessManager` 가 함께 쓴다(3g 스펙 C1).
//
// 정본: hangang-home apps/admin/src/pages/settings/ip-access-messages.ts
// 바꾼 점:
//  - 용어를 킷 README 로 — 사용자 · 팀 · 전체(hangang 계정 · 팀 · 전역).
//  - 🔴 CIDR 검증을 화면도 서버와 같은 파서(admin-shared `ipCidrSchema`)로 한다(2f-1 스펙 P1). hangang 은 "형식 판정은 서버만"
//    이라 비었는가 · 길이만 봤다 — 킷은 파서가 하나라 화면 검증이 곧 서버 판정이다.
//  - 미리보기 호출 게이트를 "/ 뒤에 한 글자"(hangang)가 아니라 그 파서 통과로(I9).
//  - 대상을 번호로 치던 칸을 후보 고르기로(④ T1) — 경로 항목(`flattenTeamPaths`) · 사용자 항목 글자.
//  - 세션 끊기 제안 문구 전부를 버렸다(⑥ S2 — 킷 서버는 매 요청 IP 를 본다).
//  - 문구는 `messages` 부분 덮어쓰기로 바꾼다(C2).

export interface IpUserOption {
  userNo: bigint
  userId: string
  userName: string
}

/** 재인증일 때만 currentPassword 가 있다. 본문에 실을지는 어댑터가 정한다(useRoleEditor 와 같음) */
export interface IpWriteContext {
  currentPassword?: string
}

/** 칸 값은 문자열 — scopeRefNo '' = 없음 */
export interface IpRuleForm {
  scopeType: IpScopeType
  scopeRefNo: string
  cidr: string
  description: string
}

export type IpRuleFormField = keyof IpRuleForm

/** 서버 검증 오류가 칸 아래에 보이는 키(`useWriteFlow` 의 `fields`) */
export const IP_RULE_FORM_FIELDS: readonly IpRuleFormField[] = Object.freeze([
  'scopeType',
  'scopeRefNo',
  'cidr',
  'description',
])

export type IpPreviewOp = 'create' | 'update' | 'delete'

export type IpPreviewState =
  'loading' | 'ready' | 'pending-input' | 'forbidden' | 'stale' | 'failed'

export interface IpPreviewView {
  state: IpPreviewState
  op: IpPreviewOp | null
  result: AdminIpPreview | null
  /** 한 번 받으면 뒤의 실패로 지우지 않는다(I2) */
  clientIp: string | null
}

/** 미리보기가 무엇을 묻는가 — op null = 현행 */
export type IpPreviewTarget =
  | { op: null }
  | { op: 'create'; form: IpRuleForm }
  | { op: 'update'; ruleNo: bigint; form: IpRuleForm }
  | { op: 'delete'; ruleNo: bigint }

export interface IpSelectItem {
  value: string
  title: string
}

export interface IpAccessAlert {
  kind: 'error' | 'warning'
  text: string
}

export type IpGateKind = 'create' | 'update' | 'remove'

export interface IpAccessMessages {
  scopeUser: string
  scopeTeam: string
  scopeGlobal: string
  layer: (scope: string) => string
  layerNone: string
  statusLocked: string
  statusPasses: string
  statusUnknown: string
  cardTitle: string
  currentIp: (ip: string) => string
  currentIpUnknown: string
  unknownAddress: string
  passLine: (passes: boolean, ip: string, current: boolean) => string
  basisCurrent: string
  basisCreate: string
  basisUpdate: string
  basisDelete: string
  summaryEvaluated: (total: number) => string
  summaryNoImpact: string
  summaryUnknownOnly: (unknown: number) => string
  summaryNewlyLocked: (newly: number, already: number, unknown: number) => string
  summaryBlockedSessions: (count: number) => string
  summaryRuleSetChanged: (count: number) => string
  self: string
  sessionsNone: string
  sessionsBlocked: (active: number, blocked: number) => string
  sessionsUnknownDenied: (unknown: number) => string
  sessionsUnknownUndetermined: (unknown: number) => string
  ruleSetChanged: string
  ruleSetChangedUnknown: string
  ruleSetChangedNow: (status: string) => string
  previewLoading: string
  previewPendingInput: string
  previewForbidden: string
  previewStale: string
  previewFailed: string
  globalAllowRemoval: string
  hintLayerShadow: string
  hintServerDefence: string
  hintSessionsStay: string
  hintRecovery: string
  gateHead: (kind: IpGateKind, scope: string, cidr: string) => string
  irreversible: string
  gateImpactNone: string
  gateImpactLocked: (count: number) => string
  gateImpactUnknown: string
  createTitle: string
  updateTitle: string
  removeTitle: string
  createConfirm: string
  updateConfirm: string
  removeConfirm: string
  savedWithoutPreview: string
  conflictWithIp: (message: string, ip: string) => string
  conflictWithoutMessage: string
  revisionConflict: (scope: string, cidr: string) => string
  ruleGone: string
  discardTitle: string
  discardMessage: string
  discardConfirm: string
  editorCreateTitle: string
  editorEditTitle: string
  scopeLabel: string
  teamLabel: string
  userLabel: string
  teamNumberLabel: string
  userNumberLabel: string
  cidrLabel: string
  descriptionLabel: string
  cidrHint: string
  numberPlaceholder: string
  save: string
  cancel: string
  teamNoPermissionHint: string
  userNoPermissionHint: string
  teamsFailed: string
  userSearchHint: string
  userSearchEmpty: string
  userSearchFailed: string
  scopeRefRequired: string
  scopeRefDigits: string
  cidrRequired: string
  cidrInvalid: string
  cidrTooLong: string
  descriptionTooLong: string
  listTitle: string
  sortLabel: string
  createButton: string
  columnScope: string
  columnCidr: string
  columnDescription: string
  edit: string
  remove: string
  editLabel: (rule: string) => string
  removeLabel: (rule: string) => string
  editing: string
  deadTarget: string
  emptyTitle: string
  loadFailed: string
  retry: string
}

export const DEFAULT_IP_ACCESS_MESSAGES: Readonly<IpAccessMessages> =
  Object.freeze<IpAccessMessages>({
    scopeUser: '사용자',
    scopeTeam: '팀',
    scopeGlobal: '전체',
    layer: (scope) => `${scope} 층`,
    // 🔴 "없음"으로 적지 않는다 — 채택된 층이 없으면 어떤 주소로도 못 들어온다(기본 거부 · hangang)
    layerNone: '규칙 없음(기본 거부)',
    statusLocked: '잠김',
    statusPasses: '통과',
    // 🔴 "통과"로 읽히면 안 된다 — 주소를 아는 활성 세션이 없어 판정 자체가 불가능하다(hangang)
    statusUnknown: '판정 불가',
    cardTitle: '접속 상태와 변경 영향',
    currentIp: (ip) => `현재 접속 IP: ${ip}`,
    // 🔴 빈 칸으로 그리지 않는다 — "IP 가 없다"로 읽힌다(I2 · hangang)
    currentIpUnknown: '현재 접속 IP 를 아직 확인하지 못했습니다.',
    unknownAddress: '알 수 없는 주소',
    passLine: (passes, ip, current) =>
      current
        ? passes
          ? `지금 접속(${ip})은 현행 규칙을 통과합니다.`
          : `지금 접속(${ip})이 현행 규칙을 통과하지 못합니다.`
        : passes
          ? `이 변경 뒤에도 지금 접속(${ip})은 통과합니다.`
          : `이 변경 뒤에는 지금 접속(${ip})이 통과하지 못합니다 — 서버가 저장을 거부합니다(409).`,
    basisCurrent: '아래는 현행 규칙 기준입니다.',
    basisCreate: '아래는 지금 만들려는 규칙을 더했을 때 기준입니다.',
    basisUpdate: '아래는 지금 편집 중인 값으로 바꿨을 때 기준입니다.',
    basisDelete: '아래는 선택한 규칙을 지웠을 때 기준입니다.',
    summaryEvaluated: (total) => `사용자 ${total}명을 평가했습니다.`,
    summaryNoImpact: '이 변경으로 새로 잠기는 사용자는 없습니다.',
    summaryUnknownOnly: (unknown) =>
      `판정 불가 ${unknown}명은 활성 세션의 접속 주소를 몰라 확인할 수 없습니다.`,
    summaryNewlyLocked: (newly, already, unknown) =>
      `🔴 이 변경으로 ${newly}명이 새로 잠깁니다. 변경 전에도 잠겨 있던 ${already}명과 판정 불가 ${unknown}명은 따로 셉니다.`,
    summaryBlockedSessions: (count) =>
      `이 규칙이 거부하는 활성 세션은 평가 대상 전원을 합쳐 ${count}개입니다.`,
    summaryRuleSetChanged: (count) =>
      `🔴 잠기지는 않지만 적용되는 규칙이 달라지는 사용자가 ${count}명 있습니다 — 지금 세션은 살아 있어도 허용 주소가 좁아졌으면 다음에 다른 곳에서 붙을 때 막힙니다.`,
    self: '본인',
    sessionsNone: '활성 세션 없음',
    sessionsBlocked: (active, blocked) => `활성 세션 ${active}개 중 ${blocked}개가 거부됩니다`,
    sessionsUnknownDenied: (unknown) =>
      `(그중 ${unknown}개는 접속 주소가 기록되지 않았지만, 채택될 층이 없어 주소와 무관하게 거부가 확정입니다)`,
    sessionsUnknownUndetermined: (unknown) =>
      ` — 그 수 밖에 접속 주소가 기록되지 않은 세션이 ${unknown}개 더 있어 통과할지 거부될지 판정할 수 없습니다`,
    ruleSetChanged: '적용되는 규칙이 달라집니다',
    ruleSetChangedUnknown: '🔴 활성 세션의 접속 주소를 몰라 통과할지 판정할 수 없습니다',
    ruleSetChangedNow: (status) => `지금은 ${status}`,
    previewLoading: '이 변경의 영향을 확인하는 중입니다…',
    previewPendingInput:
      '범위 · 대상 · CIDR 을 다 채우면 이 변경으로 누가 잠기는지 여기에 표시됩니다.',
    previewForbidden:
      '변경 영향과 현재 접속 IP 는 IP 관리 권한이 있을 때 보입니다. 지금은 규칙 목록만 볼 수 있습니다.',
    previewStale:
      '이미 지워진 규칙입니다 — 다른 관리자가 방금 지운 것으로 보입니다. 목록을 새로 불러왔습니다.',
    // 🔴 "영향 없음"으로 떨어뜨리지 않는다(hangang)
    previewFailed:
      '이 변경의 영향을 확인하지 못했습니다 — 다른 사용자가 잠기는지 알 수 없는 상태로 저장하게 됩니다.',
    globalAllowRemoval:
      '🔴 이 변경은 전체 허용 행을 없앱니다. 전체 허용은 IPv4(0.0.0.0/0)와 IPv6(::/0) 두 행이고 계열이 서로를 통과시키지 않습니다 — 한 행만 없애도 그 계열로 접속하는 사람이 모두 잠깁니다. 지우는 것뿐 아니라 범위를 좁히는 수정도 같은 일이고, 내 접속이 다른 계열이면 서버 검사(409)도 위 미리보기도 이것을 잡지 못합니다.',
    hintLayerShadow:
      '평가는 사용자 → 팀 → 전체 순으로 가장 가까운 층 하나만 채택합니다. 그 사람에게 사용자 규칙이 하나라도 있으면 팀 · 전체 규칙은 보지 않습니다 — 전체 허용을 더 넣는 것으로는 풀리지 않습니다. 어느 층에도 규칙이 없으면 거부입니다.',
    hintServerDefence:
      '이 미리보기는 예고입니다. 실제로 막는 것은 저장할 때 요청자 주소를 다시 평가하는 서버 검사(409)이고, 그 검사도 요청자 본인만 봅니다.',
    hintSessionsStay:
      '규칙은 저장 즉시 모든 요청에 적용됩니다. 세션은 끊지 않으므로 허용된 주소로 돌아오면 같은 세션을 씁니다. 끊어야 하면 세션 화면에서 끊으세요.',
    hintRecovery:
      '잠긴 사람은 로그인이 막혀 이 화면에 들어올 수 없습니다. 복구는 DB 직접 조작입니다. 위 목록에는 지금 이 화면을 보는 당신도 들어 있을 수 있으니 「본인」 표시를 확인하세요.',
    gateHead: (kind, scope, cidr) =>
      `${scope} 범위의 「${cidr}」 규칙을 ${kind === 'create' ? '만듭니다' : kind === 'update' ? '저장합니다' : '지웁니다'}.`,
    irreversible: '지운 규칙은 되돌릴 수 없습니다.',
    gateImpactNone: '이 변경으로 새로 잠기는 사용자는 없습니다.',
    gateImpactLocked: (count) => `🔴 이 변경으로 ${count}명이 새로 잠깁니다.`,
    gateImpactUnknown:
      '이 변경의 영향을 확인하지 못했습니다 — 누가 잠기는지 모르는 채로 진행합니다.',
    createTitle: 'IP 규칙 만들기',
    updateTitle: 'IP 규칙 저장',
    removeTitle: 'IP 규칙 삭제',
    createConfirm: '만들기',
    updateConfirm: '저장',
    removeConfirm: '삭제',
    savedWithoutPreview:
      '저장했지만 이 변경으로 누가 잠기는지는 확인하지 못했습니다 — 「아무도 안 잠깁니다」가 아닙니다. 목록을 새로 불러와 영향을 다시 확인하세요.',
    conflictWithIp: (message, ip) => `${message} 서버가 본 지금 주소: ${ip}`,
    conflictWithoutMessage:
      '지금 상태에서는 이 변경을 적용할 수 없습니다 — 이 규칙으로 바꾸면 지금 접속한 위치에서 로그인할 수 없게 되거나, 로그인할 수 있는 전체 권한 사용자가 한 명도 남지 않습니다.',
    revisionConflict: (scope, cidr) =>
      `다른 관리자가 먼저 이 규칙을 바꿨습니다. 새로 불러온 값(${scope} · ${cidr})을 확인한 뒤 다시 저장하세요. 고치던 값은 그대로 두었습니다.`,
    ruleGone: '이미 지워진 규칙입니다. 목록을 새로 불러왔습니다.',
    discardTitle: '고친 값 버리기',
    discardMessage: '편집 중인 IP 규칙의 고친 값을 버립니다.',
    discardConfirm: '버리기',
    editorCreateTitle: '새 IP 규칙',
    editorEditTitle: 'IP 규칙 수정',
    scopeLabel: '범위',
    teamLabel: '대상 팀',
    userLabel: '대상 사용자',
    teamNumberLabel: '팀 번호',
    userNumberLabel: '사용자 번호',
    cidrLabel: 'CIDR',
    descriptionLabel: '설명',
    cidrHint:
      '프리픽스 길이까지 적습니다 — 한 주소만 허용하려면 /32(IPv4) 또는 /128(IPv6) 입니다. 예: 203.0.113.0/24 · 2001:db8::/32',
    numberPlaceholder: '숫자만',
    save: '저장',
    cancel: '취소',
    teamNoPermissionHint: '팀 목록을 볼 권한이 없어 번호로 고릅니다.',
    userNoPermissionHint: '사용자 목록을 볼 권한이 없어 번호로 고릅니다.',
    teamsFailed: '팀 목록을 불러오지 못했습니다. 편집을 다시 열면 다시 불러옵니다.',
    userSearchHint: '이름이나 아이디를 입력하세요.',
    userSearchEmpty: '맞는 사람이 없습니다.',
    userSearchFailed: '검색하지 못했습니다. 다시 입력해 보세요.',
    scopeRefRequired: '대상을 고르거나 번호를 입력하세요.',
    scopeRefDigits: '번호는 숫자만 입력하세요.',
    cidrRequired: 'CIDR 을 입력하세요.',
    cidrInvalid: IP_ACCESS_SCHEMA_MESSAGES.cidr,
    cidrTooLong: `CIDR 은 ${IP_CIDR_MAX_LENGTH}자를 넘을 수 없습니다.`,
    descriptionTooLong: `설명은 ${IP_RULE_DESCRIPTION_MAX_LENGTH}자를 넘을 수 없습니다.`,
    listTitle: '규칙 목록',
    sortLabel: '정렬: 범위 → 번호(고정)',
    createButton: '새 규칙',
    columnScope: '범위',
    columnCidr: 'CIDR',
    columnDescription: '설명',
    edit: '수정',
    remove: '삭제',
    editLabel: (rule) => `${rule} 규칙 수정`,
    removeLabel: (rule) => `${rule} 규칙 삭제`,
    editing: '편집 중',
    deadTarget: '대상 없음 — 아무에게도 걸리지 않음',
    emptyTitle: 'IP 규칙이 하나도 없습니다 — 지금은 모든 접속이 거부됩니다',
    loadFailed: 'IP 규칙을 불러오지 못했습니다.',
    retry: '다시 시도',
  })

// ── 범위 · 폼 ────────────────────────────────────────────────────────

/** 서버 `queryBigIntSchema` 와 같은 폭(부호 없는 20자리) */
const UNSIGNED_DIGITS = /^[0-9]{1,20}$/

/** 🔴 가까운 층부터 — 그 순서가 곧 평가 순서다(hangang) */
export const IP_SCOPE_ORDER: readonly IpScopeType[] = Object.freeze(['user', 'team', 'global'])

export function scopeTypeLabel(scopeType: IpScopeType, messages: IpAccessMessages): string {
  if (scopeType === 'user') return messages.scopeUser
  if (scopeType === 'team') return messages.scopeTeam
  return messages.scopeGlobal
}

export function scopeTypeItems(messages: IpAccessMessages): IpSelectItem[] {
  return IP_SCOPE_ORDER.map((value) => ({ value, title: scopeTypeLabel(value, messages) }))
}

export function emptyIpRuleForm(): IpRuleForm {
  return { scopeType: 'global', scopeRefNo: '', cidr: '', description: '' }
}

export function ruleToForm(
  rule: Pick<AdminIpRule, 'scopeType' | 'scopeRefNo' | 'cidr' | 'description'>,
): IpRuleForm {
  return {
    scopeType: rule.scopeType,
    scopeRefNo: rule.scopeRefNo == null ? '' : String(rule.scopeRefNo),
    cidr: rule.cidr,
    description: rule.description ?? '',
  }
}

export function sameIpRuleForm(a: IpRuleForm, b: IpRuleForm): boolean {
  return IP_RULE_FORM_FIELDS.every((key) => a[key] === b[key])
}

/** 🔴 범위를 바꾸면 대상을 비운다 — 팀 번호가 사용자 번호로, 본 적 없는 번호가 다시 나타나지 않게(I19) */
export function withScopeType(form: IpRuleForm, scopeType: IpScopeType): IpRuleForm {
  return form.scopeType === scopeType ? { ...form } : { ...form, scopeType, scopeRefNo: '' }
}

/**
 * 칸 오류(키 → 문구 목록). 맞으면 빈 객체. 🔴 비밀번호를 묻기 전에 본다(I14 ② · hangang).
 * CIDR 은 서버와 같은 파서(`ipCidrSchema`)다 — 화면이 통과시킨 값을 서버가 거부하는 일이 없다.
 */
export function ipRuleFormProblems(
  form: IpRuleForm,
  messages: IpAccessMessages,
): Record<string, string[]> {
  const problems: Record<string, string[]> = {}
  if (form.scopeType !== 'global') {
    const refNo = form.scopeRefNo.trim()
    if (refNo === '') problems.scopeRefNo = [messages.scopeRefRequired]
    else if (!UNSIGNED_DIGITS.test(refNo)) problems.scopeRefNo = [messages.scopeRefDigits]
  }
  const cidr = form.cidr.trim()
  if (cidr === '') problems.cidr = [messages.cidrRequired]
  else if (cidr.length > IP_CIDR_MAX_LENGTH) problems.cidr = [messages.cidrTooLong]
  else if (!ipCidrSchema.safeParse(cidr).success) problems.cidr = [messages.cidrInvalid]
  if (form.description.trim().length > IP_RULE_DESCRIPTION_MAX_LENGTH) {
    problems.description = [messages.descriptionTooLong]
  }
  return problems
}

/** 미리보기를 부를 만한가 — CIDR 이 그 파서를 통과하고, 전체가 아니면 대상 번호가 숫자다(I9) */
export function isIpRuleFormPreviewable(form: IpRuleForm): boolean {
  if (form.scopeType !== 'global' && !UNSIGNED_DIGITS.test(form.scopeRefNo.trim())) return false
  return ipCidrSchema.safeParse(form.cidr).success
}

/**
 * 미리보기 질의. 🔴 `null`(부르지 않음)과 `{}`(현행)는 다르다 — 덜 찬 폼을 현행으로 떨어뜨리면 "아무도 안 잠김"이
 * 보인다(I9). 🔴 전체 범위는 scopeRefNo 를 싣지 않는다.
 */
export function previewQueryOf(target: IpPreviewTarget): AdminIpPreviewQuery | null {
  if (target.op === null) return {}
  if (target.op === 'delete') return { op: 'delete', ruleNo: target.ruleNo }
  const { form } = target
  if (!isIpRuleFormPreviewable(form)) return null
  const query: AdminIpPreviewQuery = {
    op: target.op,
    scopeType: form.scopeType,
    cidr: form.cidr.trim(),
  }
  if (target.op === 'update') query.ruleNo = target.ruleNo
  if (form.scopeType !== 'global') query.scopeRefNo = BigInt(form.scopeRefNo.trim())
  return query
}

/** 감시용 문자열 키. 🔴 질의 하나를 문자열로 본다 — 여럿을 따로 보면 요청이 두 번 나간다(hangang) */
export function previewQueryKey(query: AdminIpPreviewQuery | null): string {
  if (query === null) return 'none'
  return [
    query.op ?? 'current',
    query.ruleNo ?? '',
    query.scopeType ?? '',
    query.scopeRefNo ?? '',
    query.cidr ?? '',
  ]
    .map(String)
    .join('|')
}

function descriptionOf(form: IpRuleForm): string | null {
  const text = form.description.trim()
  return text === '' ? null : text
}

/** 만들기 본문. bigint 는 킷 API 클라이언트 코덱이 싣는다 */
export function toCreateBody(form: IpRuleForm): AdminIpRuleCreate {
  return {
    scopeType: form.scopeType,
    scopeRefNo: form.scopeType === 'global' ? null : BigInt(form.scopeRefNo.trim()),
    cidr: form.cidr.trim(),
    description: descriptionOf(form),
  }
}

/** 🔴 수정 본문은 네 칸과 revision 을 늘 싣는다 — 생략이 "그대로"로 읽히는 부분 갱신에 기대지 않는다(I16) */
export function toUpdateBody(form: IpRuleForm, revision: number): AdminIpRuleUpdate {
  return { ...toCreateBody(form), revision }
}

// ── 대상 · 범위 표기 ─────────────────────────────────────────────────

const TEAM_PATH_SEPARATOR = ' › '

/** 팀 트리 → "본사 › 고객지원 › 상담센터" 경로 항목. 트리 순서(서버의 displayOrder) 그대로 */
export function flattenTeamPaths(tree: readonly AdminTeamNode[]): IpSelectItem[] {
  const out: IpSelectItem[] = []
  const walk = (nodes: readonly AdminTeamNode[], trail: readonly string[]): void => {
    for (const node of nodes) {
      const path = [...trail, node.teamName]
      out.push({ value: String(node.teamNo), title: path.join(TEAM_PATH_SEPARATOR) })
      walk(node.children, path)
    }
  }
  walk(tree, [])
  return out
}

export function userOptionTitle(option: Pick<IpUserOption, 'userName' | 'userId'>): string {
  return `${option.userName} (${option.userId})`
}

type RuleScope = Pick<AdminIpRule, 'scopeType' | 'scopeRefNo' | 'scopeName' | 'scopeUserId'>

/** 규칙 범위 한 줄. 🔴 대상이 지워졌으면(scopeName null) 이름을 지어내지 않는다 — 번호만(I22 · hangang) */
export function ruleScopeTitle(rule: RuleScope, messages: IpAccessMessages): string {
  const label = scopeTypeLabel(rule.scopeType, messages)
  if (rule.scopeType === 'global') return label
  if (rule.scopeName == null) return `${label} #${rule.scopeRefNo ?? '?'}`
  const name =
    rule.scopeType === 'user' && rule.scopeUserId != null
      ? userOptionTitle({ userName: rule.scopeName, userId: rule.scopeUserId })
      : rule.scopeName
  return `${label} · ${name}`
}

/** 범위 아래 줄 — 번호, 또는 대상 없음 안내. 전체는 없음 */
export function ruleScopeSub(rule: RuleScope, messages: IpAccessMessages): string | null {
  if (rule.scopeType === 'global') return null
  if (rule.scopeName == null) return messages.deadTarget
  return `#${rule.scopeRefNo}`
}

/** 편집 중인 폼의 범위 — 고른 대상 글자가 있으면 그것, 없으면 번호 */
export function formScopeTitle(
  form: IpRuleForm,
  targetTitle: string | null,
  messages: IpAccessMessages,
): string {
  const label = scopeTypeLabel(form.scopeType, messages)
  if (form.scopeType === 'global') return label
  return targetTitle != null ? `${label} · ${targetTitle}` : `${label} #${form.scopeRefNo.trim()}`
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/ip-access/ip-access.test.ts`
Expected: PASS

Run: `pnpm --filter @ssworks/admin-ui typecheck && pnpm exec eslint packages/admin-ui/src/components/ip-access/ip-access.ts packages/admin-ui/src/components/ip-access/ip-access.test.ts`
Expected: 통과. `AdminIpPreview` import 는 `IpPreviewView` 가 쓴다.

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-ui/src/components/ip-access/ip-access.ts packages/admin-ui/src/components/ip-access/ip-access.test.ts
git commit -m "feat(admin-ui): IP 접근 제어 타입 · 기본 문구 · 폼 검증 · 미리보기 질의 · 본문" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 미리보기 문구 · 전체 허용 판정 · 관문 문구

**Files:**

- Modify: `packages/admin-ui/src/components/ip-access/ip-access.ts`(import 교체 · 끝에 절 추가)
- Modify: `packages/admin-ui/src/components/ip-access/ip-access.test.ts`(끝에 절 추가)

**Interfaces:**

- Consumes: Task 1 전부; admin-shared 타입 `AdminIpPreviewItem` · `IpLockoutStatus`; 타입 `ApiError`(`../../api/error.js`)
- Produces: `layerLabel(layer | null, messages)` · `statusLabel(status, messages)` · `currentIpLine(clientIp, messages)` · `passLine(view, messages): string | null` · `basisLine(op, messages)` · `previewSummaryLine(summary, messages)` · `sessionLine(item, messages)` · `lockedItemLine(item, self, messages)` · `changedItemLine(item, self, messages)` · `lockedItemsOf(view)` · `changedItemsOf(view)` · `impactLine(view, messages)` · `GLOBAL_ALLOW_CIDRS` · `isGlobalAllowCidr(cidr)` · `removesGlobalAllow(before, after)` · `gateImpact(view, messages)` · `IpGateText` · `gateMessage(input, messages)` · `conflictAlertText(error, messages)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`ip-access.test.ts` 의 import 를 넓힌다 — admin-shared import 에 `type AdminIpPreview` · `type AdminIpPreviewItem` 을, `./ip-access.js` import 에 아래 이름과 `type IpPreviewView` 를 더한다: `changedItemLine` · `changedItemsOf` · `conflictAlertText` · `currentIpLine` · `gateImpact` · `gateMessage` · `impactLine` · `isGlobalAllowCidr` · `layerLabel` · `lockedItemLine` · `lockedItemsOf` · `passLine` · `basisLine` · `previewSummaryLine` · `removesGlobalAllow` · `sessionLine` · `statusLabel`. 그리고 파일 끝에 더한다:

```ts
const previewItem = (over: Partial<AdminIpPreviewItem> = {}): AdminIpPreviewItem => ({
  userNo: 7n,
  userId: 'cs07',
  userName: '이상담',
  layerBefore: 'global',
  layerAfter: 'team',
  statusBefore: 'passes',
  statusAfter: 'locked',
  becomesLocked: true,
  ruleSetChanged: true,
  activeSessionCount: 2,
  blockedSessionCount: 2,
  unknownIpSessionCount: 0,
  ...over,
})

const previewResult = (over: Partial<AdminIpPreview> = {}): AdminIpPreview => ({
  clientIp: '203.0.113.7',
  clientPasses: true,
  summary: {
    total: 14,
    newlyLocked: 0,
    alreadyLocked: 0,
    unknown: 0,
    blockedSessions: 0,
    ruleSetChangedOnly: 0,
  },
  items: [],
  ...over,
})

const view = (over: Partial<IpPreviewView> = {}): IpPreviewView => ({
  state: 'ready',
  op: 'update',
  result: previewResult(),
  clientIp: '203.0.113.7',
  ...over,
})

describe('층 · 상태 · 카드 줄', () => {
  it('🔴 층 없음은 "기본 거부"로, 판정 불가는 통과로 읽히지 않게', () => {
    expect(layerLabel(null, M)).toBe('규칙 없음(기본 거부)')
    expect(layerLabel('team', M)).toBe('팀 층')
    expect(statusLabel('locked', M)).toBe('잠김')
    expect(statusLabel('passes', M)).toBe('통과')
    expect(statusLabel('unknown', M)).toBe('판정 불가')
  })

  it('🔴 현재 IP — 모르면 빈 칸이 아니라 문장', () => {
    expect(currentIpLine(null, M)).toBe('현재 접속 IP 를 아직 확인하지 못했습니다.')
    expect(currentIpLine('203.0.113.7', M)).toBe('현재 접속 IP: 203.0.113.7')
  })

  it('🔴 통과 여부는 ready 일 때만 — 지어내지 않는다', () => {
    expect(passLine(view({ state: 'loading', result: null }), M)).toBeNull()
    expect(passLine(view({ state: 'failed', result: null }), M)).toBeNull()
    expect(passLine(view(), M)).toBe('이 변경 뒤에도 지금 접속(203.0.113.7)은 통과합니다.')
    expect(passLine(view({ result: previewResult({ clientPasses: false }) }), M)).toBe(
      '이 변경 뒤에는 지금 접속(203.0.113.7)이 통과하지 못합니다 — 서버가 저장을 거부합니다(409).',
    )
    expect(passLine(view({ op: null }), M)).toBe('지금 접속(203.0.113.7)은 현행 규칙을 통과합니다.')
  })

  it('서버가 주소를 못 읽었으면 "알 수 없는 주소"', () => {
    expect(
      passLine(view({ result: previewResult({ clientIp: null, clientPasses: false }) }), M),
    ).toContain('지금 접속(알 수 없는 주소)')
  })

  it('🔴 기준 줄 — 현행인지 바꾼 뒤인지 늘 적는다', () => {
    expect(basisLine(null, M)).toBe(M.basisCurrent)
    expect(basisLine('create', M)).toBe(M.basisCreate)
    expect(basisLine('update', M)).toBe(M.basisUpdate)
    expect(basisLine('delete', M)).toBe(M.basisDelete)
  })
})

describe('영향 요약 · 사람 줄', () => {
  const base = previewResult().summary

  it('0명 — 영향 없음 · 🔴 그래도 거부 세션 수를 적는다', () => {
    expect(previewSummaryLine(base, M)).toBe(
      '사용자 14명을 평가했습니다. 이 변경으로 새로 잠기는 사용자는 없습니다. 이 규칙이 거부하는 활성 세션은 평가 대상 전원을 합쳐 0개입니다.',
    )
  })

  it('판정 불가만 있으면 따로 적는다 — 0 으로 치지 않는다', () => {
    expect(previewSummaryLine({ ...base, unknown: 2 }, M)).toContain('판정 불가 2명은')
  })

  it('🔴 새로 잠김 · 이미 잠김 · 판정 불가를 가른다', () => {
    expect(
      previewSummaryLine(
        { ...base, newlyLocked: 2, alreadyLocked: 1, unknown: 1, blockedSessions: 3 },
        M,
      ),
    ).toBe(
      '사용자 14명을 평가했습니다. 🔴 이 변경으로 2명이 새로 잠깁니다. 변경 전에도 잠겨 있던 1명과 판정 불가 1명은 따로 셉니다. 이 규칙이 거부하는 활성 세션은 평가 대상 전원을 합쳐 3개입니다.',
    )
  })

  it('🔴 규칙만 바뀌는 사람 수 — 없으면 "전체 허용 좁히기"가 아무 신호도 안 낸다', () => {
    expect(previewSummaryLine({ ...base, ruleSetChangedOnly: 3 }, M)).toContain(
      '적용되는 규칙이 달라지는 사용자가 3명',
    )
  })

  it('🔴 세션 줄 세 갈래 — 층이 없으면 주소 모르는 세션도 거부 확정, 있으면 판정 불가', () => {
    expect(sessionLine(previewItem({ activeSessionCount: 0, blockedSessionCount: 0 }), M)).toBe(
      '활성 세션 없음',
    )
    expect(sessionLine(previewItem(), M)).toBe('활성 세션 2개 중 2개가 거부됩니다')
    expect(sessionLine(previewItem({ layerAfter: null, unknownIpSessionCount: 1 }), M)).toContain(
      '주소와 무관하게 거부가 확정',
    )
    expect(sessionLine(previewItem({ unknownIpSessionCount: 1 }), M)).toContain(
      '판정할 수 없습니다',
    )
  })

  it('잠기는 사람 줄 — 층 전 → 후 · 세션 · 🔴 본인 표시', () => {
    expect(lockedItemLine(previewItem(), false, M)).toBe(
      '이상담(cs07) — 전체 층 → 팀 층 · 활성 세션 2개 중 2개가 거부됩니다',
    )
    expect(lockedItemLine(previewItem(), true, M)).toBe(
      '🔴 이상담(cs07 · 본인) — 전체 층 → 팀 층 · 활성 세션 2개 중 2개가 거부됩니다',
    )
  })

  it('규칙만 바뀌는 사람 줄 — 판정 불가면 🔴, 아니면 지금 상태', () => {
    expect(
      changedItemLine(previewItem({ becomesLocked: false, statusAfter: 'unknown' }), false, M),
    ).toBe(
      '이상담(cs07) — 전체 층 → 팀 층 · 적용되는 규칙이 달라집니다 · 🔴 활성 세션의 접속 주소를 몰라 통과할지 판정할 수 없습니다',
    )
    expect(
      changedItemLine(previewItem({ becomesLocked: false, statusAfter: 'passes' }), false, M),
    ).toContain('지금은 통과')
  })

  it('목록 둘 — ready 일 때만, 서버 순서 그대로, 겹치지 않게', () => {
    const items = [
      previewItem({ userNo: 1n, becomesLocked: true }),
      previewItem({ userNo: 2n, becomesLocked: false, ruleSetChanged: true }),
      previewItem({ userNo: 3n, becomesLocked: false, ruleSetChanged: false }),
      previewItem({ userNo: 4n, becomesLocked: true }),
    ]
    const ready = view({ result: previewResult({ items }) })
    expect(lockedItemsOf(ready).map((i) => i.userNo)).toEqual([1n, 4n])
    expect(changedItemsOf(ready).map((i) => i.userNo)).toEqual([2n])
    expect(lockedItemsOf(view({ state: 'loading', result: null }))).toEqual([])
  })

  it('③ 자리 문구 — 상태마다, ready 인데 result 가 없어도 던지지 않는다', () => {
    expect(impactLine(view(), M)).toContain('사용자 14명을 평가했습니다.')
    expect(impactLine(view({ state: 'loading', result: null }), M)).toBe(M.previewLoading)
    expect(impactLine(view({ state: 'pending-input', result: null }), M)).toBe(
      M.previewPendingInput,
    )
    expect(impactLine(view({ state: 'forbidden', result: null }), M)).toBe(M.previewForbidden)
    expect(impactLine(view({ state: 'stale', result: null }), M)).toBe(M.previewStale)
    expect(impactLine(view({ state: 'failed', result: null }), M)).toBe(M.previewFailed)
    expect(impactLine(view({ state: 'ready', result: null }), M)).toBe(M.previewFailed)
  })
})

describe('전체 허용 · 관문 · 409', () => {
  it('전체 허용 CIDR 은 둘뿐', () => {
    expect(isGlobalAllowCidr(' 0.0.0.0/0 ')).toBe(true)
    expect(isGlobalAllowCidr('::/0')).toBe(true)
    expect(isGlobalAllowCidr('0.0.0.0/1')).toBe(false)
  })

  it('🔴 범위가 아니라 CIDR 로 판정 — ㉠ 좁은 전체 규칙 삭제는 경고 아님, ㉡ ::/0 을 좁히는 수정은 경고', () => {
    expect(removesGlobalAllow('0.0.0.0/0', null)).toBe(true)
    expect(removesGlobalAllow('::/0', '2001:db8::/32')).toBe(true)
    expect(removesGlobalAllow('203.0.113.0/24', null)).toBe(false)
    expect(removesGlobalAllow('0.0.0.0/0', '0.0.0.0/0')).toBe(false)
    expect(removesGlobalAllow(null, '0.0.0.0/0')).toBe(false)
  })

  it('관문 영향 한 줄 — ready 면 새로 잠김 수, 아니면 "확인하지 못했다"', () => {
    expect(
      gateImpact(
        view({
          result: previewResult({ summary: { ...previewResult().summary, newlyLocked: 2 } }),
        }),
        M,
      ),
    ).toBe('🔴 이 변경으로 2명이 새로 잠깁니다.')
    expect(gateImpact(view(), M)).toBe(M.gateImpactNone)
    expect(gateImpact(view({ state: 'failed', result: null }), M)).toBe(M.gateImpactUnknown)
  })

  it('관문 문구 — 머리말 · 되돌릴 수 없음 · 전체 허용 경고 · 영향 순서', () => {
    expect(
      gateMessage(
        {
          kind: 'remove',
          scope: '전체',
          cidr: '::/0',
          irreversible: true,
          globalRemoval: true,
          view: view(),
        },
        M,
      ),
    ).toBe(
      [
        '전체 범위의 「::/0」 규칙을 지웁니다.',
        M.irreversible,
        M.globalAllowRemoval,
        M.gateImpactNone,
      ].join(' '),
    )
    expect(
      gateMessage(
        {
          kind: 'create',
          scope: '팀 · 상담센터',
          cidr: '10.0.0.0/8',
          irreversible: false,
          globalRemoval: false,
          view: view(),
        },
        M,
      ),
    ).toBe(`팀 · 상담센터 범위의 「10.0.0.0/8」 규칙을 만듭니다. ${M.gateImpactNone}`)
  })

  it('🔴 409 — 서버 문구 그대로 + 서버가 본 주소, 문구가 비면 고정 안내', () => {
    expect(
      conflictAlertText(
        { message: '이 변경을 저장하면 …', details: { clientIp: '203.0.113.7' } },
        M,
      ),
    ).toBe('이 변경을 저장하면 … 서버가 본 지금 주소: 203.0.113.7')
    expect(conflictAlertText({ message: '전권자가 남지 않습니다.', details: undefined }, M)).toBe(
      '전권자가 남지 않습니다.',
    )
    expect(conflictAlertText({ message: ' ', details: { clientIp: null } }, M)).toBe(
      M.conflictWithoutMessage,
    )
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/ip-access/ip-access.test.ts`
Expected: FAIL — `layerLabel` 등이 export 되지 않음.

- [ ] **Step 3: 구현한다**

`ip-access.ts` 의 admin-shared import 에 `type AdminIpPreviewItem` · `type IpLockoutStatus` 를 더하고, 그 아래에 한 줄 더한다:

```ts
import type { ApiError } from '../../api/error.js'
```

파일 끝에 더한다:

```ts
// ── 미리보기 문구 ────────────────────────────────────────────────────

export function layerLabel(layer: IpScopeType | null, messages: IpAccessMessages): string {
  return layer == null ? messages.layerNone : messages.layer(scopeTypeLabel(layer, messages))
}

export function statusLabel(status: IpLockoutStatus, messages: IpAccessMessages): string {
  if (status === 'locked') return messages.statusLocked
  if (status === 'passes') return messages.statusPasses
  return messages.statusUnknown
}

/** ① 현재 접속 IP. 🔴 모르면 빈 칸이 아니라 문장(I2) */
export function currentIpLine(clientIp: string | null, messages: IpAccessMessages): string {
  return clientIp == null ? messages.currentIpUnknown : messages.currentIp(clientIp)
}

/** ② 통과 여부. 🔴 ready 일 때만 — 미리보기가 없으면 통과 여부를 말하지 않는다(I3) */
export function passLine(view: IpPreviewView, messages: IpAccessMessages): string | null {
  if (view.state !== 'ready' || view.result == null) return null
  return messages.passLine(
    view.result.clientPasses,
    view.result.clientIp ?? messages.unknownAddress,
    view.op === null,
  )
}

/** 기준 줄. 🔴 안 적으면 현행 스냅샷을 변경 뒤 예측으로 읽는다(I4) */
export function basisLine(op: IpPreviewOp | null, messages: IpAccessMessages): string {
  if (op === 'create') return messages.basisCreate
  if (op === 'update') return messages.basisUpdate
  if (op === 'delete') return messages.basisDelete
  return messages.basisCurrent
}

/** ③ 요약(hangang `previewSummaryLine`). 🔴 새로 잠김 · 이미 잠김 · 판정 불가를 가른다 */
export function previewSummaryLine(
  summary: AdminIpPreview['summary'],
  messages: IpAccessMessages,
): string {
  const parts = [messages.summaryEvaluated(summary.total)]
  if (summary.newlyLocked === 0) {
    parts.push(messages.summaryNoImpact)
    if (summary.unknown > 0) parts.push(messages.summaryUnknownOnly(summary.unknown))
  } else {
    parts.push(
      messages.summaryNewlyLocked(summary.newlyLocked, summary.alreadyLocked, summary.unknown),
    )
  }
  // 🔴 잠기는 사람이 0명이어도 거부 세션 수를 적는다 — 가장 흔한 좁히기에서 그 값이 사라진다(hangang)
  parts.push(messages.summaryBlockedSessions(summary.blockedSessions))
  // 🔴 이 줄이 없으면 "전체 허용을 사무실 대역으로 좁히기"가 아무 신호도 내지 않는다(hangang)
  if (summary.ruleSetChangedOnly > 0)
    parts.push(messages.summaryRuleSetChanged(summary.ruleSetChangedOnly))
  return parts.join(' ')
}

/**
 * 세션 줄. 🔴 층이 있으면 주소 모르는 세션은 판정 불가, 없으면 주소와 무관하게 거부 확정 — 한 문장으로 찍으면
 * 죽는 세션 수를 조용히 줄여 적는다(hangang `sessionLine`).
 */
export function sessionLine(item: AdminIpPreviewItem, messages: IpAccessMessages): string {
  if (item.activeSessionCount === 0) return messages.sessionsNone
  const head = messages.sessionsBlocked(item.activeSessionCount, item.blockedSessionCount)
  if (item.unknownIpSessionCount === 0) return head
  return item.layerAfter == null
    ? `${head}${messages.sessionsUnknownDenied(item.unknownIpSessionCount)}`
    : `${head}${messages.sessionsUnknownUndetermined(item.unknownIpSessionCount)}`
}

/** 🔴 자기 자신을 "다른 사람"으로 그리지 않는다 — 서버가 고른 목록에 본인이 섞여 온다(I6 · hangang) */
function whoLine(item: AdminIpPreviewItem, self: boolean, messages: IpAccessMessages): string {
  return self
    ? `🔴 ${item.userName}(${item.userId} · ${messages.self})`
    : `${item.userName}(${item.userId})`
}

function layersOf(item: AdminIpPreviewItem, messages: IpAccessMessages): string {
  return `${layerLabel(item.layerBefore, messages)} → ${layerLabel(item.layerAfter, messages)}`
}

export function lockedItemLine(
  item: AdminIpPreviewItem,
  self: boolean,
  messages: IpAccessMessages,
): string {
  return `${whoLine(item, self, messages)} — ${layersOf(item, messages)} · ${sessionLine(item, messages)}`
}

/** 🔴 "잠긴다"와 같은 강도로 적지 않는다 — 멀쩡한 변경을 되돌리게 된다(hangang) */
export function changedItemLine(
  item: AdminIpPreviewItem,
  self: boolean,
  messages: IpAccessMessages,
): string {
  const risk =
    item.statusAfter === 'unknown'
      ? messages.ruleSetChangedUnknown
      : messages.ruleSetChangedNow(statusLabel(item.statusAfter, messages))
  return `${whoLine(item, self, messages)} — ${layersOf(item, messages)} · ${messages.ruleSetChanged} · ${risk}`
}

/** 새로 잠기는 사람. 🔴 서버 순서(위험도 순)를 다시 정렬하지 않는다 */
export function lockedItemsOf(view: IpPreviewView): AdminIpPreviewItem[] {
  if (view.state !== 'ready' || view.result == null) return []
  return view.result.items.filter((item) => item.becomesLocked)
}

/** 잠기지는 않는데 적용 규칙이 달라지는 사람 — 잠기는 사람과 겹치지 않게 */
export function changedItemsOf(view: IpPreviewView): AdminIpPreviewItem[] {
  if (view.state !== 'ready' || view.result == null) return []
  return view.result.items.filter((item) => item.ruleSetChanged && !item.becomesLocked)
}

/** ③ 자리 문구. 🔴 state 와 result 를 함께 본다 — 어긋나도 던지지 않는다(hangang) */
export function impactLine(view: IpPreviewView, messages: IpAccessMessages): string {
  if (view.state === 'ready' && view.result != null)
    return previewSummaryLine(view.result.summary, messages)
  if (view.state === 'loading') return messages.previewLoading
  if (view.state === 'pending-input') return messages.previewPendingInput
  if (view.state === 'forbidden') return messages.previewForbidden
  if (view.state === 'stale') return messages.previewStale
  return messages.previewFailed
}

// ── 전체 허용 · 관문 · 409 ───────────────────────────────────────────

/** 전체 허용 CIDR 은 이 둘뿐이다 — 문자열 대조로 충분하다(파싱이 아니다 · hangang) */
export const GLOBAL_ALLOW_CIDRS: readonly string[] = Object.freeze(['0.0.0.0/0', '::/0'])

export function isGlobalAllowCidr(cidr: string): boolean {
  const text = cidr.trim()
  return GLOBAL_ALLOW_CIDRS.some((allow) => allow === text)
}

/**
 * 이 변경이 전체 허용 행을 없애는가. before = 손대는 규칙의 지금 CIDR(만들기면 null), after = 바꾼 뒤(삭제면 null).
 * 🔴 범위가 아니라 CIDR 로 판정한다 — 범위로 재면 ㉠ 좁은 전체 규칙 삭제에 거짓 경고, ㉡ ::/0 을 좁히는 수정에 침묵(I7 · hangang).
 */
export function removesGlobalAllow(before: string | null, after: string | null): boolean {
  if (before == null || !isGlobalAllowCidr(before)) return false
  return after == null || !isGlobalAllowCidr(after)
}

/** 관문 창의 영향 한 줄. 🔴 미리보기를 못 받았으면 "0명"이 아니라 "확인하지 못했다"(I12) */
export function gateImpact(view: IpPreviewView, messages: IpAccessMessages): string {
  if (view.state !== 'ready' || view.result == null) return messages.gateImpactUnknown
  const count = view.result.summary.newlyLocked
  return count > 0 ? messages.gateImpactLocked(count) : messages.gateImpactNone
}

export interface IpGateText {
  kind: IpGateKind
  scope: string
  cidr: string
  /** 재인증 창이 삭제 확인을 겸할 때 — 확인 창은 스스로 "되돌릴 수 없습니다"를 그린다 */
  irreversible: boolean
  globalRemoval: boolean
  view: IpPreviewView
}

/** 관문 문구 = 머리말 + (되돌릴 수 없음) + (전체 허용 경고) + 영향 한 줄 — 결정 지점에 사실을 둔다(I13) */
export function gateMessage(input: IpGateText, messages: IpAccessMessages): string {
  const parts = [messages.gateHead(input.kind, input.scope, input.cidr)]
  if (input.irreversible) parts.push(messages.irreversible)
  if (input.globalRemoval) parts.push(messages.globalAllowRemoval)
  parts.push(gateImpact(input.view, messages))
  return parts.join(' ')
}

/**
 * 409 ERR_COMMON_CONFLICT 알림 글자. 🔴 한 코드가 두 뜻(자기 잠금 · 전권자 잔존)을 나른다 — 킷 문구로 바꾸지 않고
 * 서버 문구를 그대로 쓴다(I17 · hangang). 자기 잠금이면 서버가 실은 details.clientIp 를 덧붙인다.
 */
export function conflictAlertText(
  error: Pick<ApiError, 'message' | 'details'>,
  messages: IpAccessMessages,
): string {
  const text = error.message.trim()
  const message = text === '' ? messages.conflictWithoutMessage : text
  const details = error.details
  const clientIp =
    typeof details === 'object' && details !== null && 'clientIp' in details
      ? (details as { clientIp?: unknown }).clientIp
      : null
  return typeof clientIp === 'string' && clientIp !== ''
    ? messages.conflictWithIp(message, clientIp)
    : message
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/ip-access/ip-access.test.ts`
Expected: PASS

Run: `pnpm --filter @ssworks/admin-ui typecheck && pnpm exec eslint packages/admin-ui/src/components/ip-access/ip-access.ts packages/admin-ui/src/components/ip-access/ip-access.test.ts`
Expected: 통과

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-ui/src/components/ip-access/ip-access.ts packages/admin-ui/src/components/ip-access/ip-access.test.ts
git commit -m "feat(admin-ui): IP 미리보기 문구 · 전체 허용 판정(CIDR) · 관문 문구 · 409 알림" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 미리보기 상태 기계 `useIpPreview`(내부)

**Files:**

- Create: `packages/admin-ui/src/composables/useIpPreview.ts`
- Create: `packages/admin-ui/src/composables/useIpPreview.test.ts`

**Interfaces:**

- Consumes: Task 1 `previewQueryOf` · `previewQueryKey` · 타입 `IpPreviewTarget` · `IpPreviewView` · `IpPreviewState`; `ApiError`
- Produces:
  - `IP_PREVIEW_DEBOUNCE_MS = 300`
  - `interface IpPreviewOptions { preview: (query: AdminIpPreviewQuery) => Promise<AdminIpPreview>; canManage: () => boolean; onStale?: () => void; immediate?: boolean }`
  - `interface IpPreviewController { view: Readonly<Ref<IpPreviewView>>; target: Readonly<Ref<IpPreviewTarget>>; setTarget(target): void; flush(): Promise<IpPreviewView>; refresh(): void }`
  - `useIpPreview(options): IpPreviewController` — index 에서 내보내지 않는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-ui/src/composables/useIpPreview.test.ts`:

```ts
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import type { AdminIpPreview, AdminIpPreviewQuery } from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import { emptyIpRuleForm, type IpRuleForm } from '../components/ip-access/ip-access.js'
import {
  IP_PREVIEW_DEBOUNCE_MS,
  useIpPreview,
  type IpPreviewController,
  type IpPreviewOptions,
} from './useIpPreview.js'

// 정본: hangang-home ip-access.vue 의 previewSeq · null ≠ {} · 404 stale · actorIp 유지를 상태 기계로 옮긴 것을 잰다(3g 스펙 I9–I12).

const result = (clientIp: string | null = '203.0.113.7'): AdminIpPreview => ({
  clientIp,
  clientPasses: true,
  summary: {
    total: 3,
    newlyLocked: 0,
    alreadyLocked: 0,
    unknown: 0,
    blockedSessions: 0,
    ruleSetChangedOnly: 0,
  },
  items: [],
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const ready: IpRuleForm = { ...emptyIpRuleForm(), cidr: '203.0.113.0/24' }
type PreviewFn = IpPreviewOptions['preview']

let scope: EffectScope

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  scope = effectScope()
})

afterEach(() => {
  scope.stop()
  vi.useRealTimers()
})

function setup(
  preview: PreviewFn,
  over: Partial<Omit<IpPreviewOptions, 'preview'>> = {},
): IpPreviewController {
  return scope.run(() => useIpPreview({ preview, canManage: () => true, ...over }))!
}

describe('useIpPreview', () => {
  it('만들자마자 현행({})을 바로 부르고 clientIp 를 채운다', async () => {
    const preview = vi.fn<PreviewFn>(async () => result())
    const c = setup(preview)
    await flushPromises()
    expect(preview).toHaveBeenCalledTimes(1)
    expect(preview).toHaveBeenCalledWith({})
    expect(c.view.value).toMatchObject({ state: 'ready', op: null, clientIp: '203.0.113.7' })
  })

  it('immediate: false 면 부르지 않는다', async () => {
    const preview = vi.fn<PreviewFn>(async () => result())
    setup(preview, { immediate: false })
    await flushPromises()
    expect(preview).not.toHaveBeenCalled()
  })

  it('🔴 덜 찬 만들기는 부르지 않는다 — pending-input, 순번을 올려 날아오던 응답이 덮지 못한다', async () => {
    const first = deferred<AdminIpPreview>()
    const preview = vi.fn<PreviewFn>().mockReturnValueOnce(first.promise)
    const c = setup(preview)
    c.setTarget({ op: 'create', form: emptyIpRuleForm() })
    expect(c.view.value.state).toBe('pending-input')
    first.resolve(result())
    await flushPromises()
    expect(c.view.value.state).toBe('pending-input')
    expect(preview).toHaveBeenCalledTimes(1)
  })

  it('편집 질의는 300ms 디바운스 — 그사이 loading · 이전 결과 없음 · clientIp 유지, 같은 키는 다시 안 부른다', async () => {
    const preview = vi.fn<PreviewFn>(async () => result())
    const c = setup(preview)
    await flushPromises()
    c.setTarget({ op: 'create', form: ready })
    expect(c.view.value).toMatchObject({
      state: 'loading',
      op: 'create',
      result: null,
      clientIp: '203.0.113.7',
    })
    vi.advanceTimersByTime(IP_PREVIEW_DEBOUNCE_MS - 1)
    expect(preview).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    await flushPromises()
    expect(preview).toHaveBeenLastCalledWith({
      op: 'create',
      scopeType: 'global',
      cidr: '203.0.113.0/24',
    })
    expect(c.view.value.state).toBe('ready')
    c.setTarget({ op: 'create', form: { ...ready } })
    vi.advanceTimersByTime(IP_PREVIEW_DEBOUNCE_MS)
    await flushPromises()
    expect(preview).toHaveBeenCalledTimes(2)
  })

  it('삭제는 바로 부른다', async () => {
    const preview = vi.fn<PreviewFn>(async () => result())
    const c = setup(preview)
    await flushPromises()
    c.setTarget({ op: 'delete', ruleNo: 12n })
    await flushPromises()
    expect(preview).toHaveBeenLastCalledWith({ op: 'delete', ruleNo: 12n })
  })

  it('🔴 권한 게터가 거짓이면 forbidden — 질의와 상관없이 부르지 않는다', async () => {
    const preview = vi.fn<PreviewFn>(async () => result())
    const c = setup(preview, { canManage: () => false })
    c.setTarget({ op: 'create', form: ready })
    vi.advanceTimersByTime(IP_PREVIEW_DEBOUNCE_MS)
    await flushPromises()
    expect(preview).not.toHaveBeenCalled()
    expect(c.view.value.state).toBe('forbidden')
  })

  it('403 → forbidden · 404 → stale + onStale · 400 · 500 → failed — 처리됨 표시 · clientIp 유지', async () => {
    const errors = [403, 404, 400, 500].map((status) => new ApiError('x', { status, raw: null }))
    const preview = vi.fn<PreviewFn>().mockResolvedValueOnce(result())
    for (const error of errors) preview.mockRejectedValueOnce(error)
    const onStale = vi.fn()
    const c = setup(preview, { onStale })
    await flushPromises()
    const states: string[] = []
    for (const ruleNo of [1n, 2n, 3n, 4n]) {
      c.setTarget({ op: 'delete', ruleNo })
      await flushPromises()
      states.push(c.view.value.state)
      expect(c.view.value.clientIp).toBe('203.0.113.7')
    }
    expect(states).toEqual(['forbidden', 'stale', 'failed', 'failed'])
    expect(onStale).toHaveBeenCalledTimes(1)
    expect(errors.every((error) => error.handled)).toBe(true)
  })

  it('🔴 늦게 온 앞 응답은 버린다', async () => {
    const a = deferred<AdminIpPreview>()
    const b = deferred<AdminIpPreview>()
    const preview = vi
      .fn<PreviewFn>()
      .mockResolvedValueOnce(result())
      .mockReturnValueOnce(a.promise)
      .mockReturnValueOnce(b.promise)
    const c = setup(preview)
    await flushPromises()
    c.setTarget({ op: 'delete', ruleNo: 1n })
    c.setTarget({ op: 'delete', ruleNo: 2n })
    b.resolve(result('198.51.100.2'))
    await flushPromises()
    a.resolve(result('198.51.100.1'))
    await flushPromises()
    expect(c.view.value.clientIp).toBe('198.51.100.2')
  })

  it('flush — 디바운스 중이면 바로 부르고 그 결과를 돌려준다', async () => {
    const preview = vi.fn<PreviewFn>(async () => result())
    const c = setup(preview)
    await flushPromises()
    c.setTarget({ op: 'create', form: ready })
    const flushed = await c.flush()
    expect(preview).toHaveBeenCalledTimes(2)
    expect(flushed.state).toBe('ready')
    vi.advanceTimersByTime(IP_PREVIEW_DEBOUNCE_MS)
    await flushPromises()
    expect(preview).toHaveBeenCalledTimes(2)
  })

  it('flush — 진행 중이면 그 응답을 기다린다', async () => {
    const pending = deferred<AdminIpPreview>()
    const preview = vi
      .fn<PreviewFn>()
      .mockResolvedValueOnce(result())
      .mockReturnValueOnce(pending.promise)
    const c = setup(preview)
    await flushPromises()
    c.setTarget({ op: 'delete', ruleNo: 1n })
    const flushing = c.flush()
    pending.resolve(result())
    expect((await flushing).state).toBe('ready')
  })

  it('refresh — 같은 질의를 다시 부른다', async () => {
    const preview = vi.fn<PreviewFn>(async () => result())
    const c = setup(preview)
    await flushPromises()
    c.refresh()
    await flushPromises()
    expect(preview).toHaveBeenCalledTimes(2)
  })

  it('해제 뒤에는 부르지 않고 날아오던 응답도 버린다', async () => {
    const pending = deferred<AdminIpPreview>()
    const preview = vi.fn<PreviewFn>().mockReturnValueOnce(pending.promise)
    const c = setup(preview)
    c.setTarget({ op: 'create', form: ready })
    scope.stop()
    vi.advanceTimersByTime(IP_PREVIEW_DEBOUNCE_MS)
    pending.resolve(result())
    await flushPromises()
    expect(preview).toHaveBeenCalledTimes(1)
    expect(c.view.value.state).not.toBe('ready')
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useIpPreview.test.ts`
Expected: FAIL — `./useIpPreview.js` 를 찾지 못함.

- [ ] **Step 3: 구현한다**

`packages/admin-ui/src/composables/useIpPreview.ts`:

```ts
import { computed, getCurrentScope, onScopeDispose, shallowRef, watch, type Ref } from 'vue'
import type { AdminIpPreview, AdminIpPreviewQuery } from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import {
  previewQueryKey,
  previewQueryOf,
  type IpPreviewState,
  type IpPreviewTarget,
  type IpPreviewView,
} from '../components/ip-access/ip-access.js'

// IP 변경 영향 미리보기의 상태 기계 — 질의 · 디바운스 · 순번 · flush(3g 스펙 I9–I12). 패키지 내부용.
//
// 정본: hangang-home apps/admin/src/pages/settings/ip-access.vue `previewQuery` · `loadPreview` · `previewSeq`
// 바꾼 점:
//  - 페이지 안 상태를 composable 하나로 떼어 따로 잰다.
//  - 편집 질의에 300ms 디바운스(hangang 은 없었다) — 현행 · 삭제는 바로.
//  - 400 을 "입력 중"이 아니라 failed 로 — 킷은 화면 · 서버가 같은 CIDR 파서라 400 은 계약 어긋남이다(I11).
//  - 🔴 `flush()` — 관문을 열기 전에 미리보기를 끝낸다(I12). hangang 은 창을 먼저 열고 그 안 문구가 바뀌었다.

export const IP_PREVIEW_DEBOUNCE_MS = 300

export interface IpPreviewOptions {
  preview: (query: AdminIpPreviewQuery) => Promise<AdminIpPreview>
  /** 게터 — 거짓이면 질의와 상관없이 forbidden 이고 부르지 않는다(I10) */
  canManage: () => boolean
  /** 404 — 대상 규칙이 이미 지워졌다. 목록을 다시 부르는 자리 */
  onStale?: () => void
  /** 기본 true — 만들 때 현행을 부른다 */
  immediate?: boolean
}

export interface IpPreviewController {
  view: Readonly<Ref<IpPreviewView>>
  target: Readonly<Ref<IpPreviewTarget>>
  setTarget: (target: IpPreviewTarget) => void
  /** 디바운스 중이면 바로 부르고, 진행 중이면 그 응답을 기다려 그때의 view 를 돌려준다 */
  flush: () => Promise<IpPreviewView>
  /** 같은 질의를 다시 부른다(목록을 다시 부른 뒤) */
  refresh: () => void
}

export function useIpPreview(options: IpPreviewOptions): IpPreviewController {
  const target = shallowRef<IpPreviewTarget>({ op: null })
  const view = shallowRef<IpPreviewView>({
    state: 'loading',
    op: null,
    result: null,
    clientIp: null,
  })
  let seq = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: { query: AdminIpPreviewQuery; mine: number } | null = null
  let current: Promise<void> | null = null
  let disposed = false

  /** 🔴 clientIp 는 한 번 받으면 뒤의 실패로 지우지 않는다(I2) */
  function show(
    state: IpPreviewState,
    result: AdminIpPreview | null,
    clientIp = view.value.clientIp,
  ): void {
    view.value = { state, op: target.value.op, result, clientIp }
  }

  async function run(query: AdminIpPreviewQuery, mine: number): Promise<void> {
    try {
      const result = await options.preview(query)
      if (mine !== seq || disposed) return
      show('ready', result, result.clientIp)
    } catch (error) {
      if (mine !== seq || disposed) return
      // 🔴 카드가 문구로 보인다 — 전역 토스트로 두 번 알리지 않는다(C7). catch 의 동기 구간에서 세운다.
      if (error instanceof ApiError) error.handled = true
      const status = error instanceof ApiError ? error.status : undefined
      if (status === 403) {
        show('forbidden', null)
      } else if (status === 404) {
        show('stale', null)
        options.onStale?.()
      } else {
        show('failed', null)
      }
    }
  }

  function start(query: AdminIpPreviewQuery, mine: number): Promise<void> {
    const promise: Promise<void> = run(query, mine).finally(() => {
      if (current === promise) current = null
    })
    current = promise
    return promise
  }

  function schedule(): void {
    clearTimeout(timer)
    timer = undefined
    pending = null
    // 🔴 어느 갈래든 순번을 올린다 — 날아오던 응답이 새 상태를 덮지 못하게(I11)
    const mine = ++seq
    if (!options.canManage()) {
      show('forbidden', null)
      return
    }
    const query = previewQueryOf(target.value)
    if (query === null) {
      show('pending-input', null)
      return
    }
    // 🔴 이전 결과를 남기지 않는다 — 입력과 어긋난 영향이 보이면 그것을 믿고 저장한다(I11)
    show('loading', null)
    const op = target.value.op
    if (op === 'create' || op === 'update') {
      pending = { query, mine }
      timer = setTimeout(() => {
        timer = undefined
        const next = pending
        pending = null
        if (next !== null && !disposed) void start(next.query, next.mine)
      }, IP_PREVIEW_DEBOUNCE_MS)
    } else {
      void start(query, mine)
    }
  }

  const key = computed(() =>
    options.canManage() ? previewQueryKey(previewQueryOf(target.value)) : 'forbidden',
  )
  // 🔴 질의 문자열 하나만 본다(I10). sync 라야 setTarget 바로 뒤의 flush 가 새 질의를 본다.
  watch(key, schedule, { flush: 'sync' })

  if (options.immediate !== false) schedule()

  async function flush(): Promise<IpPreviewView> {
    if (pending !== null) {
      clearTimeout(timer)
      timer = undefined
      const next = pending
      pending = null
      await start(next.query, next.mine)
    } else if (current !== null) {
      await current
    }
    return view.value
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
      clearTimeout(timer)
    })
  }

  return {
    view,
    target,
    setTarget: (next) => {
      target.value = next
    },
    flush,
    refresh: schedule,
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useIpPreview.test.ts`
Expected: PASS(12 tests)

Run: `pnpm --filter @ssworks/admin-ui typecheck && pnpm exec eslint packages/admin-ui/src/composables/useIpPreview.ts packages/admin-ui/src/composables/useIpPreview.test.ts`
Expected: 통과

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-ui/src/composables/useIpPreview.ts packages/admin-ui/src/composables/useIpPreview.test.ts
git commit -m "feat(admin-ui): IP 미리보기 상태 기계 useIpPreview(디바운스 · 순번 · flush · 404 stale)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `useIpAccessRules` — 목록 · 편집 · 대상 후보 · 바인딩

**Files:**

- Create: `packages/admin-ui/src/composables/useIpAccessRules.ts`
- Create: `packages/admin-ui/src/composables/useIpAccessRules.render.test.ts`

**Interfaces:**

- Consumes: Task 1 · 2 함수 · 타입; Task 3 `useIpPreview`; `useRemoteSearch`(3f — `{ items, searching, failed, search }`); `useWriteFlow()`(`run` · `submitting` · `fieldErrors` · `clearFieldErrors` · `confirmDialog` · `reauthDialog`); `useOptionalAdminUi()`(`user()?.userId`); `ApiError` · `toApiError`
- Produces:
  - `UseIpAccessRulesOptions<R extends AdminIpRule = AdminIpRule>`(스펙 §4-3 그대로)
  - `IpRuleDoneEvent<R> { action: 'create' | 'update' | 'remove'; rule: R | null }`
  - `IpAccessManagerBindings<R>` — 아래 코드의 키 그대로(Task 8 `IpAccessManager` props · emits 와 1:1)
  - `IpAccessRules<R>` — `rules` · `loading` · `loadError` · `reload()` · `editing` · `form` · `preview` · `openCreate()` · `openEdit(rule)` · `closeEditor()` · `save()` · `remove(rule)` · `submitting` · `manager`
  - 이 Task 에서 `save` · `remove` 는 자리 표시(늘 `false`)다 — Task 5 가 채운다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-ui/src/composables/useIpAccessRules.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type Plugin } from 'vue'
import type {
  AdminIpPreview,
  AdminIpPreviewItem,
  AdminIpPreviewQuery,
  AdminIpRule,
  AdminTeamNode,
} from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import {
  DEFAULT_IP_ACCESS_MESSAGES as M,
  type IpUserOption,
} from '../components/ip-access/ip-access.js'
import { createAdminUi } from '../context/admin-ui.js'
import { IP_PREVIEW_DEBOUNCE_MS } from './useIpPreview.js'
import { REMOTE_SEARCH_DEBOUNCE_MS } from './useRemoteSearch.js'
import {
  useIpAccessRules,
  type IpAccessRules,
  type UseIpAccessRulesOptions,
} from './useIpAccessRules.js'

// 정본: hangang-home ip-access.render.test.ts(상시 카드 · 편집 패널 · 본인 표시 · 권한 없음)를 composable 에 대고 잰다.

const rule = (over: Partial<AdminIpRule> = {}): AdminIpRule => ({
  ruleNo: 12n,
  scopeType: 'team',
  scopeRefNo: 4n,
  scopeName: '상담센터',
  scopeUserId: null,
  cidr: '203.0.113.0/24',
  description: '상담센터 사무실',
  revision: 3,
  createAt: '2026-10-01T00:00:00.000Z',
  updateAt: '2026-10-02T00:00:00.000Z',
  ...over,
})

const GLOBAL_V4 = rule({
  ruleNo: 1n,
  scopeType: 'global',
  scopeRefNo: null,
  scopeName: null,
  cidr: '0.0.0.0/0',
  description: '기본 허용(IPv4)',
  revision: 0,
})
const TEAM = rule()
const USER = rule({
  ruleNo: 20n,
  scopeType: 'user',
  scopeRefNo: 3n,
  scopeName: '김운영',
  scopeUserId: 'ops01',
  cidr: '203.0.113.7/32',
})
const RULES = [GLOBAL_V4, TEAM, USER]

const previewItem = (over: Partial<AdminIpPreviewItem> = {}): AdminIpPreviewItem => ({
  userNo: 7n,
  userId: 'cs07',
  userName: '이상담',
  layerBefore: 'global',
  layerAfter: 'team',
  statusBefore: 'passes',
  statusAfter: 'locked',
  becomesLocked: true,
  ruleSetChanged: true,
  activeSessionCount: 1,
  blockedSessionCount: 1,
  unknownIpSessionCount: 0,
  ...over,
})

const previewResult = (over: Partial<AdminIpPreview> = {}): AdminIpPreview => ({
  clientIp: '203.0.113.7',
  clientPasses: true,
  summary: {
    total: 14,
    newlyLocked: 0,
    alreadyLocked: 0,
    unknown: 0,
    blockedSessions: 0,
    ruleSetChangedOnly: 0,
  },
  items: [],
  ...over,
})

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function setup(over: Partial<UseIpAccessRulesOptions> = {}, plugins: Plugin[] = []) {
  const adapters = {
    list: vi.fn(async () => RULES),
    preview: vi.fn(async (_query: AdminIpPreviewQuery) => previewResult()),
    create: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
    remove: vi.fn(async () => ({})),
  }
  let ip!: IpAccessRules<AdminIpRule>
  wrapper = mount(
    defineComponent({
      setup() {
        ip = useIpAccessRules({ ...adapters, canManage: () => true, ...over })
        return () => h('div')
      },
    }),
    { global: { plugins } },
  )
  await flushPromises()
  return { ...adapters, ip }
}

describe('useIpAccessRules — 목록 · 현행 미리보기', () => {
  it('처음 — 목록과 현행 미리보기를 부른다', async () => {
    const { list, preview, ip } = await setup()
    expect(list).toHaveBeenCalledTimes(1)
    expect(preview).toHaveBeenCalledWith({})
    const m = ip.manager.value
    expect(m.rules).toEqual(RULES)
    expect(m.loading).toBe(false)
    expect(m.preview).toMatchObject({ state: 'ready', op: null, clientIp: '203.0.113.7' })
    expect(m.editing).toBeNull()
  })

  it('목록 실패 — loadFailed · 직전 목록 유지 · [다시 시도]로 회복', async () => {
    const list = vi
      .fn<() => Promise<readonly AdminIpRule[]>>()
      .mockResolvedValueOnce(RULES)
      .mockRejectedValueOnce(new ApiError('x', { status: 500, raw: null }))
      .mockResolvedValueOnce([TEAM])
    const { ip } = await setup({ list })
    await ip.reload()
    expect(ip.manager.value.loadFailed).toBe(true)
    expect(ip.manager.value.rules).toEqual(RULES)
    ip.manager.value.onRetry()
    await flushPromises()
    expect(ip.manager.value.loadFailed).toBe(false)
    expect(ip.manager.value.rules).toEqual([TEAM])
  })

  it('🔴 관리 권한이 없으면 — 미리보기 forbidden · 편집을 열지 않는다', async () => {
    const { preview, ip } = await setup({ canManage: () => false })
    expect(preview).not.toHaveBeenCalled()
    expect(ip.manager.value.preview.state).toBe('forbidden')
    expect(ip.manager.value.canManage).toBe(false)
    expect(await ip.openCreate()).toBe(false)
    expect(ip.editing.value).toBeNull()
  })
})

describe('useIpAccessRules — 편집 패널', () => {
  it('새 규칙 — 빈 폼 · 미리보기는 pending-input', async () => {
    const { ip } = await setup()
    expect(await ip.openCreate()).toBe(true)
    expect(ip.manager.value.editing).toBe('new')
    expect(ip.manager.value.form).toEqual({
      scopeType: 'global',
      scopeRefNo: '',
      cidr: '',
      description: '',
    })
    expect(ip.manager.value.preview).toMatchObject({ state: 'pending-input', op: 'create' })
  })

  it('수정 — 규칙 값으로 채우고 300ms 뒤 수정 미리보기', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { preview, ip } = await setup()
    await ip.openEdit(TEAM)
    expect(ip.form.value).toEqual({
      scopeType: 'team',
      scopeRefNo: '4',
      cidr: '203.0.113.0/24',
      description: '상담센터 사무실',
    })
    expect(ip.manager.value.preview.state).toBe('loading')
    vi.advanceTimersByTime(IP_PREVIEW_DEBOUNCE_MS)
    await flushPromises()
    expect(preview).toHaveBeenLastCalledWith({
      op: 'update',
      ruleNo: 12n,
      scopeType: 'team',
      scopeRefNo: 4n,
      cidr: '203.0.113.0/24',
    })
  })

  it('🔴 범위를 바꾸면 대상을 비운다 — 팀 번호가 사용자 번호로 남지 않게', async () => {
    const { ip } = await setup()
    await ip.openEdit(TEAM)
    ip.manager.value['onUpdate:form']({ ...ip.form.value, scopeType: 'user' })
    expect(ip.form.value).toMatchObject({ scopeType: 'user', scopeRefNo: '' })
  })

  it('CIDR 칸을 떠날 때 형식 오류를 보이고, 다시 고치면 내린다', async () => {
    const { ip } = await setup()
    await ip.openCreate()
    ip.manager.value['onUpdate:form']({ ...ip.form.value, cidr: '10.0.0.1' })
    ip.manager.value.onCidrBlur()
    expect(ip.manager.value.fieldErrors.cidr).toEqual([M.cidrInvalid])
    ip.manager.value['onUpdate:form']({ ...ip.form.value, cidr: '10.0.0.0/8' })
    expect(ip.manager.value.fieldErrors.cidr).toBeUndefined()
  })

  it('🔴 고친 값이 있으면 버릴지 묻는다 — 취소면 그대로, 버리면 넘어간다', async () => {
    const { ip } = await setup()
    await ip.openEdit(TEAM)
    ip.manager.value['onUpdate:form']({ ...ip.form.value, cidr: '10.0.0.0/8' })
    const first = ip.openCreate()
    await flushPromises()
    expect(ip.manager.value.discardDialog).toMatchObject({
      modelValue: true,
      title: M.discardTitle,
      reversible: false,
    })
    ip.manager.value.discardDialog['onUpdate:modelValue'](false)
    expect(await first).toBe(false)
    expect(ip.editing.value).toBe(TEAM)
    const second = ip.openCreate()
    await flushPromises()
    ip.manager.value.discardDialog.onConfirm()
    expect(await second).toBe(true)
    expect(ip.editing.value).toBe('new')
  })

  it('고친 값이 없으면 묻지 않고 닫는다', async () => {
    const { ip } = await setup()
    await ip.openEdit(TEAM)
    expect(await ip.closeEditor()).toBe(true)
    expect(ip.manager.value.discardDialog.modelValue).toBe(false)
    expect(ip.editing.value).toBeNull()
  })

  it('🔴 미리보기 404 — 목록을 다시 부르고, 편집 중인 규칙이 사라졌으면 패널을 닫는다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const list = vi
      .fn<() => Promise<readonly AdminIpRule[]>>()
      .mockResolvedValueOnce(RULES)
      .mockResolvedValue([GLOBAL_V4, USER])
    const preview = vi
      .fn(async (_query: AdminIpPreviewQuery) => previewResult())
      .mockResolvedValueOnce(previewResult())
      .mockRejectedValueOnce(new ApiError('없음', { status: 404, raw: null }))
    const { ip } = await setup({ list, preview })
    await ip.openEdit(TEAM)
    vi.advanceTimersByTime(IP_PREVIEW_DEBOUNCE_MS)
    await flushPromises()
    expect(list).toHaveBeenCalledTimes(2)
    expect(ip.editing.value).toBeNull()
    expect(ip.manager.value.alerts).toEqual([{ kind: 'warning', text: M.ruleGone }])
  })

  it('전체 허용 규칙을 좁히면 globalAllowRemoval', async () => {
    const { ip } = await setup()
    await ip.openEdit(GLOBAL_V4)
    expect(ip.manager.value.globalAllowRemoval).toBe(false)
    ip.manager.value['onUpdate:form']({ ...ip.form.value, cidr: '203.0.113.0/24' })
    expect(ip.manager.value.globalAllowRemoval).toBe(true)
  })
})

describe('useIpAccessRules — 대상 후보', () => {
  const tree: AdminTeamNode[] = [
    {
      teamNo: 1n,
      teamName: '본사',
      displayOrder: 0,
      children: [{ teamNo: 4n, teamName: '상담센터', displayOrder: 0, children: [] }],
    },
  ]

  it('팀 — 편집을 열 때 불러 경로 항목으로', async () => {
    const loadTeams = vi.fn(async () => tree)
    const { ip } = await setup({ loadTeams })
    expect(loadTeams).not.toHaveBeenCalled()
    await ip.openEdit(TEAM)
    await flushPromises()
    expect(loadTeams).toHaveBeenCalledTimes(1)
    expect(ip.manager.value.teamMode).toBe('select')
    expect(ip.manager.value.teamItems).toEqual([
      { value: '1', title: '본사' },
      { value: '4', title: '본사 › 상담센터' },
    ])
  })

  it('🔴 팀 권한 게터가 거짓이면 부르지 않고 번호 칸 · 이유', async () => {
    const loadTeams = vi.fn(async () => tree)
    const { ip } = await setup({ loadTeams, canLoadTeams: () => false })
    await ip.openEdit(TEAM)
    await flushPromises()
    expect(loadTeams).not.toHaveBeenCalled()
    expect(ip.manager.value.teamMode).toBe('number')
    expect(ip.manager.value.teamHint).toBe(M.teamNoPermissionHint)
  })

  it('팀 후보 실패 — teamsFailed · 처리됨 · 지금 대상은 이름으로 남는다', async () => {
    const error = new ApiError('x', { status: 500, raw: null })
    const loadTeams = vi.fn(async (): Promise<AdminTeamNode[]> => {
      throw error
    })
    const { ip } = await setup({ loadTeams })
    await ip.openEdit(TEAM)
    await flushPromises()
    expect(ip.manager.value.teamsFailed).toBe(true)
    expect(error.handled).toBe(true)
    expect(ip.manager.value.teamItems).toEqual([{ value: '4', title: '상담센터' }])
  })

  it('사용자 — 300ms 뒤 검색, 수정 때는 지금 대상을 이름(아이디)으로', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const options: IpUserOption[] = [{ userNo: 9n, userId: 'park', userName: '박보안' }]
    const searchUsers = vi.fn(async () => options)
    const { ip } = await setup({ searchUsers })
    await ip.openEdit(USER)
    expect(ip.manager.value.userMode).toBe('search')
    expect(ip.manager.value.userItems).toEqual([{ value: '3', title: '김운영 (ops01)' }])
    ip.manager.value.onSearchUsers('박')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    expect(searchUsers).toHaveBeenCalledWith('박')
    expect(ip.manager.value.userItems).toEqual([
      { value: '3', title: '김운영 (ops01)' },
      { value: '9', title: '박보안 (park)' },
    ])
  })

  it('🔴 사용자 권한 게터가 거짓이면 부르지 않고 번호 칸 · 이유', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const searchUsers = vi.fn(async () => [] as IpUserOption[])
    const { ip } = await setup({ searchUsers, canSearchUsers: () => false })
    ip.manager.value.onSearchUsers('박')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    expect(searchUsers).not.toHaveBeenCalled()
    expect(ip.manager.value.userMode).toBe('number')
    expect(ip.manager.value.userHint).toBe(M.userNoPermissionHint)
  })
})

describe('useIpAccessRules — 카드 바인딩', () => {
  const items = [
    previewItem({ userNo: 1n, userId: 'ops01', userName: '김운영' }),
    previewItem({ userNo: 2n, becomesLocked: false, ruleSetChanged: true }),
  ]

  it('잠기는 사람 · 규칙만 바뀌는 사람 · 🔴 본인 판정 기본은 로그인한 아이디', async () => {
    const plugins = [
      createAdminUi({
        user: () => ({ userId: 'ops01', userName: '김운영', permissions: ['*'] }),
        logout: async () => {},
      }),
    ]
    const { ip } = await setup({ preview: vi.fn(async () => previewResult({ items })) }, plugins)
    const m = ip.manager.value
    expect(m.lockedItems.map((i) => i.userNo)).toEqual([1n])
    expect(m.changedItems.map((i) => i.userNo)).toEqual([2n])
    expect(m.isSelf(items[0]!)).toBe(true)
    expect(m.isSelf(items[1]!)).toBe(false)
  })

  it('isSelf 옵션이 기본을 대신한다 · 컨텍스트가 없으면 본인 표시만 빠진다', async () => {
    const { ip } = await setup({
      preview: vi.fn(async () => previewResult({ items })),
      isSelf: (i) => i.userNo === 2n,
    })
    expect(ip.manager.value.isSelf(items[1]!)).toBe(true)
    wrapper?.unmount()
    const other = await setup({ preview: vi.fn(async () => previewResult({ items })) })
    expect(other.ip.manager.value.isSelf(items[0]!)).toBe(false)
  })

  it('문구 덮어쓰기 · 범위 항목', async () => {
    const { ip } = await setup({ messages: { hintRecovery: '런북: runbook/ip.md' } })
    expect(ip.manager.value.messages.hintRecovery).toBe('런북: runbook/ip.md')
    expect(ip.manager.value.messages.save).toBe('저장')
    expect(ip.manager.value.scopeItems.map((i) => i.value)).toEqual(['user', 'team', 'global'])
  })

  it('reload — 목록과 카드(현재 IP)를 함께 다시 부른다', async () => {
    const { list, preview, ip } = await setup()
    await ip.reload()
    await flushPromises()
    expect(list).toHaveBeenCalledTimes(2)
    expect(preview).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useIpAccessRules.render.test.ts`
Expected: FAIL — `./useIpAccessRules.js` 를 찾지 못함.

- [ ] **Step 3: 구현한다**

`packages/admin-ui/src/composables/useIpAccessRules.ts`:

```ts
import {
  computed,
  getCurrentScope,
  onScopeDispose,
  ref,
  shallowRef,
  type ComputedRef,
  type Ref,
} from 'vue'
import type {
  AdminIpPreview,
  AdminIpPreviewItem,
  AdminIpPreviewQuery,
  AdminIpRule,
  AdminIpRuleCreate,
  AdminIpRuleRemove,
  AdminIpRuleUpdate,
  AdminTeamNode,
} from '@ssworks/admin-shared'
import { ApiError, toApiError } from '../api/error.js'
import {
  DEFAULT_IP_ACCESS_MESSAGES,
  changedItemsOf,
  emptyIpRuleForm,
  flattenTeamPaths,
  ipRuleFormProblems,
  lockedItemsOf,
  removesGlobalAllow,
  ruleToForm,
  sameIpRuleForm,
  scopeTypeItems,
  userOptionTitle,
  type IpAccessAlert,
  type IpAccessMessages,
  type IpPreviewView,
  type IpRuleForm,
  type IpSelectItem,
  type IpUserOption,
  type IpWriteContext,
} from '../components/ip-access/ip-access.js'
import { useOptionalAdminUi } from '../context/admin-ui.js'
import { useIpPreview } from './useIpPreview.js'
import { useRemoteSearch } from './useRemoteSearch.js'
import {
  useWriteFlow,
  type ConfirmDialogBindings,
  type ReauthDialogBindings,
} from './useWriteFlow.js'

// IP 접근 제어 관리의 흐름 — 목록 · 편집 패널 · 대상 후보 · 미리보기 · 쓰기. `IpAccessManager` 에 `v-bind` 할 바인딩을 낸다.
//
// 정본: hangang-home apps/admin/src/pages/settings/ip-access.vue(목록 · 상시 카드 · 인라인 편집 패널 · 저장 전 스냅숏 ·
//       실패해도 재조회 · 검증이 비밀번호보다 먼저 · 첫 줄 가드) + kim5257-crm-v5 ip_access_control.vue(대상 후보 · 팀 경로)
// 바꾼 점:
//  ① 페이지 상태를 composable 하나로. 미리보기는 `useIpPreview`, 관문은 3a `useWriteFlow`, 사용자 검색은 `useRemoteSearch`.
//  ② 대상을 번호로 치던 칸을 후보 고르기로(④ T1) — 권한 게터가 거짓이면 부르지 않고 번호 칸(C9).
//  ③ 세션 끊기 제안이 없다(⑥ S2). revision 충돌 · 409 자기 잠금 처리가 새로 생겼다(hangang 에 없음).
//  ④ 고친 값 버리기 창을 바인딩으로 낸다 — 킷 `useConfirm` 은 플러그인이 없으면 던진다(I21).
//
// 🔴 편집 · 삭제 · 열기는 `busy`(쓰기 진행 중) 동안 막힌다 — 그래서 재조회 중에 다른 규칙을 여는 경합이 생기지 않는다(I24).

export interface IpRuleDoneEvent<R> {
  action: 'create' | 'update' | 'remove'
  rule: R | null
}

export interface UseIpAccessRulesOptions<R extends AdminIpRule = AdminIpRule> {
  /** GET /ip-access → items */
  list: () => Promise<readonly R[]>
  /** GET /ip-access/preview */
  preview: (query: AdminIpPreviewQuery) => Promise<AdminIpPreview>
  create: (body: AdminIpRuleCreate, ctx: IpWriteContext) => Promise<unknown>
  update: (rule: R, body: AdminIpRuleUpdate, ctx: IpWriteContext) => Promise<unknown>
  /** api.del(url, body) — 🔴 두 번째 인자가 본문이다(I16) */
  remove: (rule: R, body: AdminIpRuleRemove, ctx: IpWriteContext) => Promise<unknown>
  /** 게터 — ipAccess.manage. 거짓이면 미리보기 · 쓰기를 부르지 않는다 */
  canManage: () => boolean
  /** 기본 false(서버 기본과 같다). 서버 reauth 옵션과 맞춘다 — false 여도 쓰기는 확인 창을 거친다(I13) */
  reauth?: boolean
  loadTeams?: () => Promise<readonly AdminTeamNode[]>
  /** 게터 — 기본 () => true */
  canLoadTeams?: () => boolean
  searchUsers?: (keyword: string) => Promise<readonly IpUserOption[]>
  /** 게터 — 기본 () => true */
  canSearchUsers?: () => boolean
  /** 기본 item.userId === useAdminUi().user()?.userId — 컨텍스트가 없으면 본인 표시만 빠진다 */
  isSelf?: (item: AdminIpPreviewItem) => boolean
  onDone?: (event: IpRuleDoneEvent<R>) => void | Promise<void>
  messages?: Partial<IpAccessMessages>
  /** 기본 true */
  immediate?: boolean
}

/** `<IpAccessManager v-bind="ip.manager.value" />` — props 와 리스너 이름은 컴포넌트 그대로 */
export interface IpAccessManagerBindings<R> {
  rules: readonly R[]
  loading: boolean
  loadFailed: boolean
  onRetry: () => void
  canManage: boolean
  editing: R | 'new' | null
  form: IpRuleForm
  'onUpdate:form': (form: IpRuleForm) => void
  fieldErrors: Readonly<Record<string, readonly string[]>>
  onCidrBlur: () => void
  scopeItems: readonly IpSelectItem[]
  teamMode: 'select' | 'number'
  teamItems: readonly IpSelectItem[]
  teamsLoading: boolean
  teamsFailed: boolean
  teamHint: string | null
  userMode: 'search' | 'number'
  userItems: readonly IpSelectItem[]
  usersSearching: boolean
  usersFailed: boolean
  userHint: string | null
  onSearchUsers: (keyword: string) => void
  onOpenCreate: () => void
  onOpenEdit: (rule: R) => void
  onCancel: () => void
  onSave: () => void
  onRemove: (rule: R) => void
  submitting: boolean
  busy: boolean
  preview: IpPreviewView
  lockedItems: readonly AdminIpPreviewItem[]
  changedItems: readonly AdminIpPreviewItem[]
  isSelf: (item: AdminIpPreviewItem) => boolean
  globalAllowRemoval: boolean
  alerts: readonly IpAccessAlert[]
  onDismissAlert: (index: number) => void
  confirmDialog: ConfirmDialogBindings
  reauthDialog: ReauthDialogBindings
  discardDialog: ConfirmDialogBindings
  messages: IpAccessMessages
}

export interface IpAccessRules<R> {
  rules: Readonly<Ref<readonly R[]>>
  loading: Readonly<Ref<boolean>>
  loadError: Readonly<Ref<unknown>>
  /** 목록과 카드(현행 · 편집 중이면 그 미리보기)를 다시 부른다 */
  reload: () => Promise<void>
  /** null = 닫힘 · 'new' = 만들기 · R = 그 규칙 수정 */
  editing: Readonly<Ref<R | 'new' | null>>
  form: Readonly<Ref<IpRuleForm>>
  preview: Readonly<Ref<IpPreviewView>>
  /** 고친 값이 있으면 버릴지 묻는다(I21). 취소 · 막힘이면 false */
  openCreate: () => Promise<boolean>
  openEdit: (rule: R) => Promise<boolean>
  closeEditor: () => Promise<boolean>
  save: () => Promise<boolean>
  remove: (rule: R) => Promise<boolean>
  submitting: Readonly<Ref<boolean>>
  /** <IpAccessManager v-bind="ip.manager.value" /> — 확인 · 재인증 · 버리기 창도 이 안에 있다 */
  manager: ComputedRef<IpAccessManagerBindings<R>>
}

/** setup 안에서 부른다. */
export function useIpAccessRules<R extends AdminIpRule = AdminIpRule>(
  options: UseIpAccessRulesOptions<R>,
): IpAccessRules<R> {
  const messages: IpAccessMessages = { ...DEFAULT_IP_ACCESS_MESSAGES, ...options.messages }
  const scopeItems = scopeTypeItems(messages)
  const flow = useWriteFlow()
  // 기본값을 쓸 때만 컨텍스트를 찾는다 — 플러그인이 없으면 본인 표시만 빠진다(I6)
  const ui = options.isSelf == null ? useOptionalAdminUi() : null
  const isSelf =
    options.isSelf ??
    ((item: AdminIpPreviewItem) => {
      const userId = ui?.user()?.userId
      return userId != null && userId !== '' && item.userId === userId
    })
  let disposed = false

  // ── 목록 ──────────────────────────────────────────────────────────

  const rules = shallowRef<readonly R[]>([])
  const loading = ref(false)
  const loadError = shallowRef<ApiError | null>(null)
  let listSeq = 0

  /** 반영됐으면 true. 🔴 늦은 응답은 버린다(I24). 실패해도 직전 목록은 둔다 */
  async function load(): Promise<boolean> {
    const mine = ++listSeq
    loading.value = true
    loadError.value = null
    try {
      const items = await options.list()
      if (mine !== listSeq || disposed) return false
      rules.value = items
      return true
    } catch (error) {
      if (mine !== listSeq || disposed) return false
      // 처리됨으로 표시하지 않는다 — 표 위 알림과 전역 토스트가 둘 다 뜬다(C7)
      loadError.value = toApiError(error)
      return false
    } finally {
      if (mine === listSeq && !disposed) loading.value = false
    }
  }

  function findRule(ruleNo: bigint): R | undefined {
    return rules.value.find((item) => item.ruleNo === ruleNo)
  }

  // ── 알림 ──────────────────────────────────────────────────────────

  const alerts = shallowRef<readonly IpAccessAlert[]>([])

  function pushAlert(kind: IpAccessAlert['kind'], text: string): void {
    if (alerts.value.some((alert) => alert.kind === kind && alert.text === text)) return
    alerts.value = [...alerts.value, { kind, text }]
  }

  // ── 편집 상태 · 미리보기 ───────────────────────────────────────────

  const editing = shallowRef<R | 'new' | null>(null)
  const form = ref<IpRuleForm>(emptyIpRuleForm())
  /** 연 순간의 폼 — 고친 값 판정의 기준(I21) */
  let baseline: IpRuleForm = emptyIpRuleForm()
  const clientErrors = shallowRef<Record<string, string[]>>({})
  const removing = shallowRef<R | null>(null)
  const working = ref(false)
  const busy = computed(() => working.value || flow.submitting.value)
  const isDirty = (): boolean => editing.value !== null && !sameIpRuleForm(form.value, baseline)

  const preview = useIpPreview({
    preview: options.preview,
    canManage: () => options.canManage(),
    onStale: () => {
      void onStale()
    },
    immediate: options.immediate,
  })

  function syncTarget(): void {
    const deleting = removing.value
    const current = editing.value
    if (deleting != null) preview.setTarget({ op: 'delete', ruleNo: deleting.ruleNo })
    else if (current === null) preview.setTarget({ op: null })
    else if (current === 'new') preview.setTarget({ op: 'create', form: { ...form.value } })
    else preview.setTarget({ op: 'update', ruleNo: current.ruleNo, form: { ...form.value } })
  }

  // ── 대상 후보 ──────────────────────────────────────────────────────

  /** `team:4` · `user:3` → 칸에 보일 글자. 규칙 행 · 팀 트리 · 검색 결과에서 모은다 */
  const knownTargets = new Map<string, string>()

  function rememberTarget(rule: AdminIpRule): void {
    if (rule.scopeType === 'global' || rule.scopeRefNo == null || rule.scopeName == null) return
    const title =
      rule.scopeType === 'user' && rule.scopeUserId != null
        ? userOptionTitle({ userName: rule.scopeName, userId: rule.scopeUserId })
        : rule.scopeName
    knownTargets.set(`${rule.scopeType}:${rule.scopeRefNo}`, title)
  }

  const canTeams = (): boolean => options.loadTeams != null && (options.canLoadTeams?.() ?? true)
  const teamItems = shallowRef<readonly IpSelectItem[]>([])
  const teamsLoading = ref(false)
  const teamsFailed = ref(false)
  let teamSeq = 0

  /** 편집을 열 때마다 부른다(I20). 🔴 권한 게터가 거짓이면 부르지 않는다(C9) */
  function loadTeams(): void {
    const fetchTree = options.loadTeams
    if (fetchTree == null || !canTeams()) return
    const mine = ++teamSeq
    teamsLoading.value = true
    teamsFailed.value = false
    void fetchTree()
      .then(
        (tree) => {
          if (mine !== teamSeq || disposed) return
          const items = flattenTeamPaths(tree)
          for (const item of items) knownTargets.set(`team:${item.value}`, item.title)
          teamItems.value = items
        },
        (error: unknown) => {
          if (mine !== teamSeq || disposed) return
          // 칸 아래 문구로 보인다 — 전역 토스트로 두 번 알리지 않는다(C7)
          if (error instanceof ApiError) error.handled = true
          teamsFailed.value = true
        },
      )
      .finally(() => {
        if (mine === teamSeq && !disposed) teamsLoading.value = false
      })
  }

  const userSearch = options.searchUsers != null ? useRemoteSearch(options.searchUsers) : null
  const canUsers = (): boolean => userSearch != null && (options.canSearchUsers?.() ?? true)

  /** 지금 대상이 후보에 없어도 칸이 이름을 보이게 맨 앞에 둔다 */
  function withCurrent(items: IpSelectItem[], scopeType: 'team' | 'user'): IpSelectItem[] {
    const refNo = form.value.scopeRefNo.trim()
    if (
      form.value.scopeType !== scopeType ||
      refNo === '' ||
      items.some((item) => item.value === refNo)
    ) {
      return items
    }
    return [
      { value: refNo, title: knownTargets.get(`${scopeType}:${refNo}`) ?? `#${refNo}` },
      ...items,
    ]
  }

  const teamItemList = computed(() => withCurrent([...teamItems.value], 'team'))
  const userItemList = computed(() => {
    const items = (userSearch?.items.value ?? []).map((option) => {
      const item = { value: String(option.userNo), title: userOptionTitle(option) }
      knownTargets.set(`user:${item.value}`, item.title)
      return item
    })
    return withCurrent(items, 'user')
  })

  // ── 고친 값 버리기 ─────────────────────────────────────────────────

  const discardOpen = ref(false)
  let discardResolve: ((ok: boolean) => void) | null = null

  /** 고친 값이 없으면 바로 true. 있으면 창을 열고 답을 기다린다(I21) */
  function askDiscard(): Promise<boolean> {
    if (!isDirty()) return Promise.resolve(true)
    discardResolve?.(false)
    return new Promise<boolean>((resolve) => {
      discardResolve = resolve
      discardOpen.value = true
    })
  }

  function settleDiscard(ok: boolean): void {
    discardOpen.value = false
    const resolve = discardResolve
    discardResolve = null
    resolve?.(ok)
  }

  const discardDialog = computed<ConfirmDialogBindings>(() => ({
    modelValue: discardOpen.value,
    'onUpdate:modelValue': (open: boolean) => {
      if (!open) settleDiscard(false)
    },
    title: messages.discardTitle,
    message: messages.discardMessage,
    reversible: false,
    submitting: false,
    confirmLabel: messages.discardConfirm,
    onConfirm: () => settleDiscard(true),
  }))

  // ── 편집 열고 닫기 · 폼 ────────────────────────────────────────────

  function setEditor(next: R | 'new' | null): void {
    editing.value = next
    form.value = next === null || next === 'new' ? emptyIpRuleForm() : ruleToForm(next)
    baseline = { ...form.value }
    clientErrors.value = {}
    flow.clearFieldErrors()
    if (next !== null && next !== 'new') rememberTarget(next)
    syncTarget()
    if (next !== null) loadTeams()
  }

  async function openCreate(): Promise<boolean> {
    // 🔴 첫 줄 가드 — :disabled 는 마우스만 막는다
    if (!options.canManage() || busy.value) return false
    if (!(await askDiscard())) return false
    alerts.value = []
    setEditor('new')
    return true
  }

  async function openEdit(rule: R): Promise<boolean> {
    if (!options.canManage() || busy.value) return false
    if (!(await askDiscard())) return false
    alerts.value = []
    setEditor(rule)
    return true
  }

  async function closeEditor(): Promise<boolean> {
    if (editing.value === null) return true
    if (busy.value) return false
    if (!(await askDiscard())) return false
    setEditor(null)
    return true
  }

  function updateForm(next: IpRuleForm): void {
    if (editing.value === null || busy.value) return
    // 🔴 범위를 바꾸면 대상을 비운다(I19) — 팀 번호가 사용자 번호로, 본 적 없는 번호가 남지 않게
    form.value = next.scopeType !== form.value.scopeType ? { ...next, scopeRefNo: '' } : { ...next }
    clientErrors.value = {}
    flow.clearFieldErrors()
    syncTarget()
  }

  /** CIDR 칸을 떠날 때 형식 오류를 보인다(I19). 빈 칸은 저장 때 */
  function cidrBlur(): void {
    if (editing.value === null || form.value.cidr.trim() === '') return
    const cidr = ipRuleFormProblems(form.value, messages).cidr
    if (cidr != null) clientErrors.value = { ...clientErrors.value, cidr }
  }

  /** 미리보기 404 — 목록을 다시 부르고, 편집 중인 규칙이 사라졌으면 패널을 닫는다(I11) */
  async function onStale(): Promise<void> {
    const applied = await load()
    const current = editing.value
    if (applied && current !== null && current !== 'new' && findRule(current.ruleNo) == null) {
      setEditor(null)
      pushAlert('warning', messages.ruleGone)
    }
  }

  // ── 쓰기 — Task 5 가 채운다 ────────────────────────────────────────

  async function save(): Promise<boolean> {
    return false
  }

  async function remove(_rule: R): Promise<boolean> {
    return false
  }

  // ── 바인딩 ────────────────────────────────────────────────────────

  const globalAllowRemoval = computed(() => {
    const deleting = removing.value
    if (deleting != null) return removesGlobalAllow(deleting.cidr, null)
    const current = editing.value
    return (
      current !== null &&
      current !== 'new' &&
      removesGlobalAllow(current.cidr, form.value.cidr.trim())
    )
  })

  const manager = computed<IpAccessManagerBindings<R>>(() => ({
    rules: rules.value,
    loading: loading.value,
    loadFailed: loadError.value != null,
    onRetry: () => {
      void load()
      preview.refresh()
    },
    canManage: options.canManage(),
    editing: editing.value,
    form: form.value,
    'onUpdate:form': updateForm,
    fieldErrors: { ...flow.fieldErrors.value, ...clientErrors.value },
    onCidrBlur: cidrBlur,
    scopeItems,
    teamMode: canTeams() ? 'select' : 'number',
    teamItems: teamItemList.value,
    teamsLoading: teamsLoading.value,
    teamsFailed: teamsFailed.value,
    teamHint: options.loadTeams != null && !canTeams() ? messages.teamNoPermissionHint : null,
    userMode: canUsers() ? 'search' : 'number',
    userItems: userItemList.value,
    usersSearching: userSearch?.searching.value ?? false,
    usersFailed: userSearch?.failed.value ?? false,
    userHint: userSearch != null && !canUsers() ? messages.userNoPermissionHint : null,
    onSearchUsers: (keyword) => {
      if (canUsers()) userSearch?.search(keyword)
    },
    onOpenCreate: () => {
      void openCreate()
    },
    onOpenEdit: (rule) => {
      void openEdit(rule)
    },
    onCancel: () => {
      void closeEditor()
    },
    onSave: () => {
      void save()
    },
    onRemove: (rule) => {
      void remove(rule)
    },
    submitting: flow.submitting.value,
    busy: busy.value,
    preview: preview.view.value,
    lockedItems: lockedItemsOf(preview.view.value),
    changedItems: changedItemsOf(preview.view.value),
    isSelf,
    globalAllowRemoval: globalAllowRemoval.value,
    alerts: alerts.value,
    onDismissAlert: (index) => {
      alerts.value = alerts.value.filter((_, i) => i !== index)
    },
    confirmDialog: flow.confirmDialog.value,
    reauthDialog: flow.reauthDialog.value,
    discardDialog: discardDialog.value,
    messages,
  }))

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
      settleDiscard(false)
    })
  }

  if (options.immediate !== false) void load()

  return {
    rules,
    loading,
    loadError,
    reload: async () => {
      preview.refresh()
      await load()
    },
    editing,
    form,
    preview: preview.view,
    openCreate,
    openEdit,
    closeEditor,
    save,
    remove,
    submitting: flow.submitting,
    manager,
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useIpAccessRules.render.test.ts`
Expected: PASS

Run: `pnpm --filter @ssworks/admin-ui typecheck && pnpm exec eslint packages/admin-ui/src/composables/useIpAccessRules.ts packages/admin-ui/src/composables/useIpAccessRules.render.test.ts`
Expected: 통과. `_rule` 은 Task 5 에서 쓰인다(루트 `eslint.config.js` 의 `no-unused-vars` 가 `argsIgnorePattern: '^_'`).

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-ui/src/composables/useIpAccessRules.ts packages/admin-ui/src/composables/useIpAccessRules.render.test.ts
git commit -m "feat(admin-ui): useIpAccessRules — 목록 · 편집 패널 · 고친 값 버리기 · 대상 후보 · 미리보기 바인딩" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `useIpAccessRules` — 쓰기(저장 · 삭제 · 관문 · 오류)

**Files:**

- Modify: `packages/admin-ui/src/composables/useIpAccessRules.ts`(import 추가 · 자리 표시 둘 교체)
- Create: `packages/admin-ui/src/composables/useIpAccessRules.write.render.test.ts`

**Interfaces:**

- Consumes: Task 1 `toCreateBody` · `toUpdateBody` · `formScopeTitle` · `ruleScopeTitle` · `IP_RULE_FORM_FIELDS`; Task 2 `gateMessage` · `conflictAlertText` · `removesGlobalAllow`; admin-shared `CommonErrorCodes`; Task 4 내부(`flow` · `preview` · `load` · `findRule` · `setEditor` · `syncTarget` · `rememberTarget` · `knownTargets` · `pushAlert` · `askDiscard` · `working` · `busy` · `removing` · `clientErrors`)
- Produces: `save(): Promise<boolean>` · `remove(rule): Promise<boolean>` — 스펙 I12–I18 순서

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-ui/src/composables/useIpAccessRules.write.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import type { AdminIpPreview, AdminIpPreviewQuery, AdminIpRule } from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import { DEFAULT_IP_ACCESS_MESSAGES as M } from '../components/ip-access/ip-access.js'
import {
  useIpAccessRules,
  type IpAccessRules,
  type UseIpAccessRulesOptions,
} from './useIpAccessRules.js'

// 정본: hangang-home ip-access.render.test.ts 의 저장 · 삭제 흐름(검증이 비밀번호보다 먼저 · 실패해도 재조회 · 저장 전
//       스냅숏)에 킷의 새 갈래(flush 뒤 관문 · revision 충돌 · 409 자기 잠금 · 관문 하나)를 더해 잰다.

const rule = (over: Partial<AdminIpRule> = {}): AdminIpRule => ({
  ruleNo: 12n,
  scopeType: 'team',
  scopeRefNo: 4n,
  scopeName: '상담센터',
  scopeUserId: null,
  cidr: '203.0.113.0/24',
  description: '상담센터 사무실',
  revision: 3,
  createAt: '2026-10-01T00:00:00.000Z',
  updateAt: '2026-10-02T00:00:00.000Z',
  ...over,
})

const GLOBAL_V6 = rule({
  ruleNo: 2n,
  scopeType: 'global',
  scopeRefNo: null,
  scopeName: null,
  cidr: '::/0',
  description: '기본 허용(IPv6)',
  revision: 0,
})
const TEAM = rule()
const RULES = [GLOBAL_V6, TEAM]

const previewResult = (newlyLocked = 0): AdminIpPreview => ({
  clientIp: '203.0.113.7',
  clientPasses: true,
  summary: {
    total: 14,
    newlyLocked,
    alreadyLocked: 0,
    unknown: 0,
    blockedSessions: 0,
    ruleSetChangedOnly: 0,
  },
  items: [],
})

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
})

async function setup(over: Partial<UseIpAccessRulesOptions> = {}) {
  const adapters = {
    list: vi.fn(async (): Promise<readonly AdminIpRule[]> => RULES),
    preview: vi.fn(async (_query: AdminIpPreviewQuery) => previewResult()),
    create: vi.fn(async (): Promise<unknown> => ({})),
    update: vi.fn(async (): Promise<unknown> => ({})),
    remove: vi.fn(async (): Promise<unknown> => ({})),
  }
  const onDone = vi.fn()
  let ip!: IpAccessRules<AdminIpRule>
  wrapper = mount(
    defineComponent({
      setup() {
        ip = useIpAccessRules({ ...adapters, canManage: () => true, onDone, ...over })
        return () => h('div')
      },
    }),
  )
  await flushPromises()
  return { ...adapters, onDone, ip }
}

async function typeCidr(ip: IpAccessRules<AdminIpRule>, cidr: string): Promise<void> {
  ip.manager.value['onUpdate:form']({ ...ip.form.value, cidr })
}

describe('useIpAccessRules — 저장', () => {
  it('🔴 칸 검증이 실패하면 관문을 열지 않는다 — 칸 오류 · 요청 없음', async () => {
    const { create, ip } = await setup()
    await ip.openCreate()
    expect(await ip.save()).toBe(false)
    expect(ip.manager.value.fieldErrors.cidr).toEqual([M.cidrRequired])
    expect(ip.manager.value.confirmDialog.modelValue).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })

  it('🔴 디바운스 중에 눌러도 미리보기를 마친 뒤 관문 — 창 문구가 최종 영향이다', async () => {
    const preview = vi.fn(async (query: AdminIpPreviewQuery) =>
      previewResult(query.op === 'create' ? 2 : 0),
    )
    const { ip } = await setup({ preview })
    await ip.openCreate()
    await typeCidr(ip, '203.0.113.0/24')
    const saving = ip.save()
    await flushPromises()
    expect(preview).toHaveBeenLastCalledWith({
      op: 'create',
      scopeType: 'global',
      cidr: '203.0.113.0/24',
    })
    const dialog = ip.manager.value.confirmDialog
    expect(dialog.modelValue).toBe(true)
    expect(dialog.message).toBe(
      `전체 범위의 「203.0.113.0/24」 규칙을 만듭니다. ${M.gateImpactLocked(2)}`,
    )
    expect(dialog.reversible).toBe(true)
    ip.manager.value.confirmDialog['onUpdate:modelValue'](false)
    expect(await saving).toBe(false)
  })

  it('확인 창(reauth 끔) → 만들기 · 재조회 · 패널 닫음 · onDone', async () => {
    const { create, list, onDone, ip } = await setup()
    await ip.openCreate()
    await typeCidr(ip, ' 203.0.113.0/24 ')
    const saving = ip.save()
    await flushPromises()
    ip.manager.value.confirmDialog.onConfirm()
    expect(await saving).toBe(true)
    expect(create).toHaveBeenCalledWith(
      { scopeType: 'global', scopeRefNo: null, cidr: '203.0.113.0/24', description: null },
      {},
    )
    expect(list).toHaveBeenCalledTimes(2)
    expect(ip.editing.value).toBeNull()
    expect(onDone).toHaveBeenCalledWith({ action: 'create', rule: null })
  })

  it('재인증 창(reauth 켬) — 비밀번호가 ctx 로 간다', async () => {
    const { create, ip } = await setup({ reauth: true })
    await ip.openCreate()
    await typeCidr(ip, '10.0.0.0/8')
    const saving = ip.save()
    await flushPromises()
    expect(ip.manager.value.reauthDialog.modelValue).toBe(true)
    expect(ip.manager.value.reauthDialog.title).toBe(M.createTitle)
    ip.manager.value.reauthDialog.onConfirm('pw')
    expect(await saving).toBe(true)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ cidr: '10.0.0.0/8' }), {
      currentPassword: 'pw',
    })
  })

  it('🔴 수정 본문은 네 칸과 revision', async () => {
    const { update, onDone, ip } = await setup()
    await ip.openEdit(TEAM)
    ip.manager.value['onUpdate:form']({ ...ip.form.value, description: '새 사무실' })
    const saving = ip.save()
    await flushPromises()
    ip.manager.value.confirmDialog.onConfirm()
    expect(await saving).toBe(true)
    expect(update).toHaveBeenCalledWith(
      TEAM,
      {
        scopeType: 'team',
        scopeRefNo: 4n,
        cidr: '203.0.113.0/24',
        description: '새 사무실',
        revision: 3,
      },
      {},
    )
    expect(onDone).toHaveBeenCalledWith({ action: 'update', rule: TEAM })
  })

  it('🔴 409 ERR_COMMON_CONFLICT — 빨간 알림(서버 문구 + 주소) · 처리됨 · 폼 유지 · 재조회', async () => {
    const error = new ApiError('이 변경을 저장하면 지금 접속한 위치에서 로그인할 수 없게 됩니다.', {
      status: 409,
      code: 'ERR_COMMON_CONFLICT',
      details: { clientIp: '203.0.113.7' },
      raw: null,
    })
    const create = vi.fn(async (): Promise<unknown> => {
      throw error
    })
    const { list, ip } = await setup({ create })
    await ip.openCreate()
    await typeCidr(ip, '198.51.100.0/24')
    const saving = ip.save()
    await flushPromises()
    ip.manager.value.confirmDialog.onConfirm()
    expect(await saving).toBe(false)
    expect(error.handled).toBe(true)
    expect(ip.manager.value.alerts).toEqual([
      {
        kind: 'error',
        text: '이 변경을 저장하면 지금 접속한 위치에서 로그인할 수 없게 됩니다. 서버가 본 지금 주소: 203.0.113.7',
      },
    ])
    expect(ip.editing.value).toBe('new')
    expect(ip.form.value.cidr).toBe('198.51.100.0/24')
    expect(list).toHaveBeenCalledTimes(2)
    ip.manager.value.onDismissAlert(0)
    expect(ip.manager.value.alerts).toEqual([])
  })

  it('🔴 revision 충돌 — 폼 유지 · 편집 대상을 새 행으로 · 노란 알림 · 다음 저장은 새 revision', async () => {
    const fresh = rule({ cidr: '203.0.113.0/28', revision: 4 })
    const list = vi
      .fn(async (): Promise<readonly AdminIpRule[]> => RULES)
      .mockResolvedValueOnce(RULES)
      .mockResolvedValue([GLOBAL_V6, fresh])
    const update = vi
      .fn(async (): Promise<unknown> => ({}))
      .mockRejectedValueOnce(
        new ApiError('충돌', { status: 409, code: 'ERR_COMMON_REVISION_CONFLICT', raw: null }),
      )
    const { ip } = await setup({ list, update })
    await ip.openEdit(TEAM)
    ip.manager.value['onUpdate:form']({ ...ip.form.value, description: '내 값' })
    const first = ip.save()
    await flushPromises()
    ip.manager.value.confirmDialog.onConfirm()
    expect(await first).toBe(false)
    expect(ip.editing.value).toBe(fresh)
    expect(ip.form.value.description).toBe('내 값')
    expect(ip.manager.value.alerts).toEqual([
      { kind: 'warning', text: M.revisionConflict('팀 · 상담센터', '203.0.113.0/28') },
    ])
    const second = ip.save()
    await flushPromises()
    ip.manager.value.confirmDialog.onConfirm()
    expect(await second).toBe(true)
    expect(update).toHaveBeenLastCalledWith(
      fresh,
      expect.objectContaining({ revision: 4, description: '내 값' }),
      {},
    )
  })

  it('실패 뒤 새 목록에 그 규칙이 없으면 패널을 닫고 "이미 지워진 규칙"', async () => {
    const list = vi
      .fn(async (): Promise<readonly AdminIpRule[]> => RULES)
      .mockResolvedValueOnce(RULES)
      .mockResolvedValue([GLOBAL_V6])
    const update = vi.fn(async (): Promise<unknown> => {
      throw new ApiError('없음', { status: 404, code: 'ERR_COMMON_NOT_FOUND', raw: null })
    })
    const { ip } = await setup({ list, update })
    await ip.openEdit(TEAM)
    ip.manager.value['onUpdate:form']({ ...ip.form.value, description: 'x' })
    const saving = ip.save()
    await flushPromises()
    ip.manager.value.confirmDialog.onConfirm()
    expect(await saving).toBe(false)
    expect(ip.editing.value).toBeNull()
    expect(ip.manager.value.alerts).toEqual([{ kind: 'warning', text: M.ruleGone }])
  })

  it('미리보기를 못 받은 채 저장에 성공하면 노란 알림 — 「아무도 안 잠깁니다」가 아니다', async () => {
    const preview = vi
      .fn(async (_query: AdminIpPreviewQuery) => previewResult())
      .mockResolvedValueOnce(previewResult())
      .mockRejectedValue(new ApiError('x', { status: 500, raw: null }))
    const { ip } = await setup({ preview })
    await ip.openCreate()
    await typeCidr(ip, '10.0.0.0/8')
    const saving = ip.save()
    await flushPromises()
    expect(ip.manager.value.confirmDialog.message).toContain(M.gateImpactUnknown)
    ip.manager.value.confirmDialog.onConfirm()
    expect(await saving).toBe(true)
    expect(ip.manager.value.alerts).toEqual([{ kind: 'warning', text: M.savedWithoutPreview }])
  })

  it('🔴 만들기에 성공하면 재조회가 실패해도 패널을 닫는다 — 같은 규칙을 또 만들지 않게', async () => {
    const list = vi
      .fn(async (): Promise<readonly AdminIpRule[]> => RULES)
      .mockResolvedValueOnce(RULES)
      .mockRejectedValue(new ApiError('x', { status: 500, raw: null }))
    const { ip } = await setup({ list })
    await ip.openCreate()
    await typeCidr(ip, '10.0.0.0/8')
    const saving = ip.save()
    await flushPromises()
    ip.manager.value.confirmDialog.onConfirm()
    expect(await saving).toBe(true)
    expect(ip.editing.value).toBeNull()
  })

  it('🔴 쓰는 동안에는 다른 규칙을 열지 못한다 — 재조회 뒤처리가 엉뚱한 패널을 닫지 않게(I24)', async () => {
    const { ip } = await setup()
    await ip.openCreate()
    await typeCidr(ip, '10.0.0.0/8')
    const saving = ip.save()
    await flushPromises()
    expect(await ip.openEdit(TEAM)).toBe(false)
    expect(await ip.closeEditor()).toBe(false)
    expect(ip.editing.value).toBe('new')
    ip.manager.value.confirmDialog['onUpdate:modelValue'](false)
    await saving
  })

  it('🔴 두 번 눌러도 한 번만', async () => {
    const { create, ip } = await setup()
    await ip.openCreate()
    await typeCidr(ip, '10.0.0.0/8')
    const first = ip.save()
    const second = ip.save()
    expect(await second).toBe(false)
    await flushPromises()
    ip.manager.value.confirmDialog.onConfirm()
    expect(await first).toBe(true)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('🔴 관리 권한이 도중에 회수되면 저장하지 않는다', async () => {
    let can = true
    const { create, ip } = await setup({ canManage: () => can })
    await ip.openCreate()
    await typeCidr(ip, '10.0.0.0/8')
    can = false
    expect(await ip.save()).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })

  it('🔴 창이 열린 사이 권한이 회수되면 확인해도 보내지 않는다 — 패널은 그대로', async () => {
    let can = true
    const { create, onDone, ip } = await setup({ canManage: () => can })
    await ip.openCreate()
    await typeCidr(ip, '10.0.0.0/8')
    const saving = ip.save()
    await flushPromises()
    can = false
    ip.manager.value.confirmDialog.onConfirm()
    expect(await saving).toBe(false)
    expect(create).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
    expect(ip.editing.value).toBe('new')
  })
})

describe('useIpAccessRules — 삭제', () => {
  it('확인 창(reauth 끔) — 되돌릴 수 없음 · 영향 · 본문 { revision } · 재조회 · onDone', async () => {
    const { remove, list, onDone, ip } = await setup()
    const removing = ip.remove(TEAM)
    await flushPromises()
    const dialog = ip.manager.value.confirmDialog
    expect(dialog.modelValue).toBe(true)
    expect(dialog.reversible).toBe(false)
    expect(dialog.title).toBe(M.removeTitle)
    expect(dialog.message).toBe(
      `팀 · 상담센터 범위의 「203.0.113.0/24」 규칙을 지웁니다. ${M.gateImpactNone}`,
    )
    ip.manager.value.confirmDialog.onConfirm()
    expect(await removing).toBe(true)
    expect(remove).toHaveBeenCalledWith(TEAM, { revision: 3 }, {})
    expect(list).toHaveBeenCalledTimes(2)
    expect(onDone).toHaveBeenCalledWith({ action: 'remove', rule: TEAM })
  })

  it('🔴 재인증 창 하나 — 문구가 "되돌릴 수 없습니다"를 겸한다', async () => {
    const { remove, ip } = await setup({ reauth: true })
    const removing = ip.remove(TEAM)
    await flushPromises()
    expect(ip.manager.value.confirmDialog.modelValue).toBe(false)
    expect(ip.manager.value.reauthDialog.modelValue).toBe(true)
    expect(ip.manager.value.reauthDialog.message).toContain(M.irreversible)
    ip.manager.value.reauthDialog.onConfirm('pw')
    expect(await removing).toBe(true)
    expect(remove).toHaveBeenCalledWith(TEAM, { revision: 3 }, { currentPassword: 'pw' })
  })

  it('🔴 전체 허용 행 삭제는 관문 문구에 경고', async () => {
    const { ip } = await setup()
    const removing = ip.remove(GLOBAL_V6)
    await flushPromises()
    expect(ip.manager.value.globalAllowRemoval).toBe(true)
    expect(ip.manager.value.confirmDialog.message).toContain(M.globalAllowRemoval)
    ip.manager.value.confirmDialog['onUpdate:modelValue'](false)
    await removing
  })

  it('취소하면 요청 없음 · 미리보기는 현행으로', async () => {
    const { remove, ip } = await setup()
    const removing = ip.remove(TEAM)
    await flushPromises()
    expect(ip.manager.value.preview.op).toBe('delete')
    ip.manager.value.confirmDialog['onUpdate:modelValue'](false)
    expect(await removing).toBe(false)
    await flushPromises()
    expect(remove).not.toHaveBeenCalled()
    expect(ip.manager.value.preview.op).toBeNull()
  })

  it('🔴 미리보기 404(이미 지워짐)면 관문을 열지 않고 알림 · 재조회', async () => {
    const preview = vi
      .fn(async (_query: AdminIpPreviewQuery) => previewResult())
      .mockResolvedValueOnce(previewResult())
      .mockRejectedValueOnce(new ApiError('없음', { status: 404, raw: null }))
    const { list, ip } = await setup({ preview })
    expect(await ip.remove(TEAM)).toBe(false)
    await flushPromises()
    expect(ip.manager.value.confirmDialog.modelValue).toBe(false)
    expect(ip.manager.value.alerts).toEqual([{ kind: 'warning', text: M.ruleGone }])
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('편집 중 고친 값이 있으면 삭제 전에 버릴지 묻는다', async () => {
    const { remove, ip } = await setup()
    await ip.openEdit(TEAM)
    ip.manager.value['onUpdate:form']({ ...ip.form.value, description: 'x' })
    const removing = ip.remove(GLOBAL_V6)
    await flushPromises()
    expect(ip.manager.value.discardDialog.modelValue).toBe(true)
    ip.manager.value.discardDialog['onUpdate:modelValue'](false)
    expect(await removing).toBe(false)
    expect(remove).not.toHaveBeenCalled()
    expect(ip.editing.value).toBe(TEAM)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useIpAccessRules.write.render.test.ts`
Expected: FAIL — 자리 표시가 늘 `false` 를 돌려줘 관문이 열리지 않는다.

- [ ] **Step 3: 구현한다**

`useIpAccessRules.ts` 의 import 를 넓힌다:

- admin-shared import 를 값 import 하나와 타입 import 로 가른다 — `import { CommonErrorCodes } from '@ssworks/admin-shared'` 를 더한다(기존 `import type { … } from '@ssworks/admin-shared'` 는 그대로).
- `../components/ip-access/ip-access.js` import 목록에 `IP_RULE_FORM_FIELDS` · `conflictAlertText` · `formScopeTitle` · `gateMessage` · `ruleScopeTitle` · `toCreateBody` · `toUpdateBody` 를 더한다.

자리 표시 블록 — 아래 부분을(두 블록 모두 `useIpAccessRules` 함수 본문 안이라 실제 파일에서는 2칸 들여쓰기다 — 플랜의 코드 블록은 prettier 가 들여쓰기를 걷었다. 붙인 뒤 `pnpm format` 으로 맞춘다)

```ts
// ── 쓰기 — Task 5 가 채운다 ────────────────────────────────────────

async function save(): Promise<boolean> {
  return false
}

async function remove(_rule: R): Promise<boolean> {
  return false
}
```

이것으로 바꾼다:

```ts
// ── 쓰기 ──────────────────────────────────────────────────────────

/**
 * 409 ERR_COMMON_CONFLICT(자기 잠금 · 전권자 잔존) — 서버 문구 그대로 + 주소로 빨간 알림.
 * 🔴 처리됨 표시는 이 catch 의 동기 구간에서 — 지연 전역 onError 보다 먼저다. useWriteFlow 를 고치지 않는다(I17).
 */
function guardConflict(call: () => Promise<unknown>): Promise<unknown> {
  return call().catch((error: unknown) => {
    if (error instanceof ApiError && error.code === CommonErrorCodes.ERR_COMMON_CONFLICT) {
      error.handled = true
      pushAlert('error', conflictAlertText(error, messages))
    }
    throw error
  })
}

function targetTitleOf(value: IpRuleForm): string | null {
  if (value.scopeType === 'global') return null
  return knownTargets.get(`${value.scopeType}:${value.scopeRefNo.trim()}`) ?? null
}

async function save(): Promise<boolean> {
  const target = editing.value
  // ① 🔴 첫 줄 가드 — :disabled 는 마우스만 막는다
  if (target === null || !options.canManage() || busy.value) return false
  const problems = ipRuleFormProblems(form.value, messages)
  if (Object.keys(problems).length > 0) {
    // ② 🔴 비밀번호를 묻기 전에 멈춘다
    clientErrors.value = problems
    return false
  }
  working.value = true
  alerts.value = []
  try {
    const submitted = { ...form.value }
    // ③ 🔴 관문은 미리보기가 끝난 뒤 — 창 문구를 열 때 고정하므로 기다려야 최종 영향이다(I12)
    const snapshot = await preview.flush()
    if (editing.value !== target || !sameIpRuleForm(form.value, submitted)) return false
    if (snapshot.state === 'stale') return false
    const kind = target === 'new' ? 'create' : 'update'
    const cidr = submitted.cidr.trim()
    const message = gateMessage(
      {
        kind,
        scope: formScopeTitle(submitted, targetTitleOf(submitted), messages),
        cidr,
        irreversible: false,
        globalRemoval: target !== 'new' && removesGlobalAllow(target.cidr, cidr),
        view: snapshot,
      },
      messages,
    )
    let attempted = false
    let conflicted = false
    const send = (ctx: IpWriteContext): Promise<unknown> => {
      // 🔴 확인 순간에 다시 본다 — 창이 열린 사이 권한이 회수됐으면 보내지 않는다(스펙 §4-3 · 3e D10).
      //    attempted 가 거짓으로 남아 아래에서 false — 패널 · onDone 을 건드리지 않는다
      if (!options.canManage()) return Promise.resolve(undefined)
      attempted = true
      return guardConflict(() =>
        target === 'new'
          ? options.create(toCreateBody(submitted), ctx)
          : options.update(target, toUpdateBody(submitted, target.revision), ctx),
      )
    }
    const common = {
      title: kind === 'create' ? messages.createTitle : messages.updateTitle,
      message,
      confirmLabel: kind === 'create' ? messages.createConfirm : messages.updateConfirm,
      fields: IP_RULE_FORM_FIELDS,
      onConflict: () => {
        conflicted = true
      },
    }
    // ④ 🔴 관문 없이 나가는 IP 쓰기는 없다 — IP 변경은 사람을 잠근다(I13)
    const ok =
      options.reauth === true
        ? await flow.run({ gate: 'reauth', ...common, action: send })
        : await flow.run({ gate: 'confirm', reversible: true, ...common, action: () => send({}) })
    if (!attempted) return false
    // ⑤ 🔴 요청이 나갔으면 성공이든 실패든 다시 부른다 — 404 는 "목록이 낡았다", 409 는 "상태가 갈렸다"
    const applied = await load()
    if (ok) {
      // ⑦ 🔴 만들기는 재조회가 반영되지 않아도 닫는다 — 채운 폼을 남기면 같은 규칙을 또 만든다(useRoleEditor R8)
      setEditor(null)
      if (snapshot.state !== 'ready') pushAlert('warning', messages.savedWithoutPreview)
      await options.onDone?.({
        action: kind,
        rule: target === 'new' ? null : (findRule(target.ruleNo) ?? target),
      })
      return true
    }
    if (target !== 'new' && applied) {
      const fresh = findRule(target.ruleNo)
      if (fresh == null) {
        setEditor(null)
        pushAlert('warning', messages.ruleGone)
      } else if (conflicted) {
        // 🔴 폼은 둔다 — 편집 대상만 새 행으로(다음 저장은 새 revision · 사용자가 본 뒤 한 번 더 눌러야 덮는다 · I18)
        editing.value = fresh
        rememberTarget(fresh)
        pushAlert('warning', messages.revisionConflict(ruleScopeTitle(fresh, messages), fresh.cidr))
        syncTarget()
      }
    }
    preview.refresh()
    return false
  } finally {
    working.value = false
  }
}

async function remove(rule: R): Promise<boolean> {
  if (!options.canManage() || busy.value) return false
  // 🔴 삭제 미리보기가 편집 미리보기 자리를 쓴다 — 고친 값이 있으면 먼저 묻는다(I15)
  if (!(await askDiscard())) return false
  if (!options.canManage() || busy.value) return false
  working.value = true
  alerts.value = []
  try {
    if (editing.value !== null) setEditor(null)
    removing.value = rule
    syncTarget()
    const snapshot = await preview.flush()
    if (removing.value !== rule) return false
    if (snapshot.state === 'stale') {
      pushAlert('warning', messages.ruleGone)
      return false
    }
    const reauth = options.reauth === true
    const message = gateMessage(
      {
        kind: 'remove',
        scope: ruleScopeTitle(rule, messages),
        cidr: rule.cidr,
        irreversible: reauth,
        globalRemoval: removesGlobalAllow(rule.cidr, null),
        view: snapshot,
      },
      messages,
    )
    let attempted = false
    let conflicted = false
    const send = (ctx: IpWriteContext): Promise<unknown> => {
      // 🔴 확인 순간에 다시 본다(저장과 같음)
      if (!options.canManage()) return Promise.resolve(undefined)
      attempted = true
      return guardConflict(() => options.remove(rule, { revision: rule.revision }, ctx))
    }
    const common = {
      title: messages.removeTitle,
      message,
      confirmLabel: messages.removeConfirm,
      onConflict: () => {
        conflicted = true
      },
    }
    // 🔴 재인증이면 그 창 하나가 확인을 겸한다 — 문구에 "되돌릴 수 없습니다"(I13 · useRoleEditor 481)
    const ok = reauth
      ? await flow.run({ gate: 'reauth', ...common, action: send })
      : await flow.run({ gate: 'confirm', reversible: false, ...common, action: () => send({}) })
    if (!attempted) return false
    const applied = await load()
    if (ok) {
      await options.onDone?.({ action: 'remove', rule })
      return true
    }
    if (conflicted && applied) {
      const fresh = findRule(rule.ruleNo)
      pushAlert(
        'warning',
        fresh == null
          ? messages.ruleGone
          : messages.revisionConflict(ruleScopeTitle(fresh, messages), fresh.cidr),
      )
    }
    return false
  } finally {
    // 취소 · 실패 · 성공 어느 쪽이든 미리보기는 현행으로 돌아간다
    removing.value = null
    syncTarget()
    working.value = false
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useIpAccessRules.write.render.test.ts src/composables/useIpAccessRules.render.test.ts`
Expected: PASS

Run: `pnpm --filter @ssworks/admin-ui typecheck && pnpm exec eslint packages/admin-ui/src/composables/useIpAccessRules.ts packages/admin-ui/src/composables/useIpAccessRules.write.render.test.ts`
Expected: 통과. `flow.run` 의 판별 유니언에 `...common` 이 타입 오류를 내면 `useRoleEditor.ts` 의 `write()` 처럼 갈래마다 객체를 펼쳐 쓴다(동작 같음).

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-ui/src/composables/useIpAccessRules.ts packages/admin-ui/src/composables/useIpAccessRules.write.render.test.ts
git commit -m "feat(admin-ui): IP 규칙 쓰기 — 미리보기 뒤 관문 · 재인증/확인 · revision 충돌 · 409 자기 잠금 · 실패해도 재조회" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 공용 서버 검색 칸 `RemoteSearchField` 추출

**Files:**

- Create: `packages/admin-ui/src/components/common/RemoteSearchField.vue`
- Create: `packages/admin-ui/src/components/common/remote-search-field.render.test.ts`
- Modify: `packages/admin-ui/src/components/audit/AuditLogFilterBar.vue`(행위자 칸을 이 부품으로)

**Interfaces:**

- Consumes: Vuetify `VAutocomplete`
- Produces: `RemoteSearchField`(내부 — index 에서 내보내지 않는다). props: `modelValue: string`(`''` = 없음) · `items: readonly { value: string; title: string }[]` · `label: string` · `name: string` · `searching: boolean` · `failed: boolean` · `hintText: string` · `emptyText: string` · `failedText: string` · `placeholder?: string` · `errorMessages?: readonly string[]` · `hideDetails?: boolean`(기본 false) · `disabled?: boolean`(기본 false). emits: `update:modelValue [value: string]` · `search [keyword: string]`. 루트가 `VAutocomplete` 라 `class` 는 그대로 떨어진다.

이 Task 는 3f 의 행위자 칸 로직(고른 항목 글자로 재검색 막기 · 선택 중 안내 줄)을 그대로 옮긴다. 3g 의 사용자 대상 칸이 같은 규칙(C8)을 쓰기 때문이다 — 로직 블록을 두 곳에 복사하지 않는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-ui/src/components/common/remote-search-field.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref, type Component } from 'vue'
import { VAutocomplete } from 'vuetify/components'
import { installVisualViewport, vuetify } from '../../test/setup.js'
import RemoteSearchField from './RemoteSearchField.vue'

// 정본: 3f 최종 리뷰 반영(audit-log-viewer.render.test.ts F1 · F2) — 실제 Vuetify 선택 경로로 잰다.

installVisualViewport()

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

const TEXTS = {
  hintText: '이름을 입력하세요.',
  emptyText: '맞는 사람이 없습니다.',
  failedText: '검색하지 못했습니다.',
}

function mountField(
  initial: { value?: string; items?: { value: string; title: string }[]; failed?: boolean } = {},
) {
  const value = ref(initial.value ?? '')
  const items = ref(initial.items ?? [])
  const failed = ref(initial.failed ?? false)
  const searches: string[] = []
  wrapper = mount(
    defineComponent({
      setup() {
        return () =>
          h(RemoteSearchField as Component, {
            modelValue: value.value,
            items: items.value,
            label: '대상 사용자',
            name: 'scopeRefNo',
            searching: false,
            failed: failed.value,
            ...TEXTS,
            'onUpdate:modelValue': (next: string) => {
              value.value = next
            },
            onSearch: (keyword: string) => {
              searches.push(keyword)
            },
          })
      },
    }),
    { attachTo: document.body, global: { plugins: [vuetify] } },
  )
  return { value, items, failed, searches }
}

const overlayText = () =>
  Array.from(document.querySelectorAll('.v-overlay--active'))
    .map((e) => e.textContent)
    .join('|')

/** 3f audit-log-viewer.render.test.ts `typeActor` 와 같은 손놀림 — 칸을 눌러 메뉴를 열고 친다 */
async function type(keyword: string): Promise<void> {
  const input = wrapper!.find('input:not([type="hidden"])')
  await input.trigger('focusin')
  await wrapper!.find('.v-field').trigger('mousedown')
  await input.setValue(keyword)
  await flushPromises()
}

describe('RemoteSearchField', () => {
  it('🔴 항목을 고르면 그 글자로 다시 검색하지 않는다 — 실제 선택 경로', async () => {
    const state = mountField({ items: [{ value: '12', title: '김운영 (ops01)' }] })
    await type('김')
    expect(state.searches).toEqual(['김'])
    const item = Array.from(
      document.querySelectorAll<HTMLElement>('.v-overlay--active .v-list-item'),
    ).find((e) => e.textContent?.includes('김운영 (ops01)'))
    expect(item, '가드 — 메뉴에 항목이 보인다').toBeDefined()
    item!.click()
    await flushPromises()
    expect(state.value.value).toBe('12')
    expect(state.searches).toEqual(['김'])
  })

  it('비우면 빈 문자열을 올린다', async () => {
    const state = mountField({ value: '12', items: [{ value: '12', title: '김운영 (ops01)' }] })
    wrapper!.findComponent(VAutocomplete).vm.$emit('update:modelValue', null)
    expect(state.value.value).toBe('')
  })

  it('🔴 고른 사람만 남은 목록에서 "결과 없음" · "검색 실패"를 메뉴 맨 위 줄로', async () => {
    const state = mountField({ value: '12', items: [{ value: '12', title: '김운영 (ops01)' }] })
    await type('박')
    expect(overlayText()).toContain(TEXTS.emptyText)
    expect(overlayText()).toContain('김운영 (ops01)')
    state.failed.value = true
    await flushPromises()
    expect(overlayText()).toContain(TEXTS.failedText)
  })

  it('목록이 비면 no-data — 검색어가 없으면 안내 글자', async () => {
    mountField()
    const field = wrapper!.findComponent(VAutocomplete)
    expect(field.props('noDataText')).toBe(TEXTS.hintText)
    expect(field.props('noFilter')).toBe(true)
  })

  it('오류 문구 · hide-details · disabled 를 넘긴다', async () => {
    wrapper = mount(RemoteSearchField as Component, {
      props: {
        modelValue: '',
        items: [],
        label: 'x',
        name: 'x',
        searching: false,
        failed: false,
        ...TEXTS,
        errorMessages: ['고르세요'],
        hideDetails: true,
        disabled: true,
      },
      attachTo: document.body,
      global: { plugins: [vuetify] },
    })
    const field = wrapper.findComponent(VAutocomplete)
    expect(field.props('errorMessages')).toEqual(['고르세요'])
    expect(field.props('hideDetails')).toBe(true)
    expect(field.props('disabled')).toBe(true)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/common/remote-search-field.render.test.ts`
Expected: FAIL — `./RemoteSearchField.vue` 를 찾지 못함.

- [ ] **Step 3: 부품을 만든다**

`packages/admin-ui/src/components/common/RemoteSearchField.vue`:

```vue
<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { VAutocomplete } from 'vuetify/components'

  // 서버 검색 자동완성 칸(내부 부품) — 감사 행위자(3f) · IP 대상 사용자(3g)가 같은 규칙을 쓴다(3f · 3g 스펙 C8).
  // 검색 자체(디바운스 · 순번)는 `useRemoteSearch` 가 하고, 이 칸은 무엇을 검색어로 알릴지와 메뉴 안내를 맡는다.
  //
  // 정본: 3f `AuditLogFilterBar.vue` 의 행위자 칸(최종 리뷰 F1 · F2 반영본)
  // 바꾼 점: 문구 · 이름 · 오류 · hide-details · disabled 를 props 로 — 두 화면이 한 부품을 쓴다.

  const props = withDefaults(
    defineProps<{
      /** '' = 없음 */
      modelValue: string
      items: readonly { value: string; title: string }[]
      label: string
      name: string
      searching: boolean
      failed: boolean
      /** 검색어가 없을 때 메뉴 글자 */
      hintText: string
      emptyText: string
      failedText: string
      placeholder?: string
      errorMessages?: readonly string[]
      hideDetails?: boolean
      disabled?: boolean
    }>(),
    { placeholder: undefined, errorMessages: () => [], hideDetails: false, disabled: false },
  )

  const emit = defineEmits<{
    'update:modelValue': [value: string]
    search: [keyword: string]
  }>()

  const itemList = computed(() => [...props.items])
  const errors = computed(() => [...props.errorMessages])
  const searchText = ref('')
  const selectedTitle = computed(
    () => props.items.find((item) => item.value === props.modelValue)?.title ?? null,
  )

  /**
   * 🔴 항목을 고르면 VAutocomplete 가 모델을 바꾼 바로 뒤에 검색어를 그 항목 글자로 바꾸며 update:search 를 낸다.
   *   그때는 부모가 아직 다시 그리기 전이라 modelValue 가 옛 값이다 — selectedTitle 만으로는 못 막는다.
   *   그래서 고른 항목의 글자를 모델 변경 때 먼저 적어 둔다(update:modelValue 가 update:search 보다 앞선다).
   *   놓치면 고를 때마다 그 글자로 검색 요청이 한 번 더 나가고(64자 넘으면 400) 후보가 그 사람 하나로 접힌다.
   */
  let pickedTitle: string | null = null

  function onModel(value: unknown): void {
    pickedTitle =
      typeof value === 'string'
        ? (props.items.find((item) => item.value === value)?.title ?? null)
        : null
    emit('update:modelValue', typeof value === 'string' ? value : '')
  }

  function onSearch(value: string | null): void {
    const keyword = value ?? ''
    if (keyword === pickedTitle || keyword === selectedTitle.value) {
      // 고른 항목 글자는 사람이 친 검색어가 아니다 — 안내 줄이 그 글자를 검색어로 알지 않게 비운다
      searchText.value = ''
      return
    }
    searchText.value = keyword
    emit('search', keyword)
  }

  const noDataText = computed(() => {
    if (props.failed) return props.failedText
    return searchText.value.trim() === '' ? props.hintText : props.emptyText
  })

  /**
   * 🔴 고른 사람이 목록에 늘 붙어 있어 items 가 비지 않는다 — Vuetify 는 no-data 를 items 가 빌 때만 그린다.
   *   그 상태에서 "결과 없음" · "검색 실패"가 사라지면 조용한 실패가 된다(A8 · C7). 그래서 메뉴 맨 위 줄로 따로 그린다.
   *   items 가 비면 no-data-text 가 이미 같은 글자를 그리므로 겹쳐 그리지 않는다.
   */
  const statusLine = computed<string | null>(() => {
    if (itemList.value.length === 0) return null
    if (props.failed) return props.failedText
    if (props.searching || searchText.value.trim() === '') return null
    const others = props.items.some((item) => item.value !== props.modelValue)
    return others ? null : props.emptyText
  })
</script>

<template>
  <VAutocomplete
    autocomplete="off"
    clearable
    density="compact"
    :disabled="disabled"
    :error-messages="errors"
    :hide-details="hideDetails"
    item-title="title"
    item-value="value"
    :items="itemList"
    :label="label"
    :loading="searching"
    :model-value="modelValue === '' ? null : modelValue"
    :name="name"
    no-filter
    :no-data-text="noDataText"
    :placeholder="placeholder"
    variant="outlined"
    @update:model-value="onModel"
    @update:search="onSearch"
  >
    <template v-if="statusLine" #prepend-item>
      <div class="remote-search-field__status text-body-2 text-medium-emphasis" role="status">
        {{ statusLine }}
      </div>
    </template>
  </VAutocomplete>
</template>

<style scoped>
  .remote-search-field__status {
    padding: 8px 16px;
  }
</style>
```

- [ ] **Step 4: 3f 필터 카드가 이 부품을 쓰게 한다**

`packages/admin-ui/src/components/audit/AuditLogFilterBar.vue`:

- import 줄에서 `VAutocomplete` 는 그대로 둔다(동작 칸이 쓴다). `computed, ref` 중 `ref` 를 지우고 `import RemoteSearchField from '../common/RemoteSearchField.vue'` 를 더한다.
- `<script setup>` 에서 이 이름들과 그 주석을 지운다: `actorItemList` · `actorSearchText` · `selectedActorTitle` · `pickedTitle` · `onActorModel` · `onActorSearch` · `actorNoData` · `actorStatusLine`.
- 머리 주석 "바꾼 점" 끝에 한 줄을 더한다: `//   행위자 칸은 공용 \`RemoteSearchField\`(3g 와 함께 씀 — 고른 항목 글자로 재검색 막기 · 선택 중 안내 줄).`
- 템플릿의 행위자 `VAutocomplete`(`v-if="actorMode === 'search'"` 부터 닫는 `</VAutocomplete>` 까지, 안의 `#prepend-item` 포함)를 이것으로 바꾼다:

```vue
<RemoteSearchField
  v-if="actorMode === 'search'"
  class="audit-log-filter__actor"
  :empty-text="messages.actorSearchEmpty"
  :failed="actorSearchFailed"
  :failed-text="messages.actorSearchFailed"
  hide-details
  :hint-text="messages.actorSearchHint"
  :items="actorItems"
  :label="messages.actorLabel"
  :model-value="draft.actorUserNo"
  name="actorUserNo"
  :placeholder="messages.allPlaceholder"
  :searching="actorSearching"
  @search="emit('searchActors', $event)"
  @update:model-value="patch('actorUserNo', $event)"
/>
```

- `<style scoped>` 에서 `.audit-log-filter__actor-status` 규칙을 지운다.

- [ ] **Step 5: 통과를 확인한다 — 3f 테스트도 그대로 초록이어야 한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/common/remote-search-field.render.test.ts src/components/audit/audit-log-viewer.render.test.ts`
Expected: PASS — 3f 의 F1(실제 선택 경로) · F2(선택 중 안내 줄) 테스트가 바뀌지 않은 채 통과한다.

Run: `pnpm --filter @ssworks/admin-ui typecheck && pnpm exec eslint packages/admin-ui/src/components/common/RemoteSearchField.vue packages/admin-ui/src/components/common/remote-search-field.render.test.ts packages/admin-ui/src/components/audit/AuditLogFilterBar.vue`
Expected: 통과

- [ ] **Step 6: 커밋한다**

```bash
git add packages/admin-ui/src/components/common/RemoteSearchField.vue packages/admin-ui/src/components/common/remote-search-field.render.test.ts packages/admin-ui/src/components/audit/AuditLogFilterBar.vue
git commit -m "refactor(admin-ui): 서버 검색 자동완성 칸을 RemoteSearchField 로 — 감사 행위자 · IP 대상이 함께 쓴다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 접속 상태 카드 · 규칙 표

**Files:**

- Create: `packages/admin-ui/src/components/ip-access/IpPreviewCard.vue`
- Create: `packages/admin-ui/src/components/ip-access/IpRuleTable.vue`
- Create: `packages/admin-ui/src/components/ip-access/ip-access-parts.render.test.ts`

**Interfaces:**

- Consumes: Task 1 · 2 함수; `DataTableBody` · `EmptyState`
- Produces:
  - `IpPreviewCard` — props: `preview: IpPreviewView` · `lockedItems` · `changedItems` · `isSelf: (item) => boolean` · `globalAllowRemoval: boolean` · `messages`
  - `IpRuleTable`(제네릭 `R extends AdminIpRule`) — props: `rules: readonly R[]` · `loading` · `loadFailed` · `canManage` · `editing: R | 'new' | null` · `busy` · `messages`; emits: `create` · `edit [R]` · `remove [R]` · `retry`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-ui/src/components/ip-access/ip-access-parts.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'
import type { AdminIpPreview, AdminIpPreviewItem, AdminIpRule } from '@ssworks/admin-shared'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import IpPreviewCard from './IpPreviewCard.vue'
import IpRuleTable from './IpRuleTable.vue'
import { DEFAULT_IP_ACCESS_MESSAGES as M, type IpPreviewView } from './ip-access.js'

// 정본: hangang-home ip-access.render.test.ts §7-1 ①②③(현재 IP 상시 · 통과 여부 · 잠기는 사람) · 목록 셀 · 대상 없음.

installVisualViewport()

const rule = (over: Partial<AdminIpRule> = {}): AdminIpRule => ({
  ruleNo: 12n,
  scopeType: 'team',
  scopeRefNo: 4n,
  scopeName: '상담센터',
  scopeUserId: null,
  cidr: '203.0.113.0/24',
  description: '상담센터 사무실',
  revision: 3,
  createAt: '2026-10-01T00:00:00.000Z',
  updateAt: '2026-10-02T00:00:00.000Z',
  ...over,
})

const RULES = [
  rule({
    ruleNo: 1n,
    scopeType: 'global',
    scopeRefNo: null,
    scopeName: null,
    cidr: '0.0.0.0/0',
    description: '기본 허용(IPv4)',
  }),
  rule(),
  rule({ ruleNo: 9n, scopeRefNo: 9n, scopeName: null, cidr: '192.0.2.0/24', description: null }),
  rule({
    ruleNo: 20n,
    scopeType: 'user',
    scopeRefNo: 3n,
    scopeName: '김운영',
    scopeUserId: 'ops01',
    cidr: '203.0.113.7/32',
  }),
]

const previewItem = (over: Partial<AdminIpPreviewItem> = {}): AdminIpPreviewItem => ({
  userNo: 7n,
  userId: 'cs07',
  userName: '이상담',
  layerBefore: 'global',
  layerAfter: 'team',
  statusBefore: 'passes',
  statusAfter: 'locked',
  becomesLocked: true,
  ruleSetChanged: true,
  activeSessionCount: 2,
  blockedSessionCount: 2,
  unknownIpSessionCount: 0,
  ...over,
})

const result = (over: Partial<AdminIpPreview> = {}): AdminIpPreview => ({
  clientIp: '203.0.113.7',
  clientPasses: true,
  summary: {
    total: 14,
    newlyLocked: 1,
    alreadyLocked: 0,
    unknown: 0,
    blockedSessions: 2,
    ruleSetChangedOnly: 1,
  },
  items: [],
  ...over,
})

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

const text = () => document.body.textContent ?? ''

function mountCard(over: Record<string, unknown> = {}) {
  const view: IpPreviewView = {
    state: 'ready',
    op: 'update',
    result: result(),
    clientIp: '203.0.113.7',
  }
  wrapper = mount(IpPreviewCard as Component, {
    props: {
      preview: view,
      lockedItems: [previewItem()],
      changedItems: [
        previewItem({
          userNo: 8n,
          userId: 'cs03',
          userName: '정재택',
          becomesLocked: false,
          statusAfter: 'unknown',
        }),
      ],
      isSelf: (item: AdminIpPreviewItem) => item.userId === 'cs07',
      globalAllowRemoval: false,
      messages: M,
      ...over,
    },
    attachTo: document.body,
    global: { plugins: [vuetify] },
  })
}

describe('IpPreviewCard', () => {
  it('🔴 ① 현재 IP · ② 통과 · 기준 · ③ 요약 · 두 목록 · 본인 · 상시 문단', () => {
    mountCard()
    for (const part of [
      M.cardTitle,
      '현재 접속 IP: 203.0.113.7',
      '이 변경 뒤에도 지금 접속(203.0.113.7)은 통과합니다.',
      M.basisUpdate,
      '🔴 이 변경으로 1명이 새로 잠깁니다.',
      '🔴 이상담(cs07 · 본인) — 전체 층 → 팀 층',
      '정재택(cs03) — 전체 층 → 팀 층 · 적용되는 규칙이 달라집니다',
      M.hintLayerShadow,
      M.hintServerDefence,
      M.hintSessionsStay,
      M.hintRecovery,
    ]) {
      expect(text()).toContain(part)
    }
    expect(text()).not.toContain(M.globalAllowRemoval)
  })

  it('🔴 미리보기가 없으면 통과 여부를 말하지 않고, 현재 IP 는 모른다고 적는다', () => {
    mountCard({
      preview: { state: 'failed', op: 'create', result: null, clientIp: null },
      lockedItems: [],
      changedItems: [],
    })
    expect(text()).toContain(M.currentIpUnknown)
    expect(text()).not.toContain('통과합니다')
    expect(text()).toContain(M.previewFailed)
    expect(text()).toContain(M.basisCreate)
  })

  it('전체 허용 제거 경고', () => {
    mountCard({ globalAllowRemoval: true })
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(M.globalAllowRemoval)
  })
})

function mountTable(over: Record<string, unknown> = {}) {
  const listeners = { onCreate: vi.fn(), onEdit: vi.fn(), onRemove: vi.fn(), onRetry: vi.fn() }
  wrapper = mount(IpRuleTable as Component, {
    props: {
      rules: RULES,
      loading: false,
      loadFailed: false,
      canManage: true,
      editing: null,
      busy: false,
      messages: M,
      ...listeners,
      ...over,
    },
    attachTo: document.body,
    global: { plugins: [vuetify] },
  })
  return listeners
}

const rows = () => [...document.querySelectorAll('.ip-rule-table tbody tr')] as HTMLElement[]

describe('IpRuleTable', () => {
  it('범위 셀 — 전체 · 팀 이름 + 번호 · 🔴 대상 없음 · 사용자 이름(아이디)', () => {
    mountTable()
    expect(rows()[0]!.textContent).toContain('전체')
    expect(rows()[1]!.textContent).toContain('팀 · 상담센터')
    expect(rows()[1]!.textContent).toContain('#4')
    expect(rows()[2]!.textContent).toContain('팀 #9')
    expect(rows()[2]!.textContent).toContain(M.deadTarget)
    expect(rows()[2]!.textContent).toContain('—')
    expect(rows()[3]!.textContent).toContain('사용자 · 김운영 (ops01)')
  })

  it('머리 — 제목 · 정렬 고정 · 쪽 넘김 없음', () => {
    mountTable()
    expect(text()).toContain(M.listTitle)
    expect(text()).toContain(M.sortLabel)
    expect(document.querySelector('.v-data-table-footer')).toBeNull()
  })

  it('작업 — 규칙을 가리키는 접근 이름 · 이벤트 · 편집 중 표시', async () => {
    const listeners = mountTable({ editing: RULES[1] })
    const edit = document.querySelector<HTMLButtonElement>(
      'button[aria-label="팀 · 상담센터 203.0.113.0/24 규칙 수정"]',
    )
    expect(edit?.textContent?.trim()).toBe(M.edit)
    edit!.click()
    expect(listeners.onEdit).toHaveBeenCalledWith(RULES[1])
    document
      .querySelector<HTMLButtonElement>('button[aria-label="전체 0.0.0.0/0 규칙 삭제"]')!
      .click()
    expect(listeners.onRemove).toHaveBeenCalledWith(RULES[0])
    expect(rows()[1]!.textContent).toContain(M.editing)
    expect(rows()[0]!.textContent).not.toContain(M.editing)
    buttonByText(M.createButton)!.click()
    expect(listeners.onCreate).toHaveBeenCalled()
    await flushPromises()
  })

  it('🔴 관리 권한이 없으면 작업 열과 [새 규칙]이 없다', () => {
    mountTable({ canManage: false })
    expect(buttonByText(M.createButton)).toBeUndefined()
    expect(buttonByText(M.edit)).toBeUndefined()
    expect(buttonByText(M.remove)).toBeUndefined()
  })

  it('쓰기 중이면 버튼이 꺼진다', () => {
    mountTable({ busy: true })
    expect(buttonByText(M.createButton)!.disabled).toBe(true)
    expect(buttonByText(M.edit)!.disabled).toBe(true)
  })

  it('빈 목록 — 모든 접속이 거부된다는 안내 · [새 규칙]', () => {
    const listeners = mountTable({ rules: [] })
    expect(text()).toContain(M.emptyTitle)
    const buttons = [...document.querySelectorAll('button')].filter(
      (b) => b.textContent?.trim() === M.createButton,
    )
    buttons[buttons.length - 1]!.click()
    expect(listeners.onCreate).toHaveBeenCalled()
  })

  it('조회 실패 — 알림과 [다시 시도], 빈 상태 문구는 없다', () => {
    const listeners = mountTable({ rules: [], loadFailed: true })
    expect(text()).toContain(M.loadFailed)
    expect(text()).not.toContain(M.emptyTitle)
    buttonByText(M.retry)!.click()
    expect(listeners.onRetry).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/ip-access/ip-access-parts.render.test.ts`
Expected: FAIL — `./IpPreviewCard.vue` 를 찾지 못함.

- [ ] **Step 3: 두 부품을 만든다**

`packages/admin-ui/src/components/ip-access/IpPreviewCard.vue`:

```vue
<script setup lang="ts">
  import { computed } from 'vue'
  import type { AdminIpPreviewItem } from '@ssworks/admin-shared'
  import {
    basisLine,
    changedItemLine,
    currentIpLine,
    impactLine,
    lockedItemLine,
    passLine,
    type IpAccessMessages,
    type IpPreviewView,
  } from './ip-access.js'

  // 접속 상태와 변경 영향 카드(내부 부품) — 편집 중이 아닐 때도 늘 선다(I1 · I2–I8).
  //
  // 정본: hangang-home apps/admin/src/pages/settings/ip-access.vue "접속 상태와 변경 영향" 카드
  // 바꾼 점: 문장은 `ip-access.ts` 순수 함수 하나에서 — 이 부품은 그리기만 한다. 세션 끊기 문단이 없다(⑥ S2).
  //
  // 🔴 ① 현재 IP · ② 통과 여부 · ③ 잠기는 사람은 화면 몫이다 — 서버는 요청자 본인만 막는다(hangang §7-1).
  // 🔴 색이 아니라 글자로 — happy-dom 은 색을 못 재고, 색각 이상에도 안 보인다(C3).

  const props = defineProps<{
    preview: IpPreviewView
    lockedItems: readonly AdminIpPreviewItem[]
    changedItems: readonly AdminIpPreviewItem[]
    isSelf: (item: AdminIpPreviewItem) => boolean
    globalAllowRemoval: boolean
    messages: IpAccessMessages
  }>()

  const pass = computed(() => passLine(props.preview, props.messages))
  const blocked = computed(() => props.preview.result != null && !props.preview.result.clientPasses)
</script>

<template>
  <section :aria-label="messages.cardTitle" class="ip-preview-card">
    <div class="ip-preview-card__title">{{ messages.cardTitle }}</div>
    <p class="ip-preview-card__ip">{{ currentIpLine(preview.clientIp, messages) }}</p>
    <p v-if="pass" :class="{ 'ip-preview-card__danger': blocked }">{{ pass }}</p>
    <p class="text-medium-emphasis">{{ basisLine(preview.op, messages) }}</p>
    <p role="status">{{ impactLine(preview, messages) }}</p>
    <ul v-if="lockedItems.length > 0" class="ip-preview-card__people">
      <li v-for="item in lockedItems" :key="String(item.userNo)">
        {{ lockedItemLine(item, isSelf(item), messages) }}
      </li>
    </ul>
    <ul v-if="changedItems.length > 0" class="ip-preview-card__people">
      <li v-for="item in changedItems" :key="String(item.userNo)">
        {{ changedItemLine(item, isSelf(item), messages) }}
      </li>
    </ul>
    <p v-if="globalAllowRemoval" class="ip-preview-card__danger" role="alert">
      {{ messages.globalAllowRemoval }}
    </p>
    <div class="ip-preview-card__hints text-body-2 text-medium-emphasis">
      <p>{{ messages.hintLayerShadow }}</p>
      <p>{{ messages.hintServerDefence }}</p>
      <p>{{ messages.hintSessionsStay }}</p>
      <p>{{ messages.hintRecovery }}</p>
    </div>
  </section>
</template>

<style scoped>
  .ip-preview-card {
    display: grid;
    gap: 6px;
    padding: 12px 16px;
    border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
    border-radius: 8px;
  }
  .ip-preview-card p {
    margin: 0;
  }
  .ip-preview-card__title {
    font-weight: 600;
  }
  .ip-preview-card__ip {
    font-weight: 600;
  }
  .ip-preview-card__danger {
    color: rgb(var(--v-theme-error));
    font-weight: 600;
  }
  .ip-preview-card__people {
    margin: 0;
    padding-left: 1.2em;
    display: grid;
    gap: 2px;
    font-size: 0.875rem;
  }
  .ip-preview-card__hints {
    display: grid;
    gap: 4px;
    padding-top: 6px;
    border-top: thin dashed rgba(var(--v-border-color), var(--v-border-opacity));
  }
</style>
```

`packages/admin-ui/src/components/ip-access/IpRuleTable.vue`:

```vue
<script setup lang="ts" generic="R extends AdminIpRule">
  import { computed } from 'vue'
  import { VAlert, VBtn, VChip } from 'vuetify/components'
  import type { AdminIpRule } from '@ssworks/admin-shared'
  import EmptyState from '../common/EmptyState.vue'
  import DataTableBody from '../table/DataTableBody.vue'
  import type { AdminTableHeader } from '../table/data-table.js'
  import { ruleScopeSub, ruleScopeTitle, type IpAccessMessages } from './ip-access.js'

  // IP 규칙 목록(내부 부품) — 서버가 준 전량 한 표(I22).
  //
  // 정본: hangang-home apps/admin/src/pages/settings/ip-access.vue 규칙 표
  // 바꾼 점: 화면 slice 페이징을 걷었다(서버 전량 · 쪽 넘김 숨김). 범위 셀에 대상 이름 · 번호(대상 후보 — ④ T1),
  //   "편집 중" 표시, 관리 권한이 없으면 작업 열 자체가 없다.
  //
  // 🔴 대상이 지워진 규칙은 이름을 지어내지 않는다 — "팀 #9 — 대상 없음(아무에게도 걸리지 않음)"(hangang).
  // 🔴 머리 정렬을 모두 막는다 — 서버가 범위 → 번호로 고정한다. 화살표만 움직이면 거짓 신호다.
  // 🔴 수정 · 삭제 버튼의 접근 이름이 규칙을 가리킨다 — 같은 글자 버튼이 줄마다 있다.

  const props = defineProps<{
    rules: readonly R[]
    loading: boolean
    loadFailed: boolean
    canManage: boolean
    editing: R | 'new' | null
    busy: boolean
    messages: IpAccessMessages
  }>()

  const emit = defineEmits<{
    create: []
    edit: [rule: R]
    remove: [rule: R]
    retry: []
  }>()

  const headers = computed<AdminTableHeader[]>(() => [
    { title: props.messages.columnScope, key: 'scope', sortable: false },
    { title: props.messages.columnCidr, key: 'cidr', sortable: false, nowrap: true },
    { title: props.messages.columnDescription, key: 'description', sortable: false },
    ...(props.canManage
      ? [{ title: '', key: 'actions', sortable: false, align: 'end' as const }]
      : []),
  ])

  /** 슬롯 props 의 타입이 넓다 — 행 타입을 되찾는다 */
  const row = (item: unknown) => item as R
  const ruleLabel = (rule: R) => `${ruleScopeTitle(rule, props.messages)} ${rule.cidr}`
  const isEditing = (rule: R) =>
    props.editing !== null && props.editing !== 'new' && props.editing.ruleNo === rule.ruleNo
</script>

<template>
  <div class="ip-rule-table-wrap">
    <div class="ip-rule-table__head">
      <span class="text-subtitle-1 font-weight-medium">{{ messages.listTitle }}</span>
      <VBtn
        v-if="canManage"
        color="primary"
        :disabled="busy"
        variant="flat"
        @click="emit('create')"
      >
        {{ messages.createButton }}
      </VBtn>
    </div>
    <span class="text-body-2 text-medium-emphasis">{{ messages.sortLabel }}</span>
    <VAlert v-if="loadFailed" density="compact" type="error" variant="tonal">
      <div class="ip-rule-table__alert">
        <span>{{ messages.loadFailed }}</span>
        <VBtn size="small" variant="text" @click="emit('retry')">{{ messages.retry }}</VBtn>
      </div>
    </VAlert>
    <DataTableBody
      class="ip-rule-table"
      :headers="headers"
      hide-default-footer
      :items="rules"
      :items-length="rules.length"
      :loading="loading"
    >
      <template #item.scope="{ item }">
        <div class="ip-rule-table__scope">
          <span>{{ ruleScopeTitle(row(item), messages) }}</span>
          <VChip v-if="isEditing(row(item))" color="primary" size="x-small" variant="tonal">
            {{ messages.editing }}
          </VChip>
        </div>
        <div v-if="ruleScopeSub(row(item), messages)" class="ip-rule-table__sub">
          {{ ruleScopeSub(row(item), messages) }}
        </div>
      </template>
      <template #item.cidr="{ item }">
        <span class="ip-rule-table__cidr">{{ row(item).cidr }}</span>
      </template>
      <template #item.description="{ item }">{{ row(item).description ?? '—' }}</template>
      <template #item.actions="{ item }">
        <div class="ip-rule-table__actions">
          <VBtn
            :aria-label="messages.editLabel(ruleLabel(row(item)))"
            :disabled="busy"
            size="small"
            variant="text"
            @click="emit('edit', row(item))"
          >
            {{ messages.edit }}
          </VBtn>
          <VBtn
            :aria-label="messages.removeLabel(ruleLabel(row(item)))"
            color="error"
            :disabled="busy"
            size="small"
            variant="text"
            @click="emit('remove', row(item))"
          >
            {{ messages.remove }}
          </VBtn>
        </div>
      </template>
      <template #no-data>
        <EmptyState
          v-if="!loadFailed"
          :can-create="canManage"
          :create-label="messages.createButton"
          :title="messages.emptyTitle"
          @create="emit('create')"
        />
      </template>
    </DataTableBody>
  </div>
</template>

<style scoped>
  .ip-rule-table-wrap {
    display: grid;
    gap: 8px;
  }
  .ip-rule-table__head,
  .ip-rule-table__alert {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .ip-rule-table__scope {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .ip-rule-table__sub {
    font-size: 0.78rem;
    opacity: 0.7;
  }
  .ip-rule-table__cidr {
    font-family: Consolas, Monaco, monospace;
    white-space: nowrap;
  }
  .ip-rule-table__actions {
    display: flex;
    justify-content: flex-end;
    gap: 4px;
  }
</style>
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/ip-access/ip-access-parts.render.test.ts`
Expected: PASS

Run: `pnpm --filter @ssworks/admin-ui typecheck && pnpm exec eslint packages/admin-ui/src/components/ip-access/IpPreviewCard.vue packages/admin-ui/src/components/ip-access/IpRuleTable.vue packages/admin-ui/src/components/ip-access/ip-access-parts.render.test.ts`
Expected: 통과

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-ui/src/components/ip-access/IpPreviewCard.vue packages/admin-ui/src/components/ip-access/IpRuleTable.vue packages/admin-ui/src/components/ip-access/ip-access-parts.render.test.ts
git commit -m "feat(admin-ui): IP 접속 상태 카드(현재 IP · 통과 · 잠기는 사람) · 규칙 표(대상 없음 · 편집 중)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 대상 칸 · 편집 패널 · 화면 한 벌 `IpAccessManager`

**Files:**

- Create: `packages/admin-ui/src/components/ip-access/IpTargetField.vue`
- Create: `packages/admin-ui/src/components/ip-access/IpRuleEditor.vue`
- Create: `packages/admin-ui/src/components/ip-access/IpAccessManager.vue`
- Create: `packages/admin-ui/src/components/ip-access/ip-access-manager.render.test.ts`

**Interfaces:**

- Consumes: Task 4 `IpAccessManagerBindings` · `useIpAccessRules`; Task 6 `RemoteSearchField`; Task 7 `IpPreviewCard` · `IpRuleTable`; `ConfirmDialog` · `ReauthDialog`(`../common/`); `ConfirmDialogBindings` · `ReauthDialogBindings`
- Produces: `IpAccessManager`(제네릭 `R extends AdminIpRule`) — props = `IpAccessManagerBindings` 의 값 키, emits = `retry` · `openCreate` · `openEdit [R]` · `cancel` · `save` · `remove [R]` · `update:form [IpRuleForm]` · `cidrBlur` · `searchUsers [string]` · `dismissAlert [number]`(각 `onX` ↔ `x`)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-ui/src/components/ip-access/ip-access-manager.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type Component } from 'vue'
import { VAutocomplete, VSelect } from 'vuetify/components'
import type { AdminIpPreview, AdminIpPreviewQuery, AdminIpRule } from '@ssworks/admin-shared'
import {
  useIpAccessRules,
  type IpAccessManagerBindings,
} from '../../composables/useIpAccessRules.js'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import IpAccessManager from './IpAccessManager.vue'
import { DEFAULT_IP_ACCESS_MESSAGES as M, emptyIpRuleForm, scopeTypeItems } from './ip-access.js'

// 정본: hangang-home ip-access.render.test.ts(편집 패널이 대화상자가 아님 · 전체면 대상 칸 없음 · 저장 흐름)를
//       킷 화면 한 벌에 대고 잰다.

installVisualViewport()

const rule = (over: Partial<AdminIpRule> = {}): AdminIpRule => ({
  ruleNo: 12n,
  scopeType: 'team',
  scopeRefNo: 4n,
  scopeName: '상담센터',
  scopeUserId: null,
  cidr: '203.0.113.0/24',
  description: '상담센터 사무실',
  revision: 3,
  createAt: '2026-10-01T00:00:00.000Z',
  updateAt: '2026-10-02T00:00:00.000Z',
  ...over,
})

const RULES = [rule()]

const result = (): AdminIpPreview => ({
  clientIp: '203.0.113.7',
  clientPasses: true,
  summary: {
    total: 3,
    newlyLocked: 0,
    alreadyLocked: 0,
    unknown: 0,
    blockedSessions: 0,
    ruleSetChangedOnly: 0,
  },
  items: [],
})

const closedDialog = {
  modelValue: false,
  'onUpdate:modelValue': vi.fn(),
  title: 't',
  message: 'm',
  reversible: true,
  submitting: false,
  onConfirm: vi.fn(),
}

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function bindings(
  over: Partial<IpAccessManagerBindings<AdminIpRule>> = {},
): IpAccessManagerBindings<AdminIpRule> {
  return {
    rules: RULES,
    loading: false,
    loadFailed: false,
    onRetry: vi.fn(),
    canManage: true,
    editing: null,
    form: emptyIpRuleForm(),
    'onUpdate:form': vi.fn(),
    fieldErrors: {},
    onCidrBlur: vi.fn(),
    scopeItems: scopeTypeItems(M),
    teamMode: 'select',
    teamItems: [{ value: '4', title: '본사 › 상담센터' }],
    teamsLoading: false,
    teamsFailed: false,
    teamHint: null,
    userMode: 'search',
    userItems: [],
    usersSearching: false,
    usersFailed: false,
    userHint: null,
    onSearchUsers: vi.fn(),
    onOpenCreate: vi.fn(),
    onOpenEdit: vi.fn(),
    onCancel: vi.fn(),
    onSave: vi.fn(),
    onRemove: vi.fn(),
    submitting: false,
    busy: false,
    preview: { state: 'ready', op: null, result: result(), clientIp: '203.0.113.7' },
    lockedItems: [],
    changedItems: [],
    isSelf: () => false,
    globalAllowRemoval: false,
    alerts: [],
    onDismissAlert: vi.fn(),
    confirmDialog: { ...closedDialog },
    reauthDialog: {
      modelValue: false,
      'onUpdate:modelValue': vi.fn(),
      message: '',
      submitting: false,
      error: '',
      onConfirm: vi.fn(),
    },
    discardDialog: { ...closedDialog },
    messages: M,
    ...over,
  }
}

async function mountManager(b: IpAccessManagerBindings<AdminIpRule>) {
  wrapper = mount(IpAccessManager as Component, {
    props: { ...b },
    attachTo: document.body,
    global: { plugins: [vuetify] },
  })
  await flushPromises()
  return b
}

const text = () => document.body.textContent ?? ''
const input = (name: string) => wrapper!.find(`input[name="${name}"]`)

describe('IpAccessManager — 배치', () => {
  it('알림 → 카드 → 목록, 편집이 닫혀 있으면 패널이 없다', async () => {
    await mountManager(bindings())
    expect(text()).toContain(M.cardTitle)
    expect(text()).toContain(M.listTitle)
    expect(document.querySelector('.ip-rule-editor')).toBeNull()
  })

  it('알림 둘 — 닫으면 그 번호를 올린다', async () => {
    const b = await mountManager(
      bindings({
        alerts: [
          { kind: 'error', text: '409 문구' },
          { kind: 'warning', text: '충돌 문구' },
        ],
      }),
    )
    expect(text()).toContain('409 문구')
    expect(text()).toContain('충돌 문구')
    const closes = [...document.querySelectorAll('.v-alert button')] as HTMLButtonElement[]
    closes[1]!.click()
    expect(b.onDismissAlert).toHaveBeenCalledWith(1)
  })
})

describe('IpAccessManager — 편집 패널', () => {
  it('🔴 전체 범위면 대상 칸이 없다 · 패널은 대화상자가 아니다', async () => {
    await mountManager(bindings({ editing: 'new' }))
    expect(document.querySelector('.ip-rule-editor')).not.toBeNull()
    expect(document.querySelector('.v-dialog .ip-rule-editor')).toBeNull()
    expect(text()).toContain(M.editorCreateTitle)
    expect(input('scopeRefNo').exists()).toBe(false)
    expect(input('cidr').exists()).toBe(true)
  })

  it('칸 입력은 update:form · CIDR 칸을 떠나면 cidrBlur · 저장 · 취소', async () => {
    const b = await mountManager(bindings({ editing: 'new' }))
    await input('cidr').setValue('10.0.0.0/8')
    expect(b['onUpdate:form']).toHaveBeenLastCalledWith({
      ...emptyIpRuleForm(),
      cidr: '10.0.0.0/8',
    })
    await input('cidr').trigger('blur')
    expect(b.onCidrBlur).toHaveBeenCalled()
    buttonByText(M.save)!.click()
    expect(b.onSave).toHaveBeenCalled()
    buttonByText(M.cancel)!.click()
    expect(b.onCancel).toHaveBeenCalled()
  })

  it('범위 select 는 가까운 층부터', async () => {
    await mountManager(bindings({ editing: 'new' }))
    const scope = wrapper!
      .findAllComponents(VSelect)
      .find((c) => c.props('label') === M.scopeLabel)!
    expect((scope.props('items') as { value: string }[]).map((i) => i.value)).toEqual([
      'user',
      'team',
      'global',
    ])
  })

  it('칸 오류 · 저장 중 표시', async () => {
    await mountManager(
      bindings({
        editing: 'new',
        fieldErrors: { cidr: [M.cidrInvalid] },
        submitting: true,
        busy: true,
      }),
    )
    expect(text()).toContain(M.cidrInvalid)
    expect(buttonByText(M.save)!.disabled).toBe(true)
  })

  it('수정 — 제목에 지금 규칙', async () => {
    await mountManager(
      bindings({
        editing: RULES[0],
        form: { scopeType: 'team', scopeRefNo: '4', cidr: '203.0.113.0/24', description: '' },
      }),
    )
    expect(text()).toContain(M.editorEditTitle)
    expect(text()).toContain('팀 · 상담센터 · 203.0.113.0/24')
  })

  it('대상 칸 — 팀 select · 사용자 검색 · 번호 칸과 이유', async () => {
    const team = { scopeType: 'team' as const, scopeRefNo: '4', cidr: '', description: '' }
    await mountManager(bindings({ editing: 'new', form: team }))
    const select = wrapper!
      .findAllComponents(VSelect)
      .find((c) => c.props('label') === M.teamLabel)!
    expect(select.props('modelValue')).toBe('4')
    wrapper!.unmount()
    document.body.innerHTML = ''

    const b = await mountManager(
      bindings({ editing: 'new', form: { ...team, scopeType: 'user', scopeRefNo: '' } }),
    )
    const search = wrapper!
      .findAllComponents(VAutocomplete)
      .find((c) => c.props('label') === M.userLabel)!
    search.vm.$emit('update:search', '김')
    expect(b.onSearchUsers).toHaveBeenCalledWith('김')
    wrapper!.unmount()
    document.body.innerHTML = ''

    await mountManager(
      bindings({
        editing: 'new',
        form: team,
        teamMode: 'number',
        teamHint: M.teamNoPermissionHint,
      }),
    )
    expect(input('scopeRefNo').exists()).toBe(true)
    expect(text()).toContain(M.teamNumberLabel)
    expect(text()).toContain(M.teamNoPermissionHint)
  })

  it('팀 후보 실패 문구', async () => {
    await mountManager(
      bindings({
        editing: 'new',
        form: { scopeType: 'team', scopeRefNo: '', cidr: '', description: '' },
        teamsFailed: true,
      }),
    )
    expect(text()).toContain(M.teamsFailed)
  })
})

describe('흐름 + 화면 — useIpAccessRules 와 함께', () => {
  async function mountFlow(reauth: boolean) {
    const adapters = {
      list: vi.fn(async (): Promise<readonly AdminIpRule[]> => RULES),
      preview: vi.fn(async (_query: AdminIpPreviewQuery) => result()),
      create: vi.fn(async (): Promise<unknown> => ({})),
      update: vi.fn(async (): Promise<unknown> => ({})),
      remove: vi.fn(async (): Promise<unknown> => ({})),
    }
    wrapper = mount(
      defineComponent({
        setup() {
          const ip = useIpAccessRules({ ...adapters, canManage: () => true, reauth })
          return () => h(IpAccessManager as Component, { ...ip.manager.value })
        },
      }),
      { attachTo: document.body, global: { plugins: [vuetify] } },
    )
    await flushPromises()
    return adapters
  }

  it('새 규칙 → CIDR → 저장 → 재인증 창 → 만들기', async () => {
    const adapters = await mountFlow(true)
    buttonByText(M.createButton)!.click()
    await flushPromises()
    await input('cidr').setValue('203.0.113.0/24')
    buttonByText(M.save)!.click()
    await flushPromises()
    expect(document.body.textContent).toContain('전체 범위의 「203.0.113.0/24」 규칙을 만듭니다.')
    // reauth-dialog.render.test.ts 의 type() 과 같다 — `.value` 대입만으로는 v-model 이 안 먹는다
    const password = document.querySelector<HTMLInputElement>('input[name="currentPassword"]')!
    password.value = 'pw'
    password.dispatchEvent(new Event('input'))
    await flushPromises()
    // 관문 버튼 글자는 흐름이 넘긴 confirmLabel — 재인증 창 기본 「확인」이 아니다
    const confirm = [...document.querySelectorAll('.v-dialog button')].find(
      (b) => b.textContent?.trim() === M.createConfirm,
    ) as HTMLButtonElement
    confirm.click()
    await flushPromises()
    expect(adapters.create).toHaveBeenCalledWith(
      { scopeType: 'global', scopeRefNo: null, cidr: '203.0.113.0/24', description: null },
      { currentPassword: 'pw' },
    )
    expect(document.querySelector('.ip-rule-editor')).toBeNull()
  })

  it('삭제 → 확인 창(되돌릴 수 없음) → 지우기', async () => {
    const adapters = await mountFlow(false)
    document
      .querySelector<HTMLButtonElement>(
        'button[aria-label="팀 · 상담센터 203.0.113.0/24 규칙 삭제"]',
      )!
      .click()
    await flushPromises()
    expect(document.body.textContent).toContain('이 작업은 되돌릴 수 없습니다.')
    const confirm = [...document.querySelectorAll('.v-dialog button')].find(
      (b) => b.textContent?.trim() === M.removeConfirm,
    ) as HTMLButtonElement
    confirm.click()
    await flushPromises()
    expect(adapters.remove).toHaveBeenCalledWith(RULES[0], { revision: 3 }, {})
  })

  it('🔴 고친 값이 있는 채 삭제 — 버리기 창이 먼저, 버리면 삭제 창 하나만(스펙 §8 위험 ④)', async () => {
    const adapters = await mountFlow(false)
    document
      .querySelector<HTMLButtonElement>(
        'button[aria-label="팀 · 상담센터 203.0.113.0/24 규칙 수정"]',
      )!
      .click()
    await flushPromises()
    await input('description').setValue('바꾼 설명')
    document
      .querySelector<HTMLButtonElement>(
        'button[aria-label="팀 · 상담센터 203.0.113.0/24 규칙 삭제"]',
      )!
      .click()
    await flushPromises()
    const activeDialogs = () => [...document.querySelectorAll('.v-dialog.v-overlay--active')]
    expect(activeDialogs()).toHaveLength(1)
    expect(activeDialogs()[0]!.textContent).toContain(M.discardMessage)
    const discard = [...document.querySelectorAll('.v-dialog.v-overlay--active button')].find(
      (b) => b.textContent?.trim() === M.discardConfirm,
    ) as HTMLButtonElement
    discard.click()
    await flushPromises()
    expect(activeDialogs()).toHaveLength(1)
    expect(activeDialogs()[0]!.textContent).toContain(
      '팀 · 상담센터 범위의 「203.0.113.0/24」 규칙을 지웁니다.',
    )
    expect(adapters.remove).not.toHaveBeenCalled()
    expect(document.querySelector('.ip-rule-editor')).toBeNull()
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/ip-access/ip-access-manager.render.test.ts`
Expected: FAIL — `./IpAccessManager.vue` 를 찾지 못함.

- [ ] **Step 3: 세 부품을 만든다**

`packages/admin-ui/src/components/ip-access/IpTargetField.vue`:

```vue
<script setup lang="ts">
  import { computed } from 'vue'
  import { VSelect, VTextField } from 'vuetify/components'
  import RemoteSearchField from '../common/RemoteSearchField.vue'
  import type { IpAccessMessages, IpSelectItem } from './ip-access.js'

  // IP 규칙의 대상 칸(내부 부품) — 팀은 경로 select, 사용자는 서버 검색, 권한 · 어댑터가 없으면 번호 칸(④ T1 · I20).
  //
  // 정본: kim5257-crm-v5 apps/base/frontend/src/pages/settings/ip_access_control.vue 의 대상 고르기(팀 경로 · 사용자 목록)
  // 바꾼 점: 사용자 500명 목록 대신 서버 검색(공용 RemoteSearchField — C8), 후보 실패는 칸 아래 문구(번호 칸으로 바꾸지 않는다),
  //   권한 게터가 거짓이면 번호 칸 + 이유(C9). hangang 은 번호를 직접 쳤다.

  const props = defineProps<{
    scopeType: 'team' | 'user'
    value: string
    errorMessages: readonly string[]
    disabled: boolean
    teamMode: 'select' | 'number'
    teamItems: readonly IpSelectItem[]
    teamsLoading: boolean
    teamsFailed: boolean
    teamHint: string | null
    userMode: 'search' | 'number'
    userItems: readonly IpSelectItem[]
    usersSearching: boolean
    usersFailed: boolean
    userHint: string | null
    messages: IpAccessMessages
  }>()

  const emit = defineEmits<{
    'update:value': [value: string]
    searchUsers: [keyword: string]
  }>()

  const teamItemList = computed(() => [...props.teamItems])
  const errors = computed(() => [...props.errorMessages])
  const numberMode = computed(() =>
    props.scopeType === 'team' ? props.teamMode === 'number' : props.userMode === 'number',
  )
  const hint = computed(() => (props.scopeType === 'team' ? props.teamHint : props.userHint))

  function update(value: unknown): void {
    emit('update:value', typeof value === 'string' ? value : '')
  }
</script>

<template>
  <div class="ip-target-field">
    <VTextField
      v-if="numberMode"
      autocomplete="off"
      density="compact"
      :disabled="disabled"
      :error-messages="errors"
      :label="scopeType === 'team' ? messages.teamNumberLabel : messages.userNumberLabel"
      :model-value="value"
      name="scopeRefNo"
      :placeholder="messages.numberPlaceholder"
      variant="outlined"
      @update:model-value="update"
    />
    <VSelect
      v-else-if="scopeType === 'team'"
      density="compact"
      :disabled="disabled"
      :error-messages="errors"
      item-title="title"
      item-value="value"
      :items="teamItemList"
      :label="messages.teamLabel"
      :loading="teamsLoading"
      :model-value="value === '' ? null : value"
      name="scopeRefNo"
      variant="outlined"
      @update:model-value="update"
    />
    <RemoteSearchField
      v-else
      :disabled="disabled"
      :empty-text="messages.userSearchEmpty"
      :error-messages="errorMessages"
      :failed="usersFailed"
      :failed-text="messages.userSearchFailed"
      :hint-text="messages.userSearchHint"
      :items="userItems"
      :label="messages.userLabel"
      :model-value="value"
      name="scopeRefNo"
      :searching="usersSearching"
      @search="emit('searchUsers', $event)"
      @update:model-value="update"
    />
    <p
      v-if="scopeType === 'team' && !numberMode && teamsFailed"
      class="ip-target-field__note"
      role="alert"
    >
      {{ messages.teamsFailed }}
    </p>
    <p v-if="hint" class="ip-target-field__note">{{ hint }}</p>
  </div>
</template>

<style scoped>
  .ip-target-field {
    display: grid;
    gap: 4px;
  }
  .ip-target-field__note {
    margin: 0;
    font-size: 0.8rem;
    opacity: 0.75;
  }
</style>
```

`packages/admin-ui/src/components/ip-access/IpRuleEditor.vue`:

```vue
<script setup lang="ts">
  import { computed } from 'vue'
  import { VBtn, VSelect, VTextField } from 'vuetify/components'
  import {
    IP_CIDR_MAX_LENGTH,
    IP_RULE_DESCRIPTION_MAX_LENGTH,
    IP_SCOPE_TYPES,
    type AdminIpRule,
    type IpScopeType,
  } from '@ssworks/admin-shared'
  import IpTargetField from './IpTargetField.vue'
  import {
    ruleScopeTitle,
    type IpAccessMessages,
    type IpRuleForm,
    type IpRuleFormField,
    type IpSelectItem,
  } from './ip-access.js'

  // IP 규칙 편집 패널(내부 부품) — 표 위 인라인 패널이다(⑦ E1).
  //
  // 정본: hangang-home apps/admin/src/pages/settings/ip-access.vue 편집 카드
  // 바꾼 점: 대상 칸을 후보 고르기로(IpTargetField), CIDR 오류는 blur · 저장 때(서버와 같은 파서 — I19), 제출은 form submit.
  //
  // 🔴 대화상자가 아니다 — 재인증 창과 겹치고, 재인증 창이 닫히면 입력이 사라지던 사고가 있었다(hangang).
  // 🔴 전체 범위면 대상 칸을 그리지 않는다 — 전체 ⟺ 대상 없음이 서버 불변식이다.
  // 🔴 저장 버튼은 :disabled 와 :loading 한 벌 — :loading 은 클릭을 안 막는다.

  const props = defineProps<{
    editing: 'new' | AdminIpRule
    form: IpRuleForm
    fieldErrors: Readonly<Record<string, readonly string[]>>
    scopeItems: readonly IpSelectItem[]
    teamMode: 'select' | 'number'
    teamItems: readonly IpSelectItem[]
    teamsLoading: boolean
    teamsFailed: boolean
    teamHint: string | null
    userMode: 'search' | 'number'
    userItems: readonly IpSelectItem[]
    usersSearching: boolean
    usersFailed: boolean
    userHint: string | null
    submitting: boolean
    busy: boolean
    messages: IpAccessMessages
  }>()

  const emit = defineEmits<{
    'update:form': [form: IpRuleForm]
    cidrBlur: []
    save: []
    cancel: []
    searchUsers: [keyword: string]
  }>()

  const title = computed(() =>
    props.editing === 'new' ? props.messages.editorCreateTitle : props.messages.editorEditTitle,
  )
  const current = computed(() =>
    props.editing === 'new'
      ? null
      : `${ruleScopeTitle(props.editing, props.messages)} · ${props.editing.cidr}`,
  )
  const scopeItemList = computed(() => [...props.scopeItems])
  const targetScope = computed(() =>
    props.form.scopeType === 'global' ? null : props.form.scopeType,
  )
  const scopeTypes: readonly string[] = IP_SCOPE_TYPES

  function errors(key: IpRuleFormField): string[] {
    return [...(props.fieldErrors[key] ?? [])]
  }

  function patch(key: 'scopeRefNo' | 'cidr' | 'description', value: unknown): void {
    emit('update:form', { ...props.form, [key]: typeof value === 'string' ? value : '' })
  }

  /** 범위를 바꾸면 대상 비우기는 흐름(useIpAccessRules)이 한다 — 여기는 값만 올린다 */
  function patchScope(value: unknown): void {
    if (typeof value === 'string' && scopeTypes.includes(value)) {
      emit('update:form', { ...props.form, scopeType: value as IpScopeType })
    }
  }
</script>

<template>
  <section :aria-label="title" class="ip-rule-editor">
    <div class="ip-rule-editor__title">
      <span class="text-subtitle-1 font-weight-medium">{{ title }}</span>
      <span v-if="current" class="text-body-2 text-medium-emphasis">{{ current }}</span>
    </div>
    <form class="ip-rule-editor__form" novalidate @submit.prevent="emit('save')">
      <div class="ip-rule-editor__fields">
        <VSelect
          class="ip-rule-editor__scope"
          density="compact"
          :disabled="busy"
          :error-messages="errors('scopeType')"
          item-title="title"
          item-value="value"
          :items="scopeItemList"
          :label="messages.scopeLabel"
          :model-value="form.scopeType"
          name="scopeType"
          variant="outlined"
          @update:model-value="patchScope"
        />
        <IpTargetField
          v-if="targetScope"
          class="ip-rule-editor__target"
          :disabled="busy"
          :error-messages="errors('scopeRefNo')"
          :messages="messages"
          :scope-type="targetScope"
          :team-hint="teamHint"
          :team-items="teamItems"
          :team-mode="teamMode"
          :teams-failed="teamsFailed"
          :teams-loading="teamsLoading"
          :user-hint="userHint"
          :user-items="userItems"
          :user-mode="userMode"
          :users-failed="usersFailed"
          :users-searching="usersSearching"
          :value="form.scopeRefNo"
          @search-users="emit('searchUsers', $event)"
          @update:value="patch('scopeRefNo', $event)"
        />
        <VTextField
          autocomplete="off"
          class="ip-rule-editor__cidr"
          density="compact"
          :disabled="busy"
          :error-messages="errors('cidr')"
          :hint="messages.cidrHint"
          :label="messages.cidrLabel"
          :maxlength="IP_CIDR_MAX_LENGTH"
          :model-value="form.cidr"
          name="cidr"
          persistent-hint
          variant="outlined"
          @blur="emit('cidrBlur')"
          @update:model-value="patch('cidr', $event)"
        />
        <VTextField
          autocomplete="off"
          class="ip-rule-editor__description"
          counter
          density="compact"
          :disabled="busy"
          :error-messages="errors('description')"
          :label="messages.descriptionLabel"
          :maxlength="IP_RULE_DESCRIPTION_MAX_LENGTH"
          :model-value="form.description"
          name="description"
          variant="outlined"
          @update:model-value="patch('description', $event)"
        />
      </div>
      <div class="ip-rule-editor__actions">
        <VBtn color="primary" :disabled="busy" :loading="submitting" type="submit" variant="flat">
          {{ messages.save }}
        </VBtn>
        <VBtn :disabled="submitting" variant="text" @click="emit('cancel')">{{
          messages.cancel
        }}</VBtn>
      </div>
    </form>
  </section>
</template>

<style scoped>
  .ip-rule-editor {
    display: grid;
    gap: 10px;
    padding: 12px 16px;
    border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
    border-radius: 8px;
  }
  .ip-rule-editor__title {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
  }
  .ip-rule-editor__form {
    display: grid;
    gap: 10px;
  }
  .ip-rule-editor__fields {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: flex-start;
  }
  .ip-rule-editor__scope {
    flex: 0 1 150px;
  }
  .ip-rule-editor__target {
    flex: 1 1 240px;
  }
  .ip-rule-editor__cidr {
    flex: 1 1 240px;
  }
  .ip-rule-editor__description {
    flex: 2 1 280px;
  }
  .ip-rule-editor__actions {
    display: flex;
    gap: 8px;
  }
</style>
```

`packages/admin-ui/src/components/ip-access/IpAccessManager.vue`:

```vue
<script setup lang="ts" generic="R extends AdminIpRule">
  import { VAlert } from 'vuetify/components'
  import type { AdminIpPreviewItem, AdminIpRule } from '@ssworks/admin-shared'
  import type {
    ConfirmDialogBindings,
    ReauthDialogBindings,
  } from '../../composables/useWriteFlow.js'
  import ConfirmDialog from '../common/ConfirmDialog.vue'
  import ReauthDialog from '../common/ReauthDialog.vue'
  import IpPreviewCard from './IpPreviewCard.vue'
  import IpRuleEditor from './IpRuleEditor.vue'
  import IpRuleTable from './IpRuleTable.vue'
  import type {
    IpAccessAlert,
    IpAccessMessages,
    IpPreviewView,
    IpRuleForm,
    IpSelectItem,
  } from './ip-access.js'

  // IP 접근 제어 화면 한 벌 — 알림 → 접속 상태와 변경 영향 카드(늘) → 편집 패널(열렸을 때) → 규칙 목록 + 창 셋(I1).
  // 흐름은 `useIpAccessRules` 가 갖고, 이 컴포넌트는 그 바인딩(`ip.manager.value`)을 받아 그리고 이벤트만 낸다.
  //
  // 정본: hangang-home apps/admin/src/pages/settings/ip-access.vue 템플릿
  // 바꾼 점: 페이지 제목 · 바깥 카드가 없다(C6), 성공 알림이 없다(onDone — I23), 확인 · 재인증 · 고친 값 버리기 창이 이 안에
  //   있다(3e D17 와 같음). 알림은 빨강(409 자기 잠금) · 노랑(revision 충돌 · 미리보기 없이 저장)만.

  defineProps<{
    rules: readonly R[]
    loading: boolean
    loadFailed: boolean
    canManage: boolean
    editing: R | 'new' | null
    form: IpRuleForm
    fieldErrors: Readonly<Record<string, readonly string[]>>
    scopeItems: readonly IpSelectItem[]
    teamMode: 'select' | 'number'
    teamItems: readonly IpSelectItem[]
    teamsLoading: boolean
    teamsFailed: boolean
    teamHint: string | null
    userMode: 'search' | 'number'
    userItems: readonly IpSelectItem[]
    usersSearching: boolean
    usersFailed: boolean
    userHint: string | null
    submitting: boolean
    busy: boolean
    preview: IpPreviewView
    lockedItems: readonly AdminIpPreviewItem[]
    changedItems: readonly AdminIpPreviewItem[]
    isSelf: (item: AdminIpPreviewItem) => boolean
    globalAllowRemoval: boolean
    alerts: readonly IpAccessAlert[]
    confirmDialog: ConfirmDialogBindings
    reauthDialog: ReauthDialogBindings
    discardDialog: ConfirmDialogBindings
    messages: IpAccessMessages
  }>()

  const emit = defineEmits<{
    retry: []
    openCreate: []
    openEdit: [rule: R]
    cancel: []
    save: []
    remove: [rule: R]
    'update:form': [form: IpRuleForm]
    cidrBlur: []
    searchUsers: [keyword: string]
    dismissAlert: [index: number]
  }>()
</script>

<template>
  <div class="ip-access-manager">
    <VAlert
      v-for="(alert, index) in alerts"
      :key="`${alert.kind}-${alert.text}`"
      closable
      density="compact"
      :type="alert.kind"
      variant="tonal"
      @click:close="emit('dismissAlert', index)"
    >
      {{ alert.text }}
    </VAlert>
    <IpPreviewCard
      :changed-items="changedItems"
      :global-allow-removal="globalAllowRemoval"
      :is-self="isSelf"
      :locked-items="lockedItems"
      :messages="messages"
      :preview="preview"
    />
    <IpRuleEditor
      v-if="editing !== null"
      :busy="busy"
      :editing="editing"
      :field-errors="fieldErrors"
      :form="form"
      :messages="messages"
      :scope-items="scopeItems"
      :submitting="submitting"
      :team-hint="teamHint"
      :team-items="teamItems"
      :team-mode="teamMode"
      :teams-failed="teamsFailed"
      :teams-loading="teamsLoading"
      :user-hint="userHint"
      :user-items="userItems"
      :user-mode="userMode"
      :users-failed="usersFailed"
      :users-searching="usersSearching"
      @cancel="emit('cancel')"
      @cidr-blur="emit('cidrBlur')"
      @save="emit('save')"
      @search-users="emit('searchUsers', $event)"
      @update:form="emit('update:form', $event)"
    />
    <IpRuleTable
      :busy="busy"
      :can-manage="canManage"
      :editing="editing"
      :load-failed="loadFailed"
      :loading="loading"
      :messages="messages"
      :rules="rules"
      @create="emit('openCreate')"
      @edit="emit('openEdit', $event)"
      @remove="emit('remove', $event)"
      @retry="emit('retry')"
    />
    <ConfirmDialog v-bind="confirmDialog" />
    <ReauthDialog v-bind="reauthDialog" />
    <ConfirmDialog v-bind="discardDialog" />
  </div>
</template>

<style scoped>
  .ip-access-manager {
    display: grid;
    gap: 12px;
  }
</style>
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/ip-access/ip-access-manager.render.test.ts`
Expected: PASS

막히면 먼저 이 순서로 본다:

- 통합 테스트의 재인증 창 — 비밀번호 칸 `name="currentPassword"` 와 입력 방법(`value` 대입 + `input` 이벤트)은 킷 `reauth-dialog.render.test.ts` 의 `type()` 그대로다. 확인 버튼 글자는 흐름이 넘긴 `confirmLabel`(만들기 = `M.createConfirm`)이다.
- 두 창 테스트(위험 ④) — 닫힌 `VDialog` 는 `isActive` 가 바로 거짓이 되어 `.v-overlay--active` 가 빠진다. 전환 중에 남는다면 테스트를 느슨하게 하지 말고 무엇이 남는지(요소 · 클래스)를 보고한다 — 두 창이 겹쳐 보이는 것은 실제 결함일 수 있다.
- 알림 닫기 버튼 — Vuetify 4.2 `VAlert` 의 닫기 버튼이 `.v-alert button` 이 아니면 `node_modules/vuetify/lib/components/VAlert/VAlert.js` 의 닫기 버튼 클래스로 고친다(테스트 선택자만).
- `IpRuleEditor` 의 `v-if="targetScope"` 아래 `:scope-type="targetScope"` 가 타입 오류를 내면 `targetScope ?? 'team'` 처럼 좁히지 말고 `v-if` 와 같은 줄의 계산값을 쓰는 지금 방식이 맞는지 vue-tsc 출력을 보고 보고한다.

Run: `pnpm --filter @ssworks/admin-ui typecheck && pnpm exec eslint packages/admin-ui/src/components/ip-access/IpTargetField.vue packages/admin-ui/src/components/ip-access/IpRuleEditor.vue packages/admin-ui/src/components/ip-access/IpAccessManager.vue packages/admin-ui/src/components/ip-access/ip-access-manager.render.test.ts`
Expected: 통과

- [ ] **Step 5: 빌드로 제네릭 SFC 선언을 확인한다**

Run: `pnpm --filter @ssworks/admin-ui build`
Expected: 성공. `dist/components/ip-access/IpAccessManager.vue.d.ts` 가 생기고 `R extends AdminIpRule` 제네릭이 남아 있다(3f `AuditLogViewer` 와 같은 방식).

- [ ] **Step 6: 커밋한다**

```bash
git add packages/admin-ui/src/components/ip-access/IpTargetField.vue packages/admin-ui/src/components/ip-access/IpRuleEditor.vue packages/admin-ui/src/components/ip-access/IpAccessManager.vue packages/admin-ui/src/components/ip-access/ip-access-manager.render.test.ts
git commit -m "feat(admin-ui): IpAccessManager — 대상 칸(팀 경로 · 사용자 검색 · 번호) · 인라인 편집 패널 · 창 셋" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 공개 · README · changeset · 진행 문서 · 최종 확인

**Files:**

- Modify: `packages/admin-ui/src/index.ts`
- Modify: `packages/admin-ui/README.md`("## 감사 로그" 절 뒤에 "## IP 접근 제어" 절)
- Create: `.changeset/admin-ui-ip-access.md`
- Modify: `CLAUDE.md`(진행표 3g 행)
- Modify: `docs/01-phase0.md`(§8)
- Modify: `docs/HANDOFF.md`(174행 · 넘긴 것)

**Interfaces:**

- Consumes: Task 1 · 4 · 8
- Produces: 공개 export — 값 `useIpAccessRules` · `IpAccessManager`, 타입 `UseIpAccessRulesOptions` · `IpAccessRules` · `IpAccessManagerBindings` · `IpRuleDoneEvent` · `IpRuleForm` · `IpPreviewState` · `IpPreviewView` · `IpUserOption` · `IpWriteContext` · `IpSelectItem` · `IpAccessAlert` · `IpAccessMessages`

- [ ] **Step 1: export 를 더한다**

`packages/admin-ui/src/index.ts` 맨 끝("── 감사 로그 ──" 절 뒤)에 더한다:

```ts
// ── IP 접근 제어 ──────────────────────────────────────────────────────
export { default as IpAccessManager } from './components/ip-access/IpAccessManager.vue'
export {
  type IpRuleForm,
  type IpPreviewState,
  type IpPreviewView,
  type IpUserOption,
  type IpWriteContext,
  type IpSelectItem,
  type IpAccessAlert,
  type IpAccessMessages,
} from './components/ip-access/ip-access.js'
export {
  useIpAccessRules,
  type UseIpAccessRulesOptions,
  type IpAccessRules,
  type IpAccessManagerBindings,
  type IpRuleDoneEvent,
} from './composables/useIpAccessRules.js'
```

- [ ] **Step 2: README 절을 쓴다**

`packages/admin-ui/README.md` 의 "## 감사 로그" 절(그 아래 "### 알려진 한계 · 수동 확인" 까지) 뒤에 더한다:

````md
## IP 접근 제어

관리자가 어디서 접속할 수 있는지 정하는 규칙(사용자 > 팀 > 전체 중 가장 가까운 층 하나 · 규칙이 없으면 거부)을 고치는 화면이다. 위에서 아래로 접속 상태와 변경 영향 카드(늘) · 편집 패널(열렸을 때) · 규칙 목록이고, 확인 · 재인증 · 고친 값 버리기 창이 화면 안에 있다. 페이지 제목 · 카드 틀 · 메뉴는 템플릿 몫이다.

### Phase 2 서버를 쓰는 새 서비스

```ts
// api/ip-access.ts
export const ipAccessApi = {
  list: () => api.get<AdminIpRuleList>('/admin/ip-access').then((r) => r.items),
  preview: (query: AdminIpPreviewQuery) =>
    api.get<AdminIpPreview>('/admin/ip-access/preview', { params: query }),
  create: (body: AdminIpRuleCreate, ctx: IpWriteContext) =>
    api.post('/admin/ip-access', { ...body, ...ctx }),
  update: (rule: AdminIpRule, body: AdminIpRuleUpdate, ctx: IpWriteContext) =>
    api.patch(`/admin/ip-access/${rule.ruleNo}`, { ...body, ...ctx }),
  // 🔴 두 번째 인자가 본문이다 — 빠뜨리면 revision 이 사라져 400
  remove: (rule: AdminIpRule, body: AdminIpRuleRemove, ctx: IpWriteContext) =>
    api.del(`/admin/ip-access/${rule.ruleNo}`, { ...body, ...ctx }),
}
```

```ts
const ip = useIpAccessRules({
  ...ipAccessApi,
  canManage: () => can(P.IP_ACCESS_MANAGE), // 거짓이면 목록만 — 미리보기 · 쓰기를 부르지 않는다
  reauth: true, // 서버 AdminServerModule 의 reauth 와 같게. false 여도 쓰기는 확인 창을 거친다
  loadTeams: () => api.get<AdminTeamTree>('/admin/teams/tree').then((r) => r.items),
  canLoadTeams: () => can(P.TEAMS_READ), // 거짓이면 팀 번호 칸
  searchUsers: (keyword) =>
    api
      .get<Paginated<AdminUser>>('/admin/users', {
        params: { page: 1, itemsPerPage: 20, filter: { keyword, status: 'active' } },
      })
      .then((r) =>
        r.items.map((u) => ({ userNo: u.userNo, userId: u.userId, userName: u.userName })),
      ),
  canSearchUsers: () => can(P.USERS_READ), // 거짓이면 사용자 번호 칸
  onDone: () => toast.success('IP 규칙을 바꿨습니다.'),
  messages: { hintRecovery: '잠긴 사람은 … 복구 절차는 docs/runbook/ip-lockout.md' },
})
```

```vue
<CardLayout>
  <VCardTitle>IP 접근 제어</VCardTitle>
  <IpAccessManager v-bind="ip.manager.value" />
</CardLayout>
```

- **미리보기**: 편집하는 동안 300ms 뒤 서버 미리보기를 불러, 지금 접속 IP · 그 변경 뒤에도 통과하는지 · 새로 잠기는 사람 · 규칙만 바뀌는 사람을 보인다. 미리보기는 예고다 — 실제로 막는 것은 저장할 때 요청자 주소를 다시 평가하는 서버 검사(409)이고, 그 검사는 요청자 본인만 본다.
- **저장**: 칸 검증(서버와 같은 CIDR 파서) → 미리보기 마무리 → 확인 또는 재인증 창(문구에 그 변경의 최종 영향) → 요청 → 목록 재조회. 전체 허용(`0.0.0.0/0` · `::/0`)을 지우거나 좁히면 카드와 창 문구에 경고가 붙는다.
- **세션 끊기 제안이 없는 이유**: 킷 서버는 로그인 · 매 요청 · 토큰 갱신에서 IP 를 본다. 막힌 주소의 요청은 저장 직후 다음 요청부터 403 이고, 규칙을 풀면 같은 세션이 다시 된다. 끊어야 하면 세션 화면에서 끊는다.
- **오류**: 자기 잠금 · 전권자 잔존 409 는 서버 문구 그대로 빨간 알림(자기 잠금이면 서버가 본 주소를 덧붙인다). 다른 관리자가 먼저 고쳤으면(revision 충돌) 고치던 값을 두고 새 값을 노란 알림으로 보인다 — 한 번 더 저장해야 덮는다.
- **본인 표시**: 잠기는 사람 목록의 본인 판정은 `createAdminUi` 의 `user().userId` 다. 아이디가 바뀌는 서비스면 `isSelf` 를 넘긴다.

### 알려진 한계 · 수동 확인

- 팀 후보는 편집을 열 때마다 트리 전체를 다시 부른다(팀은 많지 않다는 전제).
- 테스트가 잴 수 없어 사람이 확인하는 것 — 좁은 폭에서 편집 패널 칸 넷이 줄바꿈되는지, 카드의 긴 문단이 읽히는지, 실제 브라우저에서 대상 사용자를 고른 뒤 다시 타이핑하면 검색이 나가는지.
````

Run: `pnpm exec prettier --write packages/admin-ui/README.md` 를 두 번, 그다음 `pnpm exec prettier --check packages/admin-ui/README.md`
Expected: 통과

- [ ] **Step 3: changeset 을 만든다**

`.changeset/admin-ui-ip-access.md`:

```md
---
'@ssworks/admin-ui': minor
---

PR #3g — IP 접근 제어 관리 화면.

- 소비자가 할 일은 없다(새 peer 없음 · admin-shared 하한 그대로).
- admin-ui 새 API: `useIpAccessRules` · `IpAccessManager`, 타입 `UseIpAccessRulesOptions` · `IpAccessRules` · `IpAccessManagerBindings` · `IpRuleDoneEvent` · `IpRuleForm` · `IpPreviewState` · `IpPreviewView` · `IpUserOption` · `IpWriteContext` · `IpSelectItem` · `IpAccessAlert` · `IpAccessMessages`.
  - 접속 상태와 변경 영향 카드(현재 IP 상시 · 통과 여부 · 새로 잠기는 사람 · 규칙만 바뀌는 사람 · 본인 표시 · 전체 허용 제거 경고).
  - 편집은 표 위 인라인 패널, 대상은 팀 경로 select · 사용자 서버 검색(권한이 없으면 번호 칸).
  - 관문은 미리보기를 마친 뒤 열리고 문구가 최종 영향이다. `reauth` 면 재인증 창, 아니면 확인 창 — 관문 없는 쓰기는 없다.
  - revision 충돌 · 409 자기 잠금(서버 문구 + 주소) · 고친 값 버리기 확인.
- 감사 로그의 행위자 칸이 공용 내부 부품으로 바뀌었다 — 동작은 같다.
- 서버 계약은 그대로다(`/admin/ip-access` 다섯 라우트). 기존 API 동작은 바뀌지 않는다.
```

Run: `pnpm changeset status`
Expected: `@ssworks/admin-ui` minor(fixed 묶음이라 세 패키지가 같은 번호로 오른다).

- [ ] **Step 4: 진행 문서를 갱신한다**

`CLAUDE.md` 진행표의 "Phase 1 후속 PR #3g —" 행에서 상태 칸 `다음(3f 머지 뒤 플랜)` 을 `완료` 로, 문서 칸 끝에 ` · 플랜 \`docs/superpowers/plans/2026-10-18-admin-ui-ip-access.md\``를 더한다. 제목 칸의`(IP 접근 제어 관리 화면)`은`(IP 접근 제어 관리 화면 · 미리보기 뒤 관문 · 대상 후보 · RemoteSearchField)` 로 바꾼다.

`docs/01-phase0.md` §8 의 "admin-ui 감사 로그 화면 PR #3f(2026-10-18) 완료 —" 문단 끝 문장 `IP 접근 제어 화면 PR #3g 는 다음이다.` 를 지우고, 그 문단 바로 뒤에 새 문단을 더한다:

```md
admin-ui IP 접근 제어 화면 PR #3g(2026-10-18) 완료 — `useIpAccessRules` · `IpAccessManager`(접속 상태와 변경 영향 카드 · 인라인 편집 패널 · 팀 경로 · 사용자 검색 · 미리보기 뒤 관문 · revision 충돌 · 409 자기 잠금), 공용 내부 부품 `RemoteSearchField`(스펙 `docs/superpowers/specs/2026-10-18-admin-ui-audit-ip-design.md` · 플랜 `docs/superpowers/plans/2026-10-18-admin-ui-ip-access.md`). 템플릿에 없던 두 화면(감사 · IP)이 admin-ui 에 갖춰졌다.
```

`docs/HANDOFF.md`:

- "템플릿 preset/admin 이 넘긴 것" 아래 줄 `  - 템플릿에 없는 화면: IP 접근 제어 · 감사 로그 조회. …「IP 접근 제어 켜기」.` 의 끝에 ` → **3f · 3g 에서 닫음**(admin-ui \`AuditLogViewer\` · \`IpAccessManager\` — 템플릿 페이지 반영은 「PR #3g 가 넘긴 것」)` 을 붙인다.
- "PR #3f 가 넘긴 것(2026-10-18)" 블록의 둘째 줄 `  - PR #3g(IP 접근 제어 화면) 플랜 — …` 끝에 ` → **3g 에서 닫음**` 을 붙인다.
- 그 블록 바로 뒤에 블록을 더한다:

```md
- **PR #3g 가 넘긴 것(2026-10-18)**
  - 템플릿 `preset/admin` 에 IP 접근 제어 페이지를 반영한다 — `pages/settings/ip-access.vue` · `api/ip-access.ts`(admin-ui README "## IP 접근 제어" 예시 그대로). 템플릿은 IP 모듈을 꺼 두었으니 켜는 법(템플릿 CLAUDE.md 「IP 접근 제어 켜기」)과 메뉴 노출을 함께 정한다. 템플릿 push 는 사람.
  - 3f 최종 리뷰의 범위 밖 관찰: `useServerTable`(3a)이 스코프 해제 뒤 도착한 응답을 refs 에 쓴다(무해) — dispose 가드를 넣을지 정한다.
  - 실브라우저 확인: 대상 사용자 · 감사 행위자를 고른 뒤 다시 타이핑하면 검색이 나가는지(happy-dom 에서는 재현 안 됨), 좁은 폭 배치.
```

Run: `pnpm exec prettier --write CLAUDE.md docs/01-phase0.md docs/HANDOFF.md` 를 두 번, 그다음 `pnpm exec prettier --check CLAUDE.md docs/01-phase0.md docs/HANDOFF.md`
Expected: 통과

- [ ] **Step 5: 전체 검사를 돌린다**

Run: `pnpm check`
Expected: lint → typecheck → test → build → check:dts 모두 초록. 테스트 수를 기록한다.

- [ ] **Step 6: 커밋한다**

```bash
git add packages/admin-ui/src/index.ts packages/admin-ui/README.md .changeset/admin-ui-ip-access.md CLAUDE.md docs/01-phase0.md docs/HANDOFF.md
git commit -m "docs(admin-ui): PR #3g — IP 접근 제어 공개 · README 절 · changeset · 진행 문서" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

PR 은 만들지 않는다 — push 는 사람이 한다. 발행 형태 스모크(`/smoke` — 패킹 tarball 을 임시 Vite 앱에서 vue-tsc · build, 이번에는 `IpAccessManager` · `useIpAccessRules` 를 쓰는 페이지 포함)는 이 Task 커밋 뒤 따로 돌린다(3f 와 같은 방식). 브랜치 상태와 테스트 수를 보고한다.
