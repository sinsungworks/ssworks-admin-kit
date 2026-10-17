# admin-ui 감사 로그 화면(PR #3f) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin-ui 에 감사 로그 조회 흐름 `useAuditLogs` 와 화면 한 벌 `AuditLogViewer` 를 넣어, 새 관리자 앱이 어댑터만 넘기면 감사 로그 화면이 서게 한다.

**Architecture:** 판정 · 문구는 순수 함수 모듈(`components/audit/audit-log.ts` · `utils/local-date.ts`)에 두고 단위 테스트로 고정한다. 흐름은 composable 하나(`useAuditLogs`)가 3a `useServerTable` 을 감싸 입력값/적용값 · URL · 행위자 검색 · 펼침을 맡고, 화면은 그 바인딩을 `v-bind` 로 받는 제네릭 SFC 한 벌(`AuditLogViewer` + 내부 부품 셋)이다. 행위자 검색은 3g 의 사용자 검색과 같은 규칙이라 내부 composable `useRemoteSearch` 로 뺀다.

**Tech Stack:** Vue 3.5 · Vuetify 4.2 · vue-router 4/5 · TypeScript 6 · Vitest 5 + @vue/test-utils + happy-dom · @ssworks/admin-shared 0.4.0+ (감사 카탈로그 · 행 타입)

**Spec:** `docs/superpowers/specs/2026-10-18-admin-ui-audit-ip-design.md` — 이 플랜은 그중 3f(§2-2 C · §2-3 A · §4-1 · §4-2 · §7 감사 부분 · §8 3f 부분)를 구현한다. 실행자는 스펙과 함께 읽는다.

## Global Constraints

- 브랜치 `feat/admin-ui-audit`(스펙 커밋 `3ceb43f` 가 이미 있다). `main` 에 직접 커밋하지 않는다.
- **admin-shared · admin-server 는 고치지 않는다.** admin-shared 0.4.0 부터 실린 export 만 쓴다.
- admin-ui `peerDependencies["@ssworks/admin-shared"]` 는 정확히 `"workspace:>=0.4.0 <1.0.0"`(Task 2).
- SFC 는 Vuetify 컴포넌트를 `vuetify/components` 에서 명시 import 한다. 스타일은 순수 CSS `<style scoped>`. 스토어 · 라우터를 import 하지 않는다(라우터는 `urlSync` 가 켜졌을 때 `useServerTable` 이 이미 쓰는 경로뿐).
- `import type` 을 분리한다. 내부 상대 import 는 `.js` 확장자(`.vue` 는 그대로).
- `console.log` 금지. 정규식에 백슬래시 문자 클래스를 쓰지 않는다 — `[0-9]` 로 적는다.
- 새 파일 머리 주석에 **정본**(출처)과 **바꾼 점**을 적는다. `🔴` 주석은 "지우면 사고가 나는 이유"다.
- Boolean prop 에 `undefined` 기본값을 주지 않는다.
- 테스트: `src/**/*.test.ts`. DOM 이 필요하면 파일 머리 `// @vitest-environment happy-dom`. 오버레이 컴포넌트(`VAutocomplete` · `VSelect`)를 그리는 파일은 모듈 최상단에서 `installVisualViewport()`. `data-testid` 를 심지 않는다 — 글자 · 접근 이름 · `name` 으로 찾는다. 가짜 타이머는 `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })`(킷 관례 — `flushPromises` 가 막히지 않는다).
- 디바운스는 `300`ms(`REMOTE_SEARCH_DEBOUNCE_MS`).
- 기본 문구는 이 플랜에 적힌 글자 그대로다.
- 명령은 저장소 루트에서: 패키지 하나는 `pnpm --filter @ssworks/admin-ui test`, 파일 하나는 `pnpm --filter @ssworks/admin-ui exec vitest run <경로>`, 타입은 `pnpm --filter @ssworks/admin-ui typecheck`.
- 커밋 메시지: 한국어 conventional commits, 끝 줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `.claude/settings.json` 의 로컬 변경은 커밋하지 않는다(사람이 승인한 로컬 권한).
- Windows · Linux 양쪽: `rm`·`cp` 같은 Unix 명령 대신 전용 도구, `> /dev/null` 금지.

## Review Focus

1. **URL 에 사람이 친 틀린 값** — `?actor=007` · `?from=2026-02-30` · `?from=2026-10-18&to=2026-10-01`(거꾸로) · 129자 `action`. 기대: 그 키만 없는 것으로 치고 화면이 뜬다. 서버에 400 을 보내지 않는다. → Task 5 테스트 "틀린 값은 버린다" · "거꾸로 된 기간은 둘 다 버린다".
2. **meta 가 객체가 아닌 행** — 배열 · 문자열 · 64 KiB 자리표시 `{ _truncated: true, bytes }` · before 만 배열. 기대: 펼쳐도 던지지 않고 "기타 기록" JSON 으로 보인다. → Task 2 `diffAuditMeta` 테스트 · Task 6 펼친 행 테스트.
3. **자동완성에서 사람을 고른 직후** — Vuetify 가 검색어를 그 항목 글자("김운영 (ops01)")로 바꾸며 `update:search` 를 다시 낸다. 기대: 그 글자로 다시 검색하지 않는다. → Task 6 "고른 항목 글자로는 다시 알리지 않는다".
4. **3쪽에서 같은 조건으로 [적용]** — 기대: 1쪽으로 튀지 않고 지금 쪽을 다시 부른다(hangang commit). → Task 4 "같은 조건 재적용은 지금 쪽을 다시 부른다".
5. **카탈로그 밖 동작 코드(옛 행 · 다른 프로젝트 액션)** — 기대: 표 셀과 동작 항목이 "x (x)" 처럼 두 번 적지 않고 코드 원문 한 번. → Task 2 `actionItem` 테스트 · Task 6 "모르는 동작은 코드 그대로".

---

## File Structure

| 파일 (모두 `packages/admin-ui/` 아래)                                                                                                                       | 책임                                                           | Task  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----- |
| `src/utils/format-date-time.ts` · `.test.ts`                                                                                                                | 시각 표기 — 초 옵션 더함                                       | 1     |
| `src/utils/local-date.ts` · `.test.ts`                                                                                                                      | 로컬 날짜 ↔ ISO 반열림 경계                                    | 1     |
| `src/components/audit/audit-log.ts` · `.test.ts`                                                                                                            | 감사 타입 · 기본 문구 · 순수 함수 · URL 코덱(Task 5 에서 더함) | 2 · 5 |
| `package.json` · `README.md`(Peer 표) · `../../.changeset/README.md`                                                                                        | peer 하한                                                      | 2     |
| `src/composables/useRemoteSearch.ts` · `.test.ts`                                                                                                           | 서버 검색 자동완성 공통 흐름(내부)                             | 3     |
| `src/composables/useAuditLogs.ts` · `.render.test.ts`                                                                                                       | 감사 흐름 · 바인딩                                             | 4 · 5 |
| `src/composables/useAuditLogs.url.test.ts`                                                                                                                  | URL 동기화                                                     | 5     |
| `src/components/audit/AuditLogFilterBar.vue`                                                                                                                | 필터 카드(내부)                                                | 6     |
| `src/components/audit/AuditLogDetail.vue`                                                                                                                   | 펼친 행 내용(내부)                                             | 6     |
| `src/components/audit/AuditLogTable.vue`                                                                                                                    | 표 · 셀 · 펼침(내부)                                           | 6     |
| `src/components/audit/AuditLogViewer.vue` · `audit-log-viewer.render.test.ts`                                                                               | 화면 한 벌(공개)                                               | 6     |
| `src/index.ts` · `README.md`(감사 로그 절) · `../../.changeset/admin-ui-audit.md` · `../../CLAUDE.md` · `../../docs/01-phase0.md` · `../../docs/HANDOFF.md` | 공개 · 문서 · 릴리스                                           | 7     |

---

### Task 1: 시각 초 표기 · 로컬 날짜 경계

**Files:**

- Modify: `packages/admin-ui/src/utils/format-date-time.ts`
- Create: `packages/admin-ui/src/utils/format-date-time.test.ts`
- Create: `packages/admin-ui/src/utils/local-date.ts`
- Create: `packages/admin-ui/src/utils/local-date.test.ts`

**Interfaces:**

- Consumes: 없음
- Produces:
  - `formatDateTime(iso: string, options?: { seconds?: boolean }): string` — 기존 한 인자 호출은 그대로.
  - `isDateOnly(value: string): boolean`
  - `localDayStartIso(value: string): string | null` — 그날 로컬 0시 ISO
  - `localNextDayStartIso(value: string): string | null` — 다음 날 로컬 0시 ISO

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-ui/src/utils/format-date-time.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatDateTime } from './format-date-time.js'

// 시간대와 무관하게 잰다 — 로컬 시각으로 만든 Date 의 ISO 를 넣고 같은 로컬 시각이 나오는지 본다.
const local = (y: number, mo: number, d: number, h: number, mi: number, s: number) =>
  new Date(y, mo - 1, d, h, mi, s).toISOString()

describe('formatDateTime', () => {
  it('기본은 분까지', () => {
    expect(formatDateTime(local(2026, 10, 18, 14, 3, 9))).toBe('2026-10-18 14:03')
  })

  it('seconds 면 초까지 — 모두 두 자리', () => {
    expect(formatDateTime(local(2026, 1, 5, 4, 7, 2), { seconds: true })).toBe(
      '2026-01-05 04:07:02',
    )
  })

  it('형식이 틀린 값은 원문 그대로', () => {
    expect(formatDateTime('not-a-date', { seconds: true })).toBe('not-a-date')
  })
})
```

`packages/admin-ui/src/utils/local-date.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isDateOnly, localDayStartIso, localNextDayStartIso } from './local-date.js'

// 시간대와 무관하게 잰다 — 기대값을 같은 로컬 달력의 `new Date(y, m - 1, d)` 로 만든다.
const localMidnight = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString()

describe('isDateOnly', () => {
  it('YYYY-MM-DD 이고 실제로 있는 날짜만 참', () => {
    expect(isDateOnly('2026-10-18')).toBe(true)
    expect(isDateOnly('2028-02-29')).toBe(true)
  })

  it.each([
    '',
    '2026-02-30',
    '2027-02-29',
    '2026-13-01',
    '2026-2-3',
    ' 2026-10-18',
    '2026-10-18T00:00',
    '20261018',
    '0050-01-01',
  ])('%j 는 거짓', (value) => {
    expect(isDateOnly(value)).toBe(false)
  })
})

describe('localDayStartIso · localNextDayStartIso', () => {
  it('그날 로컬 0시', () => {
    expect(localDayStartIso('2026-10-18')).toBe(localMidnight(2026, 10, 18))
  })

  it('다음 날 로컬 0시 — 반열림 끝', () => {
    expect(localNextDayStartIso('2026-10-18')).toBe(localMidnight(2026, 10, 19))
  })

  it('월말 · 연말 · 윤일을 넘긴다', () => {
    expect(localNextDayStartIso('2026-10-31')).toBe(localMidnight(2026, 11, 1))
    expect(localNextDayStartIso('2026-12-31')).toBe(localMidnight(2027, 1, 1))
    expect(localNextDayStartIso('2028-02-29')).toBe(localMidnight(2028, 3, 1))
  })

  it('형식이 틀리면 null', () => {
    expect(localDayStartIso('2026-02-30')).toBeNull()
    expect(localNextDayStartIso('')).toBeNull()
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/utils/format-date-time.test.ts src/utils/local-date.test.ts`
Expected: FAIL — `local-date.js` 를 찾지 못함, `seconds` 테스트가 `'2026-01-05 04:07'` 을 받음.

- [ ] **Step 3: 구현한다**

`packages/admin-ui/src/utils/format-date-time.ts` 전체를 바꾼다:

```ts
// 날짜 기본 표기 — `SessionTable` · `LegalDocumentEditor` · `AuditLogViewer` 가 함께 쓴다(3e 스펙 D21 · 3f 스펙 C5).
// 패키지 내부용(index 에서 내보내지 않는다).
//
// 정본: ssworks-gise-home apps/admin/src/types/session.ts 의 표기(3c 에서 session-table.ts 에 두었던 것을 옮겼다)
// 바꾼 점: 초 옵션 — 감사 로그는 같은 분 안의 순서를 읽어야 한다(hangang `formatLocalDateTime(…, { seconds: true })`).

const pad = (value: number) => String(value).padStart(2, '0')

export interface FormatDateTimeOptions {
  /** 기본 false. true 면 `YYYY-MM-DD HH:mm:ss` */
  seconds?: boolean
}

/** 브라우저 현지 시각 `YYYY-MM-DD HH:mm`(초 옵션이면 `:ss` 까지). 형식이 틀린 값은 원문 그대로(gise). */
export function formatDateTime(iso: string, options: FormatDateTimeOptions = {}): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const minutes = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  return options.seconds === true ? `${minutes}:${pad(date.getSeconds())}` : minutes
}
```

`packages/admin-ui/src/utils/local-date.ts`:

```ts
// 로컬 날짜(`YYYY-MM-DD`) ↔ ISO 경계 — 감사 로그 기간 필터(3f 스펙 A7). 패키지 내부용.
//
// 정본: hangang-home apps/admin/src/utils/local-time.ts `isDateOnly` · `localDayStartIso` · `localNextDayStartIso`
// 바꾼 점: 시간대 인자를 없앴다 — 서버 · DB 는 UTC, 화면은 브라우저 로컬이다(hangang 2026-10-04 원칙). 실제로 없는
//   날짜(`2026-02-30`)를 거부한다 — `new Date` 는 그것을 3월 2일로 넘겨 버린다.

const DATE_ONLY = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/

function parseDateOnly(value: string): Date | null {
  const match = DATE_ONLY.exec(value)
  if (match == null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  // 🔴 넘친 날짜를 거부한다 — 2026-02-30 은 3월 2일이 되고, 0~99 년은 1900 년대가 된다
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

/** `YYYY-MM-DD` 이고 실제로 있는 날짜인가 */
export function isDateOnly(value: string): boolean {
  return parseDateOnly(value) !== null
}

/** 그날 로컬 0시의 ISO. 형식이 틀리면 null */
export function localDayStartIso(value: string): string | null {
  return parseDateOnly(value)?.toISOString() ?? null
}

/** 다음 날 로컬 0시의 ISO — 서버가 끝을 `<` 로 비교하는 반열림 구간의 끝. 형식이 틀리면 null */
export function localNextDayStartIso(value: string): string | null {
  const date = parseDateOnly(value)
  if (date == null) return null
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).toISOString()
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/utils/format-date-time.test.ts src/utils/local-date.test.ts`
Expected: PASS(15 tests 안팎)

Run: `pnpm --filter @ssworks/admin-ui test`
Expected: PASS — `SessionTable` · `LegalDocumentEditor` 테스트가 그대로 초록이다(한 인자 호출은 바뀌지 않는다).

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-ui/src/utils/format-date-time.ts packages/admin-ui/src/utils/format-date-time.test.ts packages/admin-ui/src/utils/local-date.ts packages/admin-ui/src/utils/local-date.test.ts
git commit -m "feat(admin-ui): 시각 초 표기 · 로컬 날짜 반열림 경계 도우미(3f 기반)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 감사 타입 · 문구 · 순수 함수 + peer 하한

**Files:**

- Create: `packages/admin-ui/src/components/audit/audit-log.ts`
- Create: `packages/admin-ui/src/components/audit/audit-log.test.ts`
- Modify: `packages/admin-ui/package.json`(peerDependencies)
- Modify: `packages/admin-ui/README.md`("## Peer 의존" 표)
- Modify: `.changeset/README.md`("0.x 동안의 peer 범위")

**Interfaces:**

- Consumes: Task 1 `isDateOnly` · `localDayStartIso` · `localNextDayStartIso`; admin-shared `AdminAuditLog` · `AuditCatalog`
- Produces (모두 `components/audit/audit-log.ts` 에서 export):
  - 타입: `AuditActorOption { userNo: bigint; userId: string; userName: string; resigned?: boolean }` · `AuditActionGroup { prefix: string; label: string }` · `AuditLogFilter { actorUserNo?: bigint; action?: string; actionMatch?: 'prefix' | 'exact'; targetType?: string; targetRefNo?: bigint; from?: string; to?: string }` · `AuditLogDraft { actorUserNo: string; action: string; targetType: string; targetRefNo: string; from: string; to: string }` · `AuditFilterItem { value: string; title: string }` · `AuditResultKind = 'success' | 'redirect' | 'denied' | 'error'` · `AuditLogMessages`(아래 전체) · `AuditMetaChange { key: string; before: string; after: string }` · `AuditMetaDiff { hasDiff: boolean; changes: AuditMetaChange[]; masked: string[]; rest: unknown }`
  - 값: `DEFAULT_AUDIT_LOG_MESSAGES` · `CORE_AUDIT_ACTION_GROUPS` · `MASKED_VALUE`
  - 함수: `emptyAuditLogDraft()` · `normalizeAuditLogDraft(d)` · `isEmptyAuditLogDraft(d)` · `sameAuditLogDraft(a, b)` · `auditResultOf(status)` · `auditResultText(status, messages)` · `actorText(row, messages)` · `actorOptionTitle(option, messages)` · `targetText(row, catalog)` · `mergeActionGroups(extra?)` · `buildActionOptions(catalog, groups, messages)` · `toActionFilter(value)` · `targetOptions(catalog)` · `diffAuditMeta(meta, absent)` · `metaJson(value)` · `auditFilterProblem(draft, messages)` · `toAuditFilter(applied)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-ui/src/components/audit/audit-log.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { coreAuditCatalog, defineAuditCatalog } from '@ssworks/admin-shared'
import {
  CORE_AUDIT_ACTION_GROUPS,
  DEFAULT_AUDIT_LOG_MESSAGES as M,
  actorOptionTitle,
  actorText,
  auditFilterProblem,
  auditResultOf,
  auditResultText,
  buildActionOptions,
  diffAuditMeta,
  emptyAuditLogDraft,
  isEmptyAuditLogDraft,
  mergeActionGroups,
  metaJson,
  normalizeAuditLogDraft,
  sameAuditLogDraft,
  targetOptions,
  targetText,
  toActionFilter,
  toAuditFilter,
  type AuditLogDraft,
} from './audit-log.js'

// 정본: hangang-home apps/admin/src/pages/settings/audit-logs-messages.test.ts 의 사례를 킷 행 모양으로 옮겼다.

const project = defineAuditCatalog({
  actions: { POINT_ADJUST: 'members.points.adjust', POINT_GRANT: 'members.points.grant' },
  targets: { MEMBER: 'member' },
  labels: { 'members.points.adjust': '포인트 조정', 'members.points.grant': '포인트 지급' },
  targetLabels: { member: '회원' },
})

const draft = (over: Partial<AuditLogDraft> = {}): AuditLogDraft => ({
  ...emptyAuditLogDraft(),
  ...over,
})
const localMidnight = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString()

describe('결과 갈래', () => {
  it.each([
    [199, 'success'],
    [200, 'success'],
    [299, 'success'],
    [300, 'redirect'],
    [399, 'redirect'],
    [400, 'denied'],
    [499, 'denied'],
    [500, 'error'],
  ] as const)('%i → %s', (status, kind) => {
    expect(auditResultOf(status)).toBe(kind)
  })

  it('🔴 숫자와 글자를 함께 낸다 — 색으로만 가르지 않는다', () => {
    expect(auditResultText(401, M)).toBe('401 · 거부')
    expect(auditResultText(503, M)).toBe('503 · 서버 오류')
    expect(auditResultText(201, M)).toBe('201 · 성공')
  })
})

describe('행위자 · 대상 표기', () => {
  const actor = (
    actorUserNo: bigint | null,
    actorUserId: string | null,
    actorUserName: string | null,
  ) => ({
    actorUserNo,
    actorUserId,
    actorUserName,
  })

  it('이름(아이디) → #번호 (계정 정보 없음) → 계정 없음', () => {
    expect(actorText(actor(12n, 'ops01', '김운영'), M)).toBe('김운영 (ops01)')
    expect(actorText(actor(12n, 'ops01', null), M)).toBe('— (ops01)')
    expect(actorText(actor(41n, null, null), M)).toBe('#41 (계정 정보 없음)')
    expect(actorText(actor(null, null, null), M)).toBe('계정 없음')
  })

  it('자동완성 항목 — 퇴사자는 표시를 붙인다', () => {
    expect(
      actorOptionTitle({ userNo: 30n, userId: 'old03', userName: '이퇴사', resigned: true }, M),
    ).toBe('이퇴사 (old03) · 퇴사')
    expect(actorOptionTitle({ userNo: 12n, userId: 'ops01', userName: '김운영' }, M)).toBe(
      '김운영 (ops01)',
    )
  })

  it('대상 — 라벨 #번호 · 종류 없음 — · 모르는 종류는 원문', () => {
    expect(targetText({ targetType: 'role', targetRefNo: 3n }, coreAuditCatalog)).toBe('역할 #3')
    expect(targetText({ targetType: 'role', targetRefNo: null }, coreAuditCatalog)).toBe('역할')
    expect(targetText({ targetType: null, targetRefNo: null }, coreAuditCatalog)).toBe('—')
    expect(targetText({ targetType: 'widget', targetRefNo: 9n }, coreAuditCatalog)).toBe(
      'widget #9',
    )
  })
})

describe('동작 항목', () => {
  it('묶음 목록 — 코어 뒤에 프로젝트를 더하고, prefix 가 같으면 라벨만 덮는다', () => {
    const merged = mergeActionGroups([
      { prefix: 'org.user', label: '직원' },
      { prefix: 'members.points.', label: '포인트' },
    ])
    expect(merged.map((g) => g.prefix)).toEqual([
      ...CORE_AUDIT_ACTION_GROUPS.map((g) => g.prefix),
      'members.points',
    ])
    expect(merged.find((g) => g.prefix === 'org.user')?.label).toBe('직원')
    // 코어 상수는 바뀌지 않는다
    expect(CORE_AUDIT_ACTION_GROUPS.find((g) => g.prefix === 'org.user')?.label).toBe('사용자')
  })

  it('🔴 묶음 값은 끝에 점 — 묶음이 먼저, 개별은 카탈로그 순서', () => {
    const items = buildActionOptions(coreAuditCatalog, mergeActionGroups(), M)
    expect(items[0]).toEqual({ value: 'auth.', title: '[묶음] 인증 (auth.*)' })
    expect(items.filter((i) => i.value.endsWith('.')).map((i) => i.value)).toEqual([
      'auth.',
      'auth.login.',
      'session.',
      'org.role.',
      'org.user.',
      'org.team.',
      'setting.',
    ])
    const individual = items.filter((i) => !i.value.endsWith('.'))
    expect(individual.map((i) => i.value)).toEqual([...coreAuditCatalog.ACTION_VALUES])
    expect(individual[0]).toEqual({
      value: 'auth.login.success',
      title: '로그인 성공 (auth.login.success)',
    })
  })

  it('🔴 걸리는 액션이 하나뿐인 묶음은 항목이 되지 않는다', () => {
    const items = buildActionOptions(
      project,
      mergeActionGroups([
        { prefix: 'setting.legal', label: '약관' },
        { prefix: 'members.points', label: '포인트' },
      ]),
      M,
    )
    expect(items.some((i) => i.value === 'setting.legal.')).toBe(false)
    expect(items).toContainEqual({
      value: 'members.points.',
      title: '[묶음] 포인트 (members.points.*)',
    })
    expect(items).toContainEqual({
      value: 'members.points.adjust',
      title: '포인트 조정 (members.points.adjust)',
    })
  })

  it('라벨이 코드와 같으면(모르는 코드) 한 번만 적는다', () => {
    expect(M.actionItem('x.y', 'x.y')).toBe('x.y')
  })

  it('🔴 끝 점이면 prefix, 아니면 exact — session.revoke 는 exact 다', () => {
    expect(toActionFilter('')).toBeNull()
    expect(toActionFilter('org.role.')).toEqual({ action: 'org.role.', actionMatch: 'prefix' })
    expect(toActionFilter('org.role.update')).toEqual({
      action: 'org.role.update',
      actionMatch: 'exact',
    })
    expect(toActionFilter('session.revoke')).toEqual({
      action: 'session.revoke',
      actionMatch: 'exact',
    })
  })

  it('대상 종류 — 라벨 가나다순, 값은 코드', () => {
    const items = targetOptions(project)
    const titles = items.map((i) => i.title)
    expect(titles.indexOf('사용자')).toBeLessThan(titles.indexOf('팀'))
    expect(titles.indexOf('팀')).toBeLessThan(titles.indexOf('회원'))
    expect(items).toContainEqual({ value: 'member', title: '회원' })
  })
})

describe('diffAuditMeta', () => {
  it('meta 가 없으면 아무것도 없다', () => {
    expect(diffAuditMeta(null, M.absent)).toEqual({
      hasDiff: false,
      changes: [],
      masked: [],
      rest: null,
    })
    expect(diffAuditMeta(undefined, M.absent).rest).toBeNull()
  })

  it('before · after 없이 다른 키만 — 기타 기록', () => {
    expect(diffAuditMeta({ rotated: true }, M.absent)).toEqual({
      hasDiff: false,
      changes: [],
      masked: [],
      rest: { rotated: true },
    })
  })

  it('바뀐 항목만 — 같은 값은 빼고, 문자열이 아니면 JSON, 나머지 키는 rest', () => {
    const diff = diffAuditMeta(
      {
        before: { roleName: '상담원', isDefault: false, permissions: ['a'] },
        after: { roleName: '상담 매니저', isDefault: false, permissions: ['a', 'b'] },
        clearedDefaults: ['상담원 기본'],
      },
      M.absent,
    )
    expect(diff.hasDiff).toBe(true)
    expect(diff.changes).toEqual([
      { key: 'roleName', before: '상담원', after: '상담 매니저' },
      { key: 'permissions', before: '["a"]', after: '["a","b"]' },
    ])
    expect(diff.rest).toEqual({ clearedDefaults: ['상담원 기본'] })
  })

  it('만들기 · 삭제 — 한쪽에 없는 키는 (없음)', () => {
    expect(
      diffAuditMeta({ before: {}, after: { cidr: '203.0.113.0/24' } }, M.absent).changes,
    ).toEqual([{ key: 'cidr', before: '(없음)', after: '203.0.113.0/24' }])
    expect(diffAuditMeta({ before: { cidr: '0.0.0.0/0' }, after: {} }, M.absent).changes).toEqual([
      { key: 'cidr', before: '0.0.0.0/0', after: '(없음)' },
    ])
  })

  it('🔴 가린 값(***)은 표에서 빼고 이름만 모은다', () => {
    const diff = diffAuditMeta(
      { before: { apiSecret: '***', memo: 'a' }, after: { apiSecret: '***', memo: 'b' } },
      M.absent,
    )
    expect(diff.masked).toEqual(['apiSecret'])
    expect(diff.changes).toEqual([{ key: 'memo', before: 'a', after: 'b' }])
  })

  it('같은 값뿐이면 hasDiff 는 참, 바뀐 항목은 없다', () => {
    const diff = diffAuditMeta({ before: { a: 1 }, after: { a: 1 } }, M.absent)
    expect(diff).toEqual({ hasDiff: true, changes: [], masked: [], rest: null })
  })

  it('객체가 아닌 meta · 객체가 아닌 before 는 통째로 기타 기록 — 던지지 않는다', () => {
    expect(diffAuditMeta([1, 2], M.absent)).toEqual({
      hasDiff: false,
      changes: [],
      masked: [],
      rest: [1, 2],
    })
    expect(diffAuditMeta('x', M.absent).rest).toBe('x')
    expect(diffAuditMeta({ before: [1], after: [2] }, M.absent)).toEqual({
      hasDiff: false,
      changes: [],
      masked: [],
      rest: { before: [1], after: [2] },
    })
    // 서버의 64 KiB 자리표시
    expect(diffAuditMeta({ _truncated: true, bytes: 70000 }, M.absent).rest).toEqual({
      _truncated: true,
      bytes: 70000,
    })
  })

  it('metaJson — 들여쓴 JSON, bigint 가 섞여도 던지지 않는다', () => {
    expect(metaJson({ a: 1 })).toBe('{\n  "a": 1\n}')
    expect(() => metaJson({ n: 1n })).not.toThrow()
  })
})

describe('입력값', () => {
  it('비었는가 · 같은가 · 앞뒤 공백 떼기', () => {
    expect(isEmptyAuditLogDraft(emptyAuditLogDraft())).toBe(true)
    expect(isEmptyAuditLogDraft(draft({ action: 'auth.' }))).toBe(false)
    expect(sameAuditLogDraft(draft({ action: 'auth.' }), draft({ action: 'auth.' }))).toBe(true)
    expect(sameAuditLogDraft(draft({ action: 'auth.' }), draft({ action: 'auth.login.' }))).toBe(
      false,
    )
    expect(normalizeAuditLogDraft(draft({ targetRefNo: ' 3 ', actorUserNo: '12 ' }))).toEqual(
      draft({ targetRefNo: '3', actorUserNo: '12' }),
    )
  })

  it('검증 — 번호 형식 · 날짜 형식 · 기간 역전, 같은 날 · 한쪽만은 정상', () => {
    expect(auditFilterProblem(draft(), M)).toBeNull()
    expect(auditFilterProblem(draft({ actorUserNo: 'abc' }), M)).toBe(M.actorRefInvalid)
    expect(auditFilterProblem(draft({ actorUserNo: '1'.repeat(21) }), M)).toBe(M.actorRefInvalid)
    expect(auditFilterProblem(draft({ targetRefNo: '1.5' }), M)).toBe(M.targetRefInvalid)
    expect(auditFilterProblem(draft({ from: '2026-02-30' }), M)).toBe(M.dateInvalid)
    expect(auditFilterProblem(draft({ from: '2026-10-18', to: '2026-10-01' }), M)).toBe(
      M.rangeReversed,
    )
    expect(auditFilterProblem(draft({ from: '2026-10-18', to: '2026-10-18' }), M)).toBeNull()
    expect(auditFilterProblem(draft({ to: '2026-10-18' }), M)).toBeNull()
  })

  it('서버 필터 — 빈 칸은 키째 빠지고, 번호는 bigint, 날짜는 반열림 ISO', () => {
    expect(toAuditFilter(emptyAuditLogDraft())).toEqual({})
    const filter = toAuditFilter(
      draft({
        actorUserNo: '12',
        action: 'org.role.',
        targetType: 'role',
        targetRefNo: '3',
        from: '2026-10-01',
        to: '2026-10-18',
      }),
    )
    expect(filter).toEqual({
      actorUserNo: 12n,
      action: 'org.role.',
      actionMatch: 'prefix',
      targetType: 'role',
      targetRefNo: 3n,
      from: localMidnight(2026, 10, 1),
      to: localMidnight(2026, 10, 19),
    })
    expect(Object.keys(toAuditFilter(draft({ action: 'auth.logout' })))).toEqual([
      'action',
      'actionMatch',
    ])
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/audit/audit-log.test.ts`
Expected: FAIL — `./audit-log.js` 를 찾지 못함.

- [ ] **Step 3: 구현한다**

`packages/admin-ui/src/components/audit/audit-log.ts`:

```ts
import type { AdminAuditLog, AuditCatalog } from '@ssworks/admin-shared'
import { isDateOnly, localDayStartIso, localNextDayStartIso } from '../../utils/local-date.js'

// 감사 로그 화면의 타입 · 문구 · 순수 함수 — `useAuditLogs` 와 `AuditLogViewer` 가 함께 쓴다(3f 스펙 C1).
//
// 정본: hangang-home apps/admin/src/pages/settings/audit-logs-messages.ts
// 바꾼 점:
//  - 행위자는 `actorUserNo`(null = 계정을 특정할 수 없음)다. hangang 의 `principalRefNo = 0` 익명이 없다.
//  - 묶음 목록을 고정 표(`AUDIT_ACTION_GROUPS`)가 아니라 코어 기본 + 옵션으로 둔다(A5). 걸리는 액션이 둘 이상인 묶음만 항목이 된다.
//  - 묶음 값은 끝에 점을 붙이고, 값 하나로 prefix · exact 를 나른다(A4). hangang 은 `prefix:` · `exact:` 머리를 붙였다.
//  - 결과는 칩 + 글자(crm 칩 · hangang 글자). 문구는 `messages` 부분 덮어쓰기로 바꾼다(C2).
//  - 조회 오류 문구 해석(`resolveAuditLogsMessage`)은 옮기지 않는다 — 전역 토스트 몫이다(C7).

export interface AuditActorOption {
  userNo: bigint
  userId: string
  userName: string
  /** 퇴사자면 항목에 " · 퇴사" 를 붙인다 */
  resigned?: boolean
}

/** prefix 는 끝 점 없이('org.role'). 보낼 때 'org.role.' 로 만든다(A4) */
export interface AuditActionGroup {
  prefix: string
  label: string
}

/** 서버 `filter` 모양 그대로 — `useServerTable` 의 `filters()` 가 적용값에서 만든다 */
export interface AuditLogFilter {
  actorUserNo?: bigint
  action?: string
  actionMatch?: 'prefix' | 'exact'
  targetType?: string
  targetRefNo?: bigint
  from?: string
  to?: string
}

/** 칸 값은 모두 문자열이다 — '' = 전체(A1) */
export interface AuditLogDraft {
  actorUserNo: string
  action: string
  targetType: string
  targetRefNo: string
  from: string
  to: string
}

export interface AuditFilterItem {
  value: string
  title: string
}

export type AuditResultKind = 'success' | 'redirect' | 'denied' | 'error'

export interface AuditLogMessages {
  readOnlyNote: string
  periodHint: string
  actionHint: string
  fixedSortLabel: string
  total: (count: number) => string
  actorLabel: string
  actorNumberLabel: string
  actionLabel: string
  targetTypeLabel: string
  targetRefNoLabel: string
  fromLabel: string
  toLabel: string
  allPlaceholder: string
  numberPlaceholder: string
  apply: string
  reset: string
  actorNoPermissionHint: string
  actorSearchHint: string
  actorSearchEmpty: string
  actorSearchFailed: string
  resigned: string
  actorRefInvalid: string
  targetRefInvalid: string
  dateInvalid: string
  rangeReversed: string
  columnCreateAt: string
  columnActor: string
  columnAction: string
  columnTarget: string
  columnResult: string
  columnIp: string
  noActor: string
  unknownAccount: (actorUserNo: bigint) => string
  filterByActor: string
  filterByActorLabel: (actor: string) => string
  resultSuccess: string
  resultRedirect: string
  resultDenied: string
  resultError: string
  expand: string
  collapse: string
  expandLabel: (when: string, action: string, expanded: boolean) => string
  changesTitle: string
  changeField: string
  changeBefore: string
  changeAfter: string
  noChanges: string
  absent: string
  masked: (keys: readonly string[]) => string
  restTitle: string
  nothingRecorded: string
  requestLabel: string
  sessionLabel: (sessionNo: bigint) => string
  userAgentLabel: string
  emptyTitle: string
  filteredEmptyTitle: string
  loadFailed: string
  retry: string
  actionGroupItem: (label: string, prefix: string) => string
  actionItem: (label: string, action: string) => string
}

export const DEFAULT_AUDIT_LOG_MESSAGES: Readonly<AuditLogMessages> = Object.freeze({
  readOnlyNote: '읽기 전용 기록입니다. 삭제 · 수정할 수 없습니다.',
  periodHint: '기간은 이 컴퓨터의 시간대 기준이고, 끝 날짜의 하루 전체를 포함합니다.',
  actionHint: '[묶음]은 그 계열 전체를, 나머지는 그 동작 하나만 찾습니다.',
  fixedSortLabel: '정렬: 최신순(고정)',
  total: (count: number) => `총 ${count.toLocaleString('ko-KR')}건`,
  actorLabel: '행위자',
  actorNumberLabel: '행위자 번호',
  actionLabel: '동작',
  targetTypeLabel: '대상 종류',
  targetRefNoLabel: '대상 번호',
  fromLabel: '시작 날짜',
  toLabel: '끝 날짜',
  allPlaceholder: '전체',
  numberPlaceholder: '숫자만',
  apply: '적용',
  reset: '초기화',
  actorNoPermissionHint: '행위자 목록을 볼 권한이 없어 번호로 찾습니다.',
  actorSearchHint: '이름이나 아이디를 입력하세요.',
  actorSearchEmpty: '맞는 사람이 없습니다.',
  actorSearchFailed: '검색하지 못했습니다. 다시 입력해 보세요.',
  resigned: ' · 퇴사',
  actorRefInvalid: '행위자 번호는 숫자만 넣을 수 있습니다.',
  targetRefInvalid: '대상 번호는 숫자만 넣을 수 있습니다.',
  dateInvalid: '날짜는 YYYY-MM-DD 형식이어야 합니다.',
  rangeReversed: '시작 날짜가 끝 날짜보다 늦습니다. 기간을 고친 뒤 적용하세요.',
  columnCreateAt: '시각',
  columnActor: '행위자',
  columnAction: '동작',
  columnTarget: '대상',
  columnResult: '결과',
  columnIp: 'IP',
  noActor: '계정 없음',
  unknownAccount: (actorUserNo: bigint) => `#${actorUserNo} (계정 정보 없음)`,
  filterByActor: '이 사람 기록만',
  filterByActorLabel: (actor: string) => `${actor} 기록만 보기`,
  resultSuccess: '성공',
  resultRedirect: '이동',
  resultDenied: '거부',
  resultError: '서버 오류',
  expand: '내역',
  collapse: '접기',
  expandLabel: (when: string, action: string, expanded: boolean) =>
    `${when} ${action} ${expanded ? '내역 접기' : '내역 보기'}`,
  changesTitle: '바뀐 항목',
  changeField: '항목',
  changeBefore: '전',
  changeAfter: '후',
  noChanges: '바뀐 항목 없음',
  absent: '(없음)',
  masked: (keys: readonly string[]) => `가려진 항목: ${keys.join(', ')} — 값은 표시하지 않습니다`,
  restTitle: '기타 기록',
  nothingRecorded: '기록된 변경 내역이 없습니다',
  requestLabel: '요청',
  sessionLabel: (sessionNo: bigint) => `세션 #${sessionNo}`,
  userAgentLabel: 'User-Agent',
  emptyTitle: '아직 기록이 없습니다',
  filteredEmptyTitle: '조건에 맞는 기록이 없습니다',
  loadFailed: '감사 로그를 불러오지 못했습니다.',
  retry: '다시 시도',
  actionGroupItem: (label: string, prefix: string) => `[묶음] ${label} (${prefix}.*)`,
  // 라벨이 코드와 같으면(카탈로그 밖 코드) 한 번만 적는다
  actionItem: (label: string, action: string) =>
    label === action ? action : `${label} (${action})`,
})

// ── 입력값 ───────────────────────────────────────────────────────────

const DRAFT_KEYS = [
  'actorUserNo',
  'action',
  'targetType',
  'targetRefNo',
  'from',
  'to',
] as const satisfies readonly (keyof AuditLogDraft)[]

export function emptyAuditLogDraft(): AuditLogDraft {
  return { actorUserNo: '', action: '', targetType: '', targetRefNo: '', from: '', to: '' }
}

/** 칸마다 앞뒤 공백을 뗀다 — 번호 칸의 " 3 " 이 형식 오류가 되지 않게 */
export function normalizeAuditLogDraft(draft: AuditLogDraft): AuditLogDraft {
  const out = emptyAuditLogDraft()
  for (const key of DRAFT_KEYS) out[key] = draft[key].trim()
  return out
}

export function isEmptyAuditLogDraft(draft: AuditLogDraft): boolean {
  return DRAFT_KEYS.every((key) => draft[key] === '')
}

export function sameAuditLogDraft(a: AuditLogDraft, b: AuditLogDraft): boolean {
  return DRAFT_KEYS.every((key) => a[key] === b[key])
}

/** 서버 `queryBigIntSchema` 와 같은 폭(부호 없는 20자리) */
const UNSIGNED_DIGITS = /^[0-9]{1,20}$/

/** 형식 오류 문구, 없으면 null(A3). 기간은 같은 날이 정상이고 한쪽만 있어도 된다 */
export function auditFilterProblem(
  draft: AuditLogDraft,
  messages: AuditLogMessages,
): string | null {
  if (draft.actorUserNo !== '' && !UNSIGNED_DIGITS.test(draft.actorUserNo)) {
    return messages.actorRefInvalid
  }
  if (draft.targetRefNo !== '' && !UNSIGNED_DIGITS.test(draft.targetRefNo)) {
    return messages.targetRefInvalid
  }
  if (
    (draft.from !== '' && !isDateOnly(draft.from)) ||
    (draft.to !== '' && !isDateOnly(draft.to))
  ) {
    return messages.dateInvalid
  }
  // `YYYY-MM-DD` 는 자릿수가 고정이라 문자열 비교가 곧 날짜 비교다
  if (draft.from !== '' && draft.to !== '' && draft.from > draft.to) return messages.rangeReversed
  return null
}

/** 적용값 → 서버 필터. 빈 칸은 키째 뺀다 — 필터 키가 흔들리지 않고 `isFiltered` 기본 판정이 맞는다 */
export function toAuditFilter(applied: AuditLogDraft): AuditLogFilter {
  const filter: AuditLogFilter = {}
  if (UNSIGNED_DIGITS.test(applied.actorUserNo)) filter.actorUserNo = BigInt(applied.actorUserNo)
  const action = toActionFilter(applied.action)
  if (action != null) {
    filter.action = action.action
    filter.actionMatch = action.actionMatch
  }
  if (applied.targetType !== '') filter.targetType = applied.targetType
  if (UNSIGNED_DIGITS.test(applied.targetRefNo)) filter.targetRefNo = BigInt(applied.targetRefNo)
  const from = applied.from === '' ? null : localDayStartIso(applied.from)
  if (from != null) filter.from = from
  // 🔴 끝 날짜의 하루 전체를 포함한다 — 다음 날 0시를 보내고 서버가 `<` 로 비교한다(A7)
  const to = applied.to === '' ? null : localNextDayStartIso(applied.to)
  if (to != null) filter.to = to
  return filter
}

// ── 셀 표기 ──────────────────────────────────────────────────────────

export function auditResultOf(status: number): AuditResultKind {
  if (status >= 500) return 'error'
  if (status >= 400) return 'denied'
  if (status >= 300) return 'redirect'
  return 'success'
}

const RESULT_TEXT_KEY = {
  success: 'resultSuccess',
  redirect: 'resultRedirect',
  denied: 'resultDenied',
  error: 'resultError',
} as const satisfies Record<AuditResultKind, keyof AuditLogMessages>

/** 🔴 숫자와 글자를 함께 낸다 — 색으로만 가르면 렌더 테스트가 못 재고 색각 이상에도 안 보인다(hangang) */
export function auditResultText(status: number, messages: AuditLogMessages): string {
  return `${status} · ${messages[RESULT_TEXT_KEY[auditResultOf(status)]]}`
}

export function actorText(
  row: Pick<AdminAuditLog, 'actorUserNo' | 'actorUserId' | 'actorUserName'>,
  messages: AuditLogMessages,
): string {
  if (row.actorUserName != null || row.actorUserId != null) {
    return `${row.actorUserName ?? '—'} (${row.actorUserId ?? '—'})`
  }
  // users FK 가 없어 계정이 지워져도 행은 남는다 — 번호만 아는 행
  if (row.actorUserNo != null) return messages.unknownAccount(row.actorUserNo)
  return messages.noActor
}

export function actorOptionTitle(option: AuditActorOption, messages: AuditLogMessages): string {
  return `${option.userName} (${option.userId})${option.resigned === true ? messages.resigned : ''}`
}

/** 🔴 카탈로그에 없는 종류는 코드 그대로 낸다(`targetLabelOf` 가 그렇게 한다) — 등재 누락을 감추지 않는다 */
export function targetText(
  row: Pick<AdminAuditLog, 'targetType' | 'targetRefNo'>,
  catalog: AuditCatalog,
): string {
  if (row.targetType == null) return '—'
  const label = catalog.targetLabelOf(row.targetType)
  return row.targetRefNo == null ? label : `${label} #${row.targetRefNo}`
}

// ── 필터 항목 ────────────────────────────────────────────────────────

export const CORE_AUDIT_ACTION_GROUPS: readonly AuditActionGroup[] = Object.freeze([
  { prefix: 'auth', label: '인증' },
  { prefix: 'auth.login', label: '로그인' },
  { prefix: 'session', label: '세션' },
  { prefix: 'org.role', label: '역할' },
  { prefix: 'org.user', label: '사용자' },
  { prefix: 'org.team', label: '팀' },
  { prefix: 'setting', label: '설정' },
])

/** 코어 묶음 뒤에 프로젝트 묶음을 더한다. prefix 가 같으면 라벨만 덮는다. 끝 점은 떼고 받는다 */
export function mergeActionGroups(extra: readonly AuditActionGroup[] = []): AuditActionGroup[] {
  const merged = CORE_AUDIT_ACTION_GROUPS.map((group) => ({ ...group }))
  for (const group of extra) {
    const prefix = group.prefix.replace(/[.]+$/, '')
    const existing = merged.find((item) => item.prefix === prefix)
    if (existing != null) existing.label = group.label
    else merged.push({ prefix, label: group.label })
  }
  return merged
}

/**
 * 동작 항목 — 묶음이 먼저, 개별은 카탈로그 순서.
 * 🔴 묶음 값은 끝에 점을 붙인다(`org.role.`). 서버 prefix 는 `LIKE 'x%'` 라 점이 없으면 이웃 코드를 잡을 수 있다(A4).
 * 🔴 걸리는 액션이 둘 이상인 묶음만 항목이 된다 — 한 줄짜리 묶음은 개별 항목과 같다(A5).
 */
export function buildActionOptions(
  catalog: AuditCatalog,
  groups: readonly AuditActionGroup[],
  messages: AuditLogMessages,
): AuditFilterItem[] {
  const groupItems = groups
    .filter(
      (group) =>
        catalog.ACTION_VALUES.filter((action) => action.startsWith(`${group.prefix}.`)).length >= 2,
    )
    .map((group) => ({
      value: `${group.prefix}.`,
      title: messages.actionGroupItem(group.label, group.prefix),
    }))
  const actionItems = catalog.ACTION_VALUES.map((action) => ({
    value: action,
    title: messages.actionItem(catalog.labelOf(action), action),
  }))
  return [...groupItems, ...actionItems]
}

/**
 * 칸 값 → 서버 질의 둘. 끝이 점이면 묶음(prefix), 아니면 개별(exact).
 * 🔴 `session.revoke` 는 `session.revoke.user` 의 접두다 — 개별을 prefix 로 보내면 오류 없이 엉뚱한 행이 섞인다(hangang).
 */
export function toActionFilter(
  value: string,
): { action: string; actionMatch: 'prefix' | 'exact' } | null {
  if (value === '') return null
  return { action: value, actionMatch: value.endsWith('.') ? 'prefix' : 'exact' }
}

/** 대상 종류 — 라벨 가나다순. 값은 서버가 등가 비교하는 코드 그대로 */
export function targetOptions(catalog: AuditCatalog): AuditFilterItem[] {
  return catalog.TARGET_VALUES.map((value) => ({
    value,
    title: catalog.targetLabelOf(value),
  })).sort((a, b) => a.title.localeCompare(b.title, 'ko'))
}

// ── meta — 바뀐 항목만 전/후로 ───────────────────────────────────────

/** 서버가 쓸 때 가린 값. 🔴 화면은 풀거나 추측하지 않는다 */
export const MASKED_VALUE = '***'

export interface AuditMetaChange {
  key: string
  before: string
  after: string
}

export interface AuditMetaDiff {
  /** before · after 중 하나라도 객체로 실려 있었다 — 변경 내역을 남긴 행이다 */
  hasDiff: boolean
  /** 값이 달라진 항목만 */
  changes: AuditMetaChange[]
  /** 🔴 가린 항목 — 값이 `***` 라 바뀜을 판정할 수 없다. 이름만 낸다 */
  masked: string[]
  /** before · after 밖의 meta. 객체가 아닌 meta 는 통째로. 없으면 null */
  rest: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function show(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/** 기타 기록 표시용 JSON — 던지지 않는다(bigint 등은 문자열로) */
export function metaJson(value: unknown): string {
  try {
    return JSON.stringify(
      value,
      (_key, item: unknown) => (typeof item === 'bigint' ? String(item) : item),
      2,
    )
  } catch {
    return String(value)
  }
}

/**
 * 정본 hangang `diffMeta`. 킷 서버의 `attachAuditDiff` 가 같은 구조(`before` · `after` 평평한 객체 + 다른 키)를 쓴다(스펙 §9).
 * 객체가 아닌 meta(배열 · 문자열)와 객체가 아닌 before · after 는 기타 기록으로 남긴다 — 정보를 버리지 않는다.
 */
export function diffAuditMeta(meta: unknown, absent: string): AuditMetaDiff {
  if (meta === null || meta === undefined)
    return { hasDiff: false, changes: [], masked: [], rest: null }
  const record = asRecord(meta)
  if (record == null) return { hasDiff: false, changes: [], masked: [], rest: meta }

  const before = asRecord(record.before)
  const after = asRecord(record.after)
  const others = Object.fromEntries(
    Object.entries(record).filter(
      ([key, value]) => !((key === 'before' || key === 'after') && asRecord(value) != null),
    ),
  )
  const rest = Object.keys(others).length === 0 ? null : others
  if (before == null && after == null) return { hasDiff: false, changes: [], masked: [], rest }

  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])]
  const changes: AuditMetaChange[] = []
  const masked: string[] = []
  for (const key of keys) {
    const b = before != null && Object.hasOwn(before, key) ? show(before[key]) : absent
    const a = after != null && Object.hasOwn(after, key) ? show(after[key]) : absent
    if (b === MASKED_VALUE || a === MASKED_VALUE) {
      masked.push(key)
      continue
    }
    if (b !== a) changes.push({ key, before: b, after: a })
  }
  return { hasDiff: true, changes, masked, rest }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/audit/audit-log.test.ts`
Expected: PASS

- [ ] **Step 5: peer 하한을 올린다**

`packages/admin-ui/package.json` 의 `peerDependencies` 에서 한 줄만 바꾼다:

```json
    "@ssworks/admin-shared": "workspace:>=0.4.0 <1.0.0",
```

(`devDependencies` 의 `"@ssworks/admin-shared": "workspace:*"` 는 그대로 둔다.)

`packages/admin-ui/README.md` "## Peer 의존" 표의 머리 바로 아래(`vue` 행 위)에 행을 더한다:

```md
| `@ssworks/admin-shared` | 예 | `>=0.4.0 <1.0.0` — 감사 카탈로그 · 오류 코드 · 스키마. 세 패키지를 같은 번호로 설치한다 |
```

`.changeset/README.md` "0.x 동안의 peer 범위" 표의 admin-ui 행을 바꾼다:

```md
| admin-ui | `workspace:>=0.4.0 <1.0.0` | `>=0.4.0 <1.0.0` |
```

같은 절의 문장 "admin-ui 는 0.2.0 · 0.3.0 이 이미 `^0` 으로 나갔다 — 같은 규칙이 필요해지면 그때 하한을 둔다." 를 이것으로 바꾼다:

```md
**admin-ui 의 하한**도 같은 규칙이다 — PR #3f(감사 로그 화면)부터 `>=0.4.0` 이다. `coreAuditCatalog` 를 런타임에 쓰기 때문이다. 그 전 판(0.2.0 ~ 0.5.0)은 `^0` 으로 나갔다.
```

Run: `pnpm install` (lockfile 이 바뀌면 함께 커밋한다)
Run: `pnpm exec prettier --write packages/admin-ui/README.md .changeset/README.md` 를 두 번, 그다음 `pnpm exec prettier --check packages/admin-ui/README.md .changeset/README.md`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 6: 타입 · 전체 테스트를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui typecheck && pnpm --filter @ssworks/admin-ui test`
Expected: 둘 다 통과. `peer-deps.test.ts` 는 admin-shared 가 peer 에 있으니 그대로 초록이다.

- [ ] **Step 7: 커밋한다**

```bash
git add packages/admin-ui/src/components/audit/audit-log.ts packages/admin-ui/src/components/audit/audit-log.test.ts packages/admin-ui/package.json packages/admin-ui/README.md .changeset/README.md pnpm-lock.yaml
git commit -m "feat(admin-ui): 감사 로그 순수 함수(묶음 prefix · diff · 필터 변환) · peer admin-shared 하한 0.4.0" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`pnpm-lock.yaml` 이 바뀌지 않았으면 `git add` 목록에서 뺀다.)

---

### Task 3: 서버 검색 자동완성 공통 흐름 `useRemoteSearch`(내부)

**Files:**

- Create: `packages/admin-ui/src/composables/useRemoteSearch.ts`
- Create: `packages/admin-ui/src/composables/useRemoteSearch.test.ts`

**Interfaces:**

- Consumes: `ApiError`(`../api/error.js`)
- Produces:
  - `REMOTE_SEARCH_DEBOUNCE_MS = 300`
  - `interface RemoteSearch<T> { items: Readonly<Ref<readonly T[]>>; searching: Readonly<Ref<boolean>>; failed: Readonly<Ref<boolean>>; search: (keyword: string) => void }`
  - `useRemoteSearch<T>(fetch: (keyword: string) => Promise<readonly T[]>): RemoteSearch<T>` — 3g `searchUsers` 도 이것을 쓴다. index 에서 내보내지 않는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-ui/src/composables/useRemoteSearch.test.ts`:

```ts
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import { ApiError } from '../api/error.js'
import { REMOTE_SEARCH_DEBOUNCE_MS, useRemoteSearch, type RemoteSearch } from './useRemoteSearch.js'

// 정본: hangang-home audit-logs.vue `requestSeq`(응답 경합)를 검색에 옮긴 것을 잰다(3f 스펙 C8).

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let scope: EffectScope

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  scope = effectScope()
})

afterEach(() => {
  scope.stop()
  vi.useRealTimers()
})

function setup<T>(fetch: (keyword: string) => Promise<readonly T[]>): RemoteSearch<T> {
  return scope.run(() => useRemoteSearch(fetch))!
}

describe('useRemoteSearch', () => {
  it('300ms 안의 입력은 마지막 것 하나로 부른다 — 앞뒤 공백은 뗀다', async () => {
    const fetch = vi.fn(async (keyword: string) => [keyword])
    const search = setup(fetch)
    search.search('김')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS - 1)
    search.search(' 김운 ')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS - 1)
    expect(fetch).not.toHaveBeenCalled()
    expect(search.searching.value).toBe(true)
    vi.advanceTimersByTime(1)
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('김운')
    expect(search.items.value).toEqual(['김운'])
    expect(search.searching.value).toBe(false)
  })

  it('빈 검색어는 부르지 않고 목록을 비운다', async () => {
    const fetch = vi.fn(async () => ['x'])
    const search = setup(fetch)
    search.search('x')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    search.search('   ')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(search.items.value).toEqual([])
    expect(search.searching.value).toBe(false)
  })

  it('같은 검색어를 다시 알려도 다시 부르지 않는다', async () => {
    const fetch = vi.fn(async () => ['x'])
    const search = setup(fetch)
    search.search('김')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    search.search('김 ')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('🔴 늦게 온 앞 응답은 버린다', async () => {
    const first = deferred<readonly string[]>()
    const second = deferred<readonly string[]>()
    const fetch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const search = setup<string>(fetch)
    search.search('김')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    search.search('이')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    second.resolve(['이'])
    await flushPromises()
    first.resolve(['김'])
    await flushPromises()
    expect(search.items.value).toEqual(['이'])
    expect(search.searching.value).toBe(false)
  })

  it('실패하면 failed · 목록 비움 · 🔴 처리됨 표시(칸이 문구를 보인다)', async () => {
    const error = new ApiError('x', { status: 500, raw: null })
    const fetch = vi.fn(async () => {
      throw error
    })
    const search = setup<string>(fetch)
    search.search('김')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    expect(search.failed.value).toBe(true)
    expect(search.items.value).toEqual([])
    expect(search.searching.value).toBe(false)
    expect(error.handled).toBe(true)
    // 다음 입력이 실패 표시를 내린다
    search.search('이')
    expect(search.failed.value).toBe(false)
  })

  it('해제 뒤에는 부르지 않고, 날아오던 응답도 버린다', async () => {
    const pending = deferred<readonly string[]>()
    const fetch = vi.fn().mockReturnValueOnce(pending.promise)
    const search = setup<string>(fetch)
    search.search('김')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    search.search('이')
    scope.stop()
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    pending.resolve(['김'])
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(search.items.value).toEqual([])
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useRemoteSearch.test.ts`
Expected: FAIL — `./useRemoteSearch.js` 를 찾지 못함.

- [ ] **Step 3: 구현한다**

`packages/admin-ui/src/composables/useRemoteSearch.ts`:

```ts
import { getCurrentScope, onScopeDispose, ref, shallowRef, type Ref } from 'vue'
import { ApiError } from '../api/error.js'

// 서버 검색 자동완성의 공통 흐름 — 감사 행위자(3f) · IP 대상 사용자(3g)가 같은 규칙을 쓴다(3f 스펙 C8). 패키지 내부용.
//
// 정본: hangang-home apps/admin/src/pages/settings/audit-logs.vue `requestSeq`(늦은 응답 버림)
// 바꾼 점: 디바운스 · 빈 검색어 생략 · 같은 검색어 생략 · 실패를 처리됨으로(칸이 문구를 보인다 — C7) · 스코프 해제 정리.

export const REMOTE_SEARCH_DEBOUNCE_MS = 300

export interface RemoteSearch<T> {
  items: Readonly<Ref<readonly T[]>>
  searching: Readonly<Ref<boolean>>
  failed: Readonly<Ref<boolean>>
  /** 검색어가 바뀔 때 부른다(`VAutocomplete` 의 `update:search`) */
  search: (keyword: string) => void
}

export function useRemoteSearch<T>(
  fetch: (keyword: string) => Promise<readonly T[]>,
): RemoteSearch<T> {
  const items = shallowRef<readonly T[]>([])
  const searching = ref(false)
  const failed = ref(false)
  let seq = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let lastKeyword: string | null = null

  async function run(keyword: string, mine: number): Promise<void> {
    try {
      const result = await fetch(keyword)
      if (mine !== seq || disposed) return
      items.value = result
    } catch (error) {
      if (mine !== seq || disposed) return
      // 🔴 칸이 문구를 보인다 — 전역 토스트로 두 번 알리지 않는다. catch 의 동기 구간에서 세운다(ApiError.handled).
      if (error instanceof ApiError) error.handled = true
      items.value = []
      failed.value = true
    } finally {
      if (mine === seq && !disposed) searching.value = false
    }
  }

  function search(keyword: string): void {
    const trimmed = keyword.trim()
    // VAutocomplete 는 포커스 · 선택 때 같은 검색어를 여러 번 알린다
    if (trimmed === lastKeyword) return
    lastKeyword = trimmed
    clearTimeout(timer)
    timer = undefined
    // 🔴 순번은 빈 검색어에서도 올린다 — 날아오던 응답이 비운 목록을 다시 채우지 못하게
    const mine = ++seq
    failed.value = false
    if (trimmed === '') {
      items.value = []
      searching.value = false
      return
    }
    searching.value = true
    timer = setTimeout(() => {
      timer = undefined
      if (!disposed) void run(trimmed, mine)
    }, REMOTE_SEARCH_DEBOUNCE_MS)
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
      clearTimeout(timer)
    })
  }

  return { items, searching, failed, search }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useRemoteSearch.test.ts`
Expected: PASS(6 tests)

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-ui/src/composables/useRemoteSearch.ts packages/admin-ui/src/composables/useRemoteSearch.test.ts
git commit -m "feat(admin-ui): 서버 검색 자동완성 공통 흐름 useRemoteSearch(디바운스 · 순번 · 해제)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `useAuditLogs` — 입력/적용 · 조회 · 행위자 · 펼침 · 바인딩

**Files:**

- Create: `packages/admin-ui/src/composables/useAuditLogs.ts`
- Create: `packages/admin-ui/src/composables/useAuditLogs.render.test.ts`

**Interfaces:**

- Consumes: Task 2 전부 · Task 3 `useRemoteSearch` · `useServerTable(options): ServerTable<R>`(`./useServerTable.js` — `items` · `total` · `page` · `itemsPerPage` · `loading` · `error` · `reload` · `flushUrl`) · admin-shared `coreAuditCatalog` · `AdminAuditLog` · `AuditCatalog`
- Produces:
  - `UseAuditLogsOptions<R extends AdminAuditLog = AdminAuditLog>` — `fetch` · `catalog?` · `actionGroups?` · `fieldLabels?` · `searchActors?` · `canSearchActors?` · `urlSync?`(Task 5 에서 쓴다 — 이 Task 에서는 받기만 하고 무시하지 않도록 아래 코드의 자리 표시를 둔다) · `itemsPerPage?` · `messages?` · `immediate?`
  - `AuditLogViewerBindings<R>` — 아래 코드의 키 그대로(Task 6 의 `AuditLogViewer` props · emits 와 1:1)
  - `AuditLogs<R>` — `draft` · `applied` · `filterError` · `apply()` · `reset()` · `filterByActor(row)` · `reload()` · `table` · `viewer`
  - `useAuditLogs<R>(options): AuditLogs<R>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-ui/src/composables/useAuditLogs.render.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { defineAuditCatalog, type AdminAuditLog } from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import {
  DEFAULT_AUDIT_LOG_MESSAGES as M,
  emptyAuditLogDraft,
  type AuditActorOption,
  type AuditLogDraft,
  type AuditLogFilter,
} from '../components/audit/audit-log.js'
import { REMOTE_SEARCH_DEBOUNCE_MS } from './useRemoteSearch.js'
import { useAuditLogs, type AuditLogs, type UseAuditLogsOptions } from './useAuditLogs.js'
import type { ServerTableParams } from './useServerTable.js'

// 정본: hangang-home apps/admin/src/pages/settings/audit-logs.render.test.ts(입력/적용 · 같은 조건 재적용 · 검증 실패 ·
//       권한 없으면 계정 목록 안 부름)를 composable 에 대고 잰다.

const log = (over: Partial<AdminAuditLog> = {}): AdminAuditLog => ({
  logNo: 1n,
  actorUserNo: 12n,
  actorUserId: 'ops01',
  actorUserName: '김운영',
  sessionNo: 4182n,
  action: 'org.role.update',
  targetType: 'role',
  targetRefNo: 3n,
  method: 'PATCH',
  path: '/admin/roles/3',
  statusCode: 200,
  errorCode: null,
  ip: '203.0.113.7',
  userAgent: 'Mozilla/5.0',
  meta: null,
  createAt: '2026-10-18T05:03:21.000Z',
  ...over,
})

type Fetch = (
  params: ServerTableParams<AuditLogFilter>,
) => Promise<{ items: AdminAuditLog[]; total: number }>

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function setup(over: Partial<UseAuditLogsOptions> = {}, rows: AdminAuditLog[] = [log()]) {
  const fetch = vi.fn<Fetch>(async () => ({ items: rows, total: rows.length }))
  let audit!: AuditLogs<AdminAuditLog>
  wrapper = mount(
    defineComponent({
      setup() {
        audit = useAuditLogs({ fetch, ...over })
        return () => h('div')
      },
    }),
  )
  await flushPromises()
  return { fetch, audit }
}

const lastParams = (fetch: { mock: { lastCall?: [ServerTableParams<AuditLogFilter>] } }) =>
  fetch.mock.lastCall?.[0]

function edit(audit: AuditLogs<AdminAuditLog>, patch: Partial<AuditLogDraft>): void {
  audit.viewer.value['onUpdate:draft']({ ...audit.draft.value, ...patch })
}

describe('useAuditLogs — 조회 · 입력/적용', () => {
  it('첫 조회 1번 — 정렬 createAt desc 를 늘 싣고 필터는 비었다', async () => {
    const { fetch } = await setup()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith({
      page: 1,
      itemsPerPage: 20,
      sortBy: ['createAt'],
      sortOrder: ['desc'],
      filter: {},
    })
  })

  it('🔴 입력 중에는 조회하지 않는다 — [적용]에 한 번', async () => {
    const { fetch, audit } = await setup()
    edit(audit, { targetType: 'role', targetRefNo: '3' })
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(audit.apply()).toBe(true)
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(lastParams(fetch)?.filter).toEqual({ targetType: 'role', targetRefNo: 3n })
  })

  it('🔴 같은 조건으로 다시 적용해도 다시 부른다(A2)', async () => {
    const { fetch, audit } = await setup()
    audit.apply()
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('같은 조건 재적용은 지금 쪽을 다시 부른다 — 1쪽으로 튀지 않는다', async () => {
    const { fetch, audit } = await setup()
    audit.viewer.value['onUpdate:page'](3)
    await flushPromises()
    audit.apply()
    await flushPromises()
    expect(lastParams(fetch)?.page).toBe(3)
  })

  it('조건이 바뀌면 1쪽부터', async () => {
    const { fetch, audit } = await setup()
    audit.viewer.value['onUpdate:page'](3)
    await flushPromises()
    edit(audit, { action: 'auth.' })
    audit.apply()
    await flushPromises()
    expect(lastParams(fetch)?.page).toBe(1)
    expect(lastParams(fetch)?.filter).toEqual({ action: 'auth.', actionMatch: 'prefix' })
  })

  it('검증 실패면 조회하지 않고 filterError — 입력값은 그대로, 고쳐 적용하면 내린다', async () => {
    const { fetch, audit } = await setup()
    edit(audit, { targetRefNo: 'abc' })
    expect(audit.apply()).toBe(false)
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(audit.filterError.value).toBe(M.targetRefInvalid)
    expect(audit.viewer.value.filterError).toBe(M.targetRefInvalid)
    expect(audit.draft.value.targetRefNo).toBe('abc')
    edit(audit, { targetRefNo: '3' })
    expect(audit.apply()).toBe(true)
    expect(audit.filterError.value).toBeNull()
  })

  it('앞뒤 공백을 떼고 적용한다', async () => {
    const { audit } = await setup()
    edit(audit, { targetRefNo: ' 3 ' })
    audit.apply()
    expect(audit.applied.value.targetRefNo).toBe('3')
    expect(audit.draft.value.targetRefNo).toBe('3')
  })

  it('[초기화] — 입력값 · 적용값을 비우고 다시 부른다', async () => {
    const { fetch, audit } = await setup()
    edit(audit, { action: 'auth.' })
    audit.apply()
    await flushPromises()
    audit.reset()
    await flushPromises()
    expect(audit.draft.value).toEqual(emptyAuditLogDraft())
    expect(audit.applied.value).toEqual(emptyAuditLogDraft())
    expect(lastParams(fetch)?.filter).toEqual({})
  })

  it('filtered 는 적용값 기준이다', async () => {
    const { audit } = await setup()
    expect(audit.viewer.value.filtered).toBe(false)
    edit(audit, { action: 'auth.' })
    expect(audit.viewer.value.filtered).toBe(false)
    audit.apply()
    expect(audit.viewer.value.filtered).toBe(true)
  })
})

describe('useAuditLogs — 이 사람 기록만 · 펼침', () => {
  it('행위자만 바꿔 바로 조회하고, 입력 중이던 다른 칸은 적용값으로 돌아간다(A10)', async () => {
    const { fetch, audit } = await setup()
    edit(audit, { action: 'org.role.' })
    audit.apply()
    await flushPromises()
    edit(audit, { targetRefNo: '9' })
    audit.filterByActor(log({ actorUserNo: 7n }))
    await flushPromises()
    expect(audit.applied.value).toEqual({
      ...emptyAuditLogDraft(),
      action: 'org.role.',
      actorUserNo: '7',
    })
    expect(audit.draft.value).toEqual(audit.applied.value)
    expect(lastParams(fetch)?.filter).toEqual({
      actorUserNo: 7n,
      action: 'org.role.',
      actionMatch: 'prefix',
    })
  })

  it('행위자가 없는 행은 무시한다', async () => {
    const { fetch, audit } = await setup()
    audit.filterByActor(log({ actorUserNo: null, actorUserId: null, actorUserName: null }))
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('적용하면 펼친 행을 비운다', async () => {
    const { audit } = await setup()
    audit.viewer.value['onUpdate:expanded'](['1'])
    expect(audit.viewer.value.expanded).toEqual(['1'])
    edit(audit, { action: 'auth.' })
    audit.apply()
    expect(audit.viewer.value.expanded).toEqual([])
  })
})

describe('useAuditLogs — 바인딩', () => {
  it('행 · 총 개수 · 쪽 넘기기', async () => {
    const rows = [log(), log({ logNo: 2n })]
    const { fetch, audit } = await setup({}, rows)
    expect(audit.viewer.value.rows).toEqual(rows)
    expect(audit.viewer.value.itemsLength).toBe(2)
    audit.viewer.value['onUpdate:itemsPerPage'](50)
    await flushPromises()
    expect(lastParams(fetch)?.itemsPerPage).toBe(50)
  })

  it('조회 실패 — loadFailed, [다시 시도]로 회복', async () => {
    const fetch = vi
      .fn<Fetch>()
      .mockRejectedValueOnce(new ApiError('x', { status: 500, raw: null }))
      .mockResolvedValue({ items: [log()], total: 1 })
    const { audit } = await setup({ fetch })
    expect(audit.viewer.value.loadFailed).toBe(true)
    audit.viewer.value.onRetry()
    await flushPromises()
    expect(audit.viewer.value.loadFailed).toBe(false)
    expect(audit.viewer.value.rows).toHaveLength(1)
  })

  it('카탈로그 · 프로젝트 묶음 · 대상 항목 · 문구 덮어쓰기', async () => {
    const catalog = defineAuditCatalog({
      actions: { POINT_ADJUST: 'members.points.adjust', POINT_GRANT: 'members.points.grant' },
      targets: { MEMBER: 'member' },
      labels: { 'members.points.adjust': '포인트 조정', 'members.points.grant': '포인트 지급' },
      targetLabels: { member: '회원' },
    })
    const { audit } = await setup({
      catalog,
      actionGroups: [{ prefix: 'members.points', label: '포인트' }],
      messages: { readOnlyNote: '바꾼 안내' },
      fieldLabels: { roleName: '역할 이름' },
    })
    const v = audit.viewer.value
    expect(v.actionItems).toContainEqual({
      value: 'members.points.',
      title: '[묶음] 포인트 (members.points.*)',
    })
    expect(v.targetItems).toContainEqual({ value: 'member', title: '회원' })
    expect(v.messages.readOnlyNote).toBe('바꾼 안내')
    expect(v.messages.apply).toBe('적용')
    expect(v.fieldLabels).toEqual({ roleName: '역할 이름' })
    expect(v.catalog).toBe(catalog)
  })
})

describe('useAuditLogs — 행위자 칸(A8 · A9)', () => {
  const OPTIONS: AuditActorOption[] = [
    { userNo: 12n, userId: 'ops01', userName: '김운영' },
    { userNo: 30n, userId: 'old03', userName: '이퇴사', resigned: true },
  ]

  it('어댑터가 없으면 번호 모드 · 안내 없음', async () => {
    const { audit } = await setup()
    expect(audit.viewer.value.actorMode).toBe('number')
    expect(audit.viewer.value.actorHint).toBeNull()
  })

  it('🔴 권한 게터가 거짓이면 번호 모드 · 안내 · 어댑터를 부르지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const searchActors = vi.fn(async () => OPTIONS)
    const { audit } = await setup({ searchActors, canSearchActors: () => false })
    expect(audit.viewer.value.actorMode).toBe('number')
    expect(audit.viewer.value.actorHint).toBe(M.actorNoPermissionHint)
    audit.viewer.value.onSearchActors('김')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    expect(searchActors).not.toHaveBeenCalled()
  })

  it('검색 모드 — 300ms 뒤 부르고 항목을 만든다(퇴사 표시)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const searchActors = vi.fn(async () => OPTIONS)
    const { audit } = await setup({ searchActors })
    expect(audit.viewer.value.actorMode).toBe('search')
    audit.viewer.value.onSearchActors('김')
    expect(audit.viewer.value.actorSearching).toBe(true)
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    expect(searchActors).toHaveBeenCalledWith('김')
    expect(audit.viewer.value.actorItems).toEqual([
      { value: '12', title: '김운영 (ops01)' },
      { value: '30', title: '이퇴사 (old03) · 퇴사' },
    ])
    expect(audit.viewer.value.actorSearching).toBe(false)
  })

  it('검색 실패 — actorSearchFailed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const searchActors = vi.fn(async (): Promise<AuditActorOption[]> => {
      throw new ApiError('x', { status: 500, raw: null })
    })
    const { audit } = await setup({ searchActors })
    audit.viewer.value.onSearchActors('김')
    vi.advanceTimersByTime(REMOTE_SEARCH_DEBOUNCE_MS)
    await flushPromises()
    expect(audit.viewer.value.actorSearchFailed).toBe(true)
  })

  it('고른 값이 검색 결과에 없으면 이름표를 앞에 둔다 — 목록 행 → #번호(A9)', async () => {
    const searchActors = vi.fn(async () => [] as AuditActorOption[])
    const { audit } = await setup({ searchActors }, [log({ actorUserNo: 12n })])
    edit(audit, { actorUserNo: '12' })
    expect(audit.viewer.value.actorItems[0]).toEqual({ value: '12', title: '김운영 (ops01)' })
    edit(audit, { actorUserNo: '99' })
    expect(audit.viewer.value.actorItems[0]).toEqual({ value: '99', title: '#99' })
  })

  it('이 사람 기록만으로 들어온 행위자는 그 행의 이름표를 기억한다', async () => {
    const searchActors = vi.fn(async () => [] as AuditActorOption[])
    const { audit } = await setup({ searchActors }, [log()])
    audit.filterByActor(log({ actorUserNo: 77n, actorUserId: 'park', actorUserName: '박보안' }))
    await flushPromises()
    expect(audit.viewer.value.actorItems[0]).toEqual({ value: '77', title: '박보안 (park)' })
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useAuditLogs.render.test.ts`
Expected: FAIL — `./useAuditLogs.js` 를 찾지 못함.

- [ ] **Step 3: 구현한다**

`packages/admin-ui/src/composables/useAuditLogs.ts`:

```ts
import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import { coreAuditCatalog, type AdminAuditLog, type AuditCatalog } from '@ssworks/admin-shared'
import {
  DEFAULT_AUDIT_LOG_MESSAGES,
  actorOptionTitle,
  actorText,
  auditFilterProblem,
  buildActionOptions,
  emptyAuditLogDraft,
  isEmptyAuditLogDraft,
  mergeActionGroups,
  normalizeAuditLogDraft,
  sameAuditLogDraft,
  targetOptions,
  toAuditFilter,
  type AuditActionGroup,
  type AuditActorOption,
  type AuditFilterItem,
  type AuditLogDraft,
  type AuditLogFilter,
  type AuditLogMessages,
} from '../components/audit/audit-log.js'
import type { QuerySyncBinding } from './query-codec.js'
import { useRemoteSearch } from './useRemoteSearch.js'
import { useServerTable, type ServerTable, type ServerTableParams } from './useServerTable.js'

// 감사 로그 조회의 흐름 — 입력값 · 적용값 · 서버 페이징 · 행위자 검색 · 펼침. `AuditLogViewer` 에 `v-bind` 할 바인딩을 낸다.
//
// 정본: hangang-home apps/admin/src/pages/settings/audit-logs.vue(입력/적용 분리 · 같은 조건 재적용 · 검증 실패면 조회 안 함 ·
//       권한 없으면 계정 목록 안 부름 · 펼침 키) + ssworks-gise-home apps/admin/src/composables/useRouteQuerySync.ts(URL)
// 바꾼 점:
//  ① 페이지에 흩어진 상태를 composable 하나로. 목록은 3a `useServerTable` 을 감싼다.
//  ② 행위자 고르기를 계정 100명 목록(hangang)에서 서버 검색(`searchActors`)으로(3f 결정 ② A1).
//  ③ 조회 오류 문구는 해석하지 않는다 — 전역 토스트와 화면 안 알림(C7).

export interface UseAuditLogsOptions<R extends AdminAuditLog = AdminAuditLog> {
  /** 템플릿: (params) => api.get<Paginated<AdminAuditLog>>('/audit-logs', { params }) */
  fetch: (
    params: ServerTableParams<AuditLogFilter>,
  ) => Promise<{ items: R[]; total: number | bigint }>
  /** 기본 coreAuditCatalog. 프로젝트 액션 라벨은 이 카탈로그에서 온다 */
  catalog?: AuditCatalog
  /** 코어 묶음에 더한다. prefix 가 같으면 라벨을 덮어쓴다(A5) */
  actionGroups?: readonly AuditActionGroup[]
  /** 바뀐 항목 이름. 없으면 키 원문 */
  fieldLabels?: Readonly<Record<string, string>>
  searchActors?: (keyword: string) => Promise<readonly AuditActorOption[]>
  /** 게터 — 부를 때마다 평가한다. 기본 () => true */
  canSearchActors?: () => boolean
  /** 기본 false. true 면 actor · action · targetType · targetRefNo · from · to 를 URL 과 맞춘다(A6). vue-router 가 있어야 한다 */
  urlSync?: boolean
  itemsPerPage?: number
  messages?: Partial<AuditLogMessages>
  /** 기본 true */
  immediate?: boolean
}

/** `<AuditLogViewer v-bind="audit.viewer.value" />` — props 와 리스너 이름은 컴포넌트 그대로 */
export interface AuditLogViewerBindings<R> {
  draft: AuditLogDraft
  'onUpdate:draft': (draft: AuditLogDraft) => void
  actorMode: 'search' | 'number'
  actorHint: string | null
  actorItems: readonly AuditFilterItem[]
  actorSearching: boolean
  actorSearchFailed: boolean
  onSearchActors: (keyword: string) => void
  actionItems: readonly AuditFilterItem[]
  targetItems: readonly AuditFilterItem[]
  filterError: string | null
  onApply: () => void
  onReset: () => void
  rows: readonly R[]
  itemsLength: number
  page: number
  itemsPerPage: number
  'onUpdate:page': (page: number) => void
  'onUpdate:itemsPerPage': (size: number) => void
  loading: boolean
  loadFailed: boolean
  onRetry: () => void
  filtered: boolean
  expanded: readonly string[]
  'onUpdate:expanded': (keys: readonly string[]) => void
  onFilterByActor: (row: R) => void
  catalog: AuditCatalog
  fieldLabels: Readonly<Record<string, string>>
  messages: AuditLogMessages
}

export interface AuditLogs<R> {
  /** 입력값 — 칸이 고친다 */
  draft: Readonly<Ref<AuditLogDraft>>
  /** 적용값 — 표 · URL 이 이것만 본다 */
  applied: Readonly<Ref<AuditLogDraft>>
  filterError: Readonly<Ref<string | null>>
  /** 검증 실패면 false(적용 안 함 · filterError) */
  apply: () => boolean
  reset: () => void
  filterByActor: (row: R) => void
  reload: () => Promise<void>
  table: ServerTable<R>
  viewer: ComputedRef<AuditLogViewerBindings<R>>
}

/** setup 안에서 부른다. */
export function useAuditLogs<R extends AdminAuditLog = AdminAuditLog>(
  options: UseAuditLogsOptions<R>,
): AuditLogs<R> {
  const catalog = options.catalog ?? coreAuditCatalog
  const messages: AuditLogMessages = { ...DEFAULT_AUDIT_LOG_MESSAGES, ...options.messages }
  const fieldLabels = options.fieldLabels ?? {}
  const actionItems = buildActionOptions(catalog, mergeActionGroups(options.actionGroups), messages)
  const targetItems = targetOptions(catalog)

  const draft = ref<AuditLogDraft>(emptyAuditLogDraft())
  const applied = ref<AuditLogDraft>(emptyAuditLogDraft())
  const filterError = ref<string | null>(null)
  const expanded = shallowRef<readonly string[]>([])

  // Task 5 가 이 자리에 URL 바인딩을 만든다. 🔴 `useServerTable` 보다 먼저여야 한다 — 그 안에서 초기 복원을 부른다.
  const urlSync: QuerySyncBinding | undefined = undefined

  const table = useServerTable<R, AuditLogFilter>({
    fetch: options.fetch,
    // 🔴 서버 기본값에 기대지 않고 늘 싣는다(A11). 표 머리 정렬은 표가 막는다.
    sort: { keys: ['createAt'], default: { key: 'createAt', order: 'desc' } },
    filters: () => toAuditFilter(applied.value),
    itemsPerPage: options.itemsPerPage,
    urlSync,
    immediate: options.immediate,
  })

  function commit(next: AuditLogDraft): void {
    const same = sameAuditLogDraft(next, applied.value)
    applied.value = { ...next }
    draft.value = { ...next }
    filterError.value = null
    expanded.value = []
    // 🔴 같은 조건이면 필터 키가 그대로라 `useServerTable` 이 다시 부르지 않는다(A2 · hangang 223). 지금 쪽을 다시 부른다.
    if (same) void table.reload()
  }

  function apply(): boolean {
    const next = normalizeAuditLogDraft(draft.value)
    const problem = auditFilterProblem(next, messages)
    if (problem != null) {
      // 🔴 조회하지 않는다 — 번호 칸의 틀린 값이 400 이 되고 입력값은 그대로 둔다(hangang 185)
      filterError.value = problem
      return false
    }
    commit(next)
    return true
  }

  function reset(): void {
    commit(emptyAuditLogDraft())
  }

  // ── 행위자 ──────────────────────────────────────────────────────────

  const search = options.searchActors != null ? useRemoteSearch(options.searchActors) : null
  /** 🔴 권한 게터가 거짓이면 어댑터를 부르지 않는다 — 403 이 나지 않게(C9 · hangang 101) */
  const canSearch = (): boolean => search != null && (options.canSearchActors?.() ?? true)
  /** 번호 → 이름표. 검색 결과 · "이 사람 기록만" 행에서 모은다(A9) */
  const knownActors = new Map<string, string>()

  function actorTitleOf(value: string): string {
    const known = knownActors.get(value)
    if (known != null) return known
    const row = table.items.value.find(
      (item) => item.actorUserNo != null && String(item.actorUserNo) === value,
    )
    if (row != null && (row.actorUserName != null || row.actorUserId != null)) {
      return actorText(row, messages)
    }
    // 번호로 이름을 찾으려고 부르지 않는다
    return `#${value}`
  }

  const actorItems = computed<AuditFilterItem[]>(() => {
    const items = (search?.items.value ?? []).map((option) => {
      const item = { value: String(option.userNo), title: actorOptionTitle(option, messages) }
      knownActors.set(item.value, item.title)
      return item
    })
    const current = draft.value.actorUserNo
    // 고른 값이 지금 검색 결과에 없어도 칸이 이름을 보이게 한다(A9)
    if (current !== '' && !items.some((item) => item.value === current)) {
      items.unshift({ value: current, title: actorTitleOf(current) })
    }
    return items
  })

  function filterByActor(row: R): void {
    if (row.actorUserNo == null) return
    const value = String(row.actorUserNo)
    knownActors.set(value, actorText(row, messages))
    // 적용값의 행위자만 바꾼다 — 입력 중이던 다른 칸은 적용값으로 돌아간다(A10)
    commit({ ...applied.value, actorUserNo: value })
  }

  // ── 바인딩 ──────────────────────────────────────────────────────────

  const viewer = computed<AuditLogViewerBindings<R>>(() => ({
    draft: draft.value,
    'onUpdate:draft': (next) => {
      draft.value = { ...next }
    },
    actorMode: canSearch() ? 'search' : 'number',
    actorHint: search != null && !canSearch() ? messages.actorNoPermissionHint : null,
    actorItems: actorItems.value,
    actorSearching: search?.searching.value ?? false,
    actorSearchFailed: search?.failed.value ?? false,
    onSearchActors: (keyword) => {
      if (canSearch()) search?.search(keyword)
    },
    actionItems,
    targetItems,
    filterError: filterError.value,
    onApply: () => {
      apply()
    },
    onReset: reset,
    rows: table.items.value,
    itemsLength: table.total.value,
    page: table.page.value,
    itemsPerPage: table.itemsPerPage.value,
    'onUpdate:page': (page) => {
      table.page.value = page
    },
    'onUpdate:itemsPerPage': (size) => {
      table.itemsPerPage.value = size
    },
    loading: table.loading.value,
    loadFailed: table.error.value != null,
    onRetry: () => {
      void table.reload()
    },
    filtered: !isEmptyAuditLogDraft(applied.value),
    expanded: expanded.value,
    'onUpdate:expanded': (keys) => {
      expanded.value = [...keys]
    },
    onFilterByActor: filterByActor,
    catalog,
    fieldLabels,
    messages,
  }))

  return {
    draft,
    applied,
    filterError,
    apply,
    reset,
    filterByActor,
    reload: table.reload,
    table,
    viewer,
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useAuditLogs.render.test.ts`
Expected: PASS

Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: 통과. 이 Task 에서 `urlSync` 는 늘 `undefined` 다 — `options.urlSync` 는 Task 5 가 읽는다.

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-ui/src/composables/useAuditLogs.ts packages/admin-ui/src/composables/useAuditLogs.render.test.ts
git commit -m "feat(admin-ui): useAuditLogs — 입력/적용 · 같은 조건 재적용 · 이 사람 기록만 · 행위자 검색 · 펼침" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: URL 동기화(`urlSync: true`)

**Files:**

- Modify: `packages/admin-ui/src/components/audit/audit-log.ts`(끝에 URL 코덱 추가)
- Modify: `packages/admin-ui/src/components/audit/audit-log.test.ts`(URL 코덱 단위 테스트 추가)
- Modify: `packages/admin-ui/src/composables/useAuditLogs.ts`(urlSync 자리 채움)
- Create: `packages/admin-ui/src/composables/useAuditLogs.url.test.ts`

**Interfaces:**

- Consumes: Task 2 · Task 4; `queryCodec`(`../../composables/query-codec.js`); admin-shared `AUDIT_ACTION_MAX_LENGTH` · `AUDIT_TARGET_TYPE_MAX_LENGTH`
- Produces:
  - `AUDIT_LOG_QUERY_KEYS: { actorUserNo: 'actor'; action: 'action'; targetType: 'targetType'; targetRefNo: 'targetRefNo'; from: 'from'; to: 'to' }`
  - `decodeAuditLogQuery(query: LocationQuery): AuditLogDraft`
  - `encodeAuditLogQuery(draft: AuditLogDraft): LocationQueryRaw`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-ui/src/components/audit/audit-log.test.ts` 끝에 더한다(import 줄에 `decodeAuditLogQuery` · `encodeAuditLogQuery` 를 추가):

```ts
describe('URL 코덱(A6)', () => {
  it('키를 읽어 입력값으로 — 날짜는 로컬 YYYY-MM-DD 그대로', () => {
    expect(
      decodeAuditLogQuery({
        actor: '12',
        action: 'org.role.',
        targetType: 'role',
        targetRefNo: '3',
        from: '2026-10-01',
        to: '2026-10-18',
      }),
    ).toEqual(
      draft({
        actorUserNo: '12',
        action: 'org.role.',
        targetType: 'role',
        targetRefNo: '3',
        from: '2026-10-01',
        to: '2026-10-18',
      }),
    )
  })

  it('🔴 틀린 키는 없는 것으로 — 앞자리 0 · 문자 번호 · 없는 날짜 · 넘친 길이', () => {
    expect(
      decodeAuditLogQuery({
        actor: '007',
        targetRefNo: 'abc',
        from: '2026-02-30',
        to: 'x',
        action: 'a'.repeat(129),
        targetType: 't'.repeat(65),
      }),
    ).toEqual(emptyAuditLogDraft())
  })

  it('🔴 거꾸로 된 기간은 둘 다 버린다 — 서버에 400 을 보내지 않는다', () => {
    expect(decodeAuditLogQuery({ from: '2026-10-18', to: '2026-10-01' })).toEqual(
      emptyAuditLogDraft(),
    )
  })

  it('반복 키는 첫 값 · 빈 값은 없음', () => {
    expect(decodeAuditLogQuery({ actor: ['5', '6'], action: '' })).toEqual(
      draft({ actorUserNo: '5' }),
    )
  })

  it('빈 칸은 URL 에서 뺀다', () => {
    expect(encodeAuditLogQuery(emptyAuditLogDraft())).toEqual({})
    expect(encodeAuditLogQuery(draft({ actorUserNo: '12', to: '2026-10-18' }))).toEqual({
      actor: '12',
      to: '2026-10-18',
    })
  })
})
```

`packages/admin-ui/src/composables/useAuditLogs.url.test.ts`:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import type { AdminAuditLog } from '@ssworks/admin-shared'
import { emptyAuditLogDraft, type AuditLogFilter } from '../components/audit/audit-log.js'
import { useAuditLogs, type AuditLogs } from './useAuditLogs.js'
import type { ServerTableParams } from './useServerTable.js'

// 정본: 킷 useServerTable.url.test.ts 의 라우터 하네스. 감사 화면의 URL 키(A6)를 잰다.

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
})

const localMidnight = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString()

async function setup(initial: string) {
  const fetch = vi.fn(async (_params: ServerTableParams<AuditLogFilter>) => ({
    items: [] as AdminAuditLog[],
    total: 0,
  }))
  let audit!: AuditLogs<AdminAuditLog>
  const Page = defineComponent({
    setup() {
      audit = useAuditLogs({ fetch, urlSync: true })
      return () => h('div')
    },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/audit', component: Page },
      { path: '/other', component: { render: () => h('div') } },
    ],
  })
  await router.push(initial)
  await router.isReady()
  wrapper = mount(defineComponent({ render: () => h(RouterView) }), {
    global: { plugins: [router] },
  })
  await flushPromises()
  return { fetch, router, audit: () => audit }
}

describe('useAuditLogs — urlSync', () => {
  it('🔴 URL 에서 복원하고 조회는 1번 — 입력값 · 적용값 둘 다', async () => {
    const { fetch, audit } = await setup(
      '/audit?actor=12&action=org.role.&targetType=role&targetRefNo=3&from=2026-10-01&to=2026-10-18',
    )
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.lastCall?.[0].filter).toEqual({
      actorUserNo: 12n,
      action: 'org.role.',
      actionMatch: 'prefix',
      targetType: 'role',
      targetRefNo: 3n,
      from: localMidnight(2026, 10, 1),
      to: localMidnight(2026, 10, 19),
    })
    expect(audit().draft.value).toEqual(audit().applied.value)
    expect(audit().applied.value.actorUserNo).toBe('12')
  })

  it('틀린 값은 버린다 — 화면이 뜨고 필터 없이 부른다', async () => {
    const { fetch } = await setup('/audit?actor=abc&targetRefNo=007&from=2026-02-30&to=x')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.lastCall?.[0].filter).toEqual({})
  })

  it('🔴 거꾸로 된 기간은 둘 다 버린다', async () => {
    const { fetch } = await setup('/audit?from=2026-10-18&to=2026-10-01')
    expect(fetch.mock.lastCall?.[0].filter).toEqual({})
  })

  it('적용하면 URL 에 싣고 빈 칸은 뺀다 · 초기화하면 비운다', async () => {
    const { router, audit } = await setup('/audit')
    audit().viewer.value['onUpdate:draft']({ ...emptyAuditLogDraft(), action: 'org.role.update' })
    audit().apply()
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ action: 'org.role.update' })
    audit().reset()
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('이 사람 기록만은 actor 를 싣는다', async () => {
    const { router, audit } = await setup('/audit')
    audit().filterByActor({
      logNo: 1n,
      actorUserNo: 7n,
      actorUserId: 'park',
      actorUserName: '박보안',
      sessionNo: null,
      action: 'auth.logout',
      targetType: null,
      targetRefNo: null,
      method: 'POST',
      path: '/admin/auth/logout',
      statusCode: 200,
      errorCode: null,
      ip: null,
      userAgent: null,
      meta: null,
      createAt: '2026-10-18T05:03:21.000Z',
    })
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ actor: '7' })
  })

  it('뒤로 가기 · 같은 화면 링크 — URL 이 바뀌면 다시 채우고 다시 부른다', async () => {
    const { fetch, router, audit } = await setup('/audit')
    fetch.mockClear()
    await router.push('/audit?actor=5&targetType=role&targetRefNo=3')
    await flushPromises()
    expect(audit().applied.value).toEqual({
      ...emptyAuditLogDraft(),
      actorUserNo: '5',
      targetType: 'role',
      targetRefNo: '3',
    })
    expect(audit().draft.value).toEqual(audit().applied.value)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.lastCall?.[0].filter).toEqual({
      actorUserNo: 5n,
      targetType: 'role',
      targetRefNo: 3n,
    })
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/audit/audit-log.test.ts src/composables/useAuditLogs.url.test.ts`
Expected: FAIL — `decodeAuditLogQuery` 가 없음, URL 복원이 일어나지 않음(필터 `{}`).

- [ ] **Step 3: 구현한다**

`packages/admin-ui/src/components/audit/audit-log.ts` 의 import 를 바꾼다(맨 위 두 줄 대신):

```ts
import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import {
  AUDIT_ACTION_MAX_LENGTH,
  AUDIT_TARGET_TYPE_MAX_LENGTH,
  type AdminAuditLog,
  type AuditCatalog,
} from '@ssworks/admin-shared'
import { queryCodec } from '../../composables/query-codec.js'
import { isDateOnly, localDayStartIso, localNextDayStartIso } from '../../utils/local-date.js'
```

같은 파일 끝에 더한다:

```ts
// ── URL(A6) ──────────────────────────────────────────────────────────

/** URL 키 — `useServerTable` 의 표 키(page · size · sort)와 겹치지 않는다 */
export const AUDIT_LOG_QUERY_KEYS = {
  actorUserNo: 'actor',
  action: 'action',
  targetType: 'targetType',
  targetRefNo: 'targetRefNo',
  from: 'from',
  to: 'to',
} as const satisfies Record<keyof AuditLogDraft, string>

/** 🔴 앞자리 0 을 거부한다 — `007` 과 `7` 이 같은 상태의 두 URL 이 되지 않게(query-codec `bigint` 와 같다) */
const CANONICAL_UNSIGNED = /^(0|[1-9][0-9]{0,19})$/
const firstText = queryCodec.string()

function decodeKey(raw: LocationQuery[string], valid: (value: string) => boolean): string {
  const value = firstText.decode(raw)
  return value !== undefined && valid(value) ? value : ''
}

/** URL → 입력값. 🔴 던지지 않는다 — 형식이 틀린 키는 없는 것이다(코덱 규약). 거꾸로 된 기간은 둘 다 버린다 */
export function decodeAuditLogQuery(query: LocationQuery): AuditLogDraft {
  const keys = AUDIT_LOG_QUERY_KEYS
  const out: AuditLogDraft = {
    actorUserNo: decodeKey(query[keys.actorUserNo], (v) => CANONICAL_UNSIGNED.test(v)),
    action: decodeKey(query[keys.action], (v) => v.length <= AUDIT_ACTION_MAX_LENGTH),
    targetType: decodeKey(query[keys.targetType], (v) => v.length <= AUDIT_TARGET_TYPE_MAX_LENGTH),
    targetRefNo: decodeKey(query[keys.targetRefNo], (v) => CANONICAL_UNSIGNED.test(v)),
    from: decodeKey(query[keys.from], isDateOnly),
    to: decodeKey(query[keys.to], isDateOnly),
  }
  if (out.from !== '' && out.to !== '' && out.from > out.to) {
    out.from = ''
    out.to = ''
  }
  return out
}

/** 입력값 → URL. 빈 칸은 뺀다 */
export function encodeAuditLogQuery(draft: AuditLogDraft): LocationQueryRaw {
  const out: LocationQueryRaw = {}
  for (const key of DRAFT_KEYS) {
    if (draft[key] !== '') out[AUDIT_LOG_QUERY_KEYS[key]] = draft[key]
  }
  return out
}
```

`packages/admin-ui/src/composables/useAuditLogs.ts`:

- import 의 `audit-log.js` 목록에 `decodeAuditLogQuery` · `encodeAuditLogQuery` 를 더한다.
- 자리 표시 두 줄(주석 + `const urlSync: QuerySyncBinding | undefined = undefined`)을 이것으로 바꾼다:

```ts
// 🔴 `useServerTable` 보다 먼저 만든다 — 그 안에서 초기 복원(`read`)을 동기로 부르고, 그 뒤에 감시를 단다.
const urlSync: QuerySyncBinding | undefined =
  options.urlSync === true
    ? {
        read(query) {
          const next = decodeAuditLogQuery(query)
          // 복원은 적용값과 입력값 둘 다에 넣는다(A6) — 보이는 칸과 표가 어긋나지 않게
          applied.value = next
          draft.value = { ...next }
          filterError.value = null
          expanded.value = []
        },
        toQuery: () => encodeAuditLogQuery(applied.value),
      }
    : undefined
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/audit/audit-log.test.ts src/composables/useAuditLogs.url.test.ts src/composables/useAuditLogs.render.test.ts`
Expected: PASS

Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: 통과

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-ui/src/components/audit/audit-log.ts packages/admin-ui/src/components/audit/audit-log.test.ts packages/admin-ui/src/composables/useAuditLogs.ts packages/admin-ui/src/composables/useAuditLogs.url.test.ts
git commit -m "feat(admin-ui): 감사 로그 URL 동기화 — actor · action · 대상 · 기간 키, 틀린 값 버림" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 화면 — `AuditLogViewer` + 부품 셋

**Files:**

- Create: `packages/admin-ui/src/components/audit/AuditLogFilterBar.vue`
- Create: `packages/admin-ui/src/components/audit/AuditLogDetail.vue`
- Create: `packages/admin-ui/src/components/audit/AuditLogTable.vue`
- Create: `packages/admin-ui/src/components/audit/AuditLogViewer.vue`
- Create: `packages/admin-ui/src/components/audit/audit-log-viewer.render.test.ts`

**Interfaces:**

- Consumes: Task 1 `formatDateTime` · Task 2 함수 · 타입 · Task 4 `AuditLogViewerBindings`(props · emits 가 그 키와 1:1) · `useAuditLogs`(통합 테스트) · `DataTableBody`(`../table/DataTableBody.vue` — 알 수 없는 속성은 루트 `VDataTableServer` 로 떨어진다) · `EmptyState`(`../common/EmptyState.vue` — props `filtered` · `title` · `filteredTitle`)
- Produces: `AuditLogViewer`(제네릭 `R extends AdminAuditLog`) — props = `AuditLogViewerBindings` 의 값 키 + `formatDate?(iso: string): string`, emits = `update:draft` · `searchActors` · `apply` · `reset` · `update:page` · `update:itemsPerPage` · `retry` · `update:expanded` · `filterByActor`

- [ ] **Step 1: 위험 ② 를 먼저 잰다 — `DataTableBody` 를 거친 펼침**

`packages/admin-ui/src/components/audit/audit-log-viewer.render.test.ts` 를 아래 전체 내용으로 만든다. 그중 `describe('펼침')` 이 위험 ②(스펙 §8 — `expanded` · `item-value` · `#expanded-row` 가 `DataTableBody` 를 지나 닿는가)를 잰다:

```ts
// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type Component } from 'vue'
import { VAutocomplete } from 'vuetify/components'
import { coreAuditCatalog, type AdminAuditLog } from '@ssworks/admin-shared'
import { useAuditLogs, type AuditLogViewerBindings } from '../../composables/useAuditLogs.js'
import type { ServerTableParams } from '../../composables/useServerTable.js'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import AuditLogViewer from './AuditLogViewer.vue'
import {
  CORE_AUDIT_ACTION_GROUPS,
  DEFAULT_AUDIT_LOG_MESSAGES as M,
  buildActionOptions,
  emptyAuditLogDraft,
  targetOptions,
  type AuditLogFilter,
} from './audit-log.js'

// 정본: hangang-home apps/admin/src/pages/settings/audit-logs.render.test.ts(셀 글자 · 글자 펼침 버튼 · 한 행만 펼침 ·
//       가린 항목 · 빈 상태 두 갈래 · 읽기 전용)를 킷 화면에 대고 잰다.

installVisualViewport()

const log = (over: Partial<AdminAuditLog> = {}): AdminAuditLog => ({
  logNo: 1n,
  actorUserNo: 12n,
  actorUserId: 'ops01',
  actorUserName: '김운영',
  sessionNo: 4182n,
  action: 'org.role.update',
  targetType: 'role',
  targetRefNo: 3n,
  method: 'PATCH',
  path: '/admin/roles/3',
  statusCode: 200,
  errorCode: null,
  ip: '203.0.113.7',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
  meta: {
    before: { roleName: '상담원', permissions: ['users.read'] },
    after: { roleName: '상담 매니저', permissions: ['users.read', 'sessions.read'] },
    clearedDefaults: ['상담원 기본'],
  },
  createAt: '2026-10-18T05:03:21.000Z',
  ...over,
})

const ROWS: AdminAuditLog[] = [
  log(),
  log({
    logNo: 2n,
    actorUserNo: null,
    actorUserId: null,
    actorUserName: null,
    sessionNo: null,
    action: 'auth.login.fail',
    targetType: null,
    targetRefNo: null,
    method: 'POST',
    path: '/admin/auth/login',
    statusCode: 401,
    errorCode: 'ERR_LOGIN_FAILED',
    ip: '198.51.100.24',
    userAgent: null,
    meta: null,
    createAt: '2026-10-18T04:58:02.000Z',
  }),
  log({
    logNo: 3n,
    actorUserNo: 41n,
    actorUserId: null,
    actorUserName: null,
    action: 'members.points.adjust',
    targetType: 'member',
    targetRefNo: 90211n,
    statusCode: 500,
    errorCode: 'ERR_COMMON_INTERNAL',
    ip: null,
    meta: { before: { apiSecret: '***', memo: 'a' }, after: { apiSecret: '***', memo: 'a' } },
    createAt: '2026-10-17T09:02:44.000Z',
  }),
]

/** 시간대와 무관하게 — 화면 시각 대신 ISO 를 그대로 잘라 쓴다 */
const utc = (iso: string) => iso.slice(0, 19).replace('T', ' ')

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function bindings(
  over: Partial<AuditLogViewerBindings<AdminAuditLog>> = {},
): AuditLogViewerBindings<AdminAuditLog> {
  return {
    draft: emptyAuditLogDraft(),
    'onUpdate:draft': vi.fn(),
    actorMode: 'number',
    actorHint: null,
    actorItems: [],
    actorSearching: false,
    actorSearchFailed: false,
    onSearchActors: vi.fn(),
    actionItems: buildActionOptions(coreAuditCatalog, CORE_AUDIT_ACTION_GROUPS, M),
    targetItems: targetOptions(coreAuditCatalog),
    filterError: null,
    onApply: vi.fn(),
    onReset: vi.fn(),
    rows: ROWS,
    itemsLength: 128,
    page: 1,
    itemsPerPage: 20,
    'onUpdate:page': vi.fn(),
    'onUpdate:itemsPerPage': vi.fn(),
    loading: false,
    loadFailed: false,
    onRetry: vi.fn(),
    filtered: false,
    expanded: [],
    'onUpdate:expanded': vi.fn(),
    onFilterByActor: vi.fn(),
    catalog: coreAuditCatalog,
    fieldLabels: {},
    messages: M,
    ...over,
  }
}

async function mountViewer(b: AuditLogViewerBindings<AdminAuditLog>) {
  wrapper = mount(AuditLogViewer as Component, {
    props: { ...b, formatDate: utc },
    attachTo: document.body,
    global: { plugins: [vuetify] },
  })
  await flushPromises()
  return b
}

const bodyRows = () => [...document.querySelectorAll('.audit-log-table tbody tr')] as HTMLElement[]
const text = () => document.body.textContent ?? ''

describe('AuditLogViewer — 셀', () => {
  it('시각 · 행위자 · 동작(라벨 + 코드) · 대상 · 결과 · IP', async () => {
    await mountViewer(bindings())
    const first = bodyRows()[0]!.textContent ?? ''
    for (const part of [
      '2026-10-18 05:03:21',
      '김운영 (ops01)',
      '역할 수정',
      'org.role.update',
      '역할 #3',
      '200 · 성공',
      '203.0.113.7',
    ]) {
      expect(first).toContain(part)
    }
  })

  it('실패 행 — 계정 없음 · 거부 칩 + errorCode · 대상 — · 이 사람 기록만 버튼 없음', async () => {
    await mountViewer(bindings())
    const second = bodyRows()[1]!
    expect(second.textContent).toContain('계정 없음')
    expect(second.textContent).toContain('401 · 거부')
    expect(second.textContent).toContain('ERR_LOGIN_FAILED')
    expect(buttonByText('이 사람 기록만', second)).toBeUndefined()
  })

  it('번호만 있는 행위자 · 🔴 모르는 동작은 코드 그대로 한 번 · 서버 오류 · IP 없음', async () => {
    await mountViewer(bindings())
    const third = bodyRows()[2]!.textContent ?? ''
    expect(third).toContain('#41 (계정 정보 없음)')
    expect(third).toContain('members.points.adjust')
    expect(third).not.toContain('members.points.adjust (members.points.adjust)')
    expect(third).toContain('member #90211')
    expect(third).toContain('500 · 서버 오류')
    expect(third).toContain('—')
  })

  it('이 사람 기록만 — 접근 이름이 사람을 가리키고, 행을 넘긴다', async () => {
    const b = await mountViewer(bindings())
    const button = document.querySelector<HTMLButtonElement>(
      'button[aria-label="김운영 (ops01) 기록만 보기"]',
    )
    expect(button?.textContent?.trim()).toBe('이 사람 기록만')
    button!.click()
    expect(b.onFilterByActor).toHaveBeenCalledWith(ROWS[0])
  })

  it('머리 줄 — 읽기 전용 안내 · 총 건수 · 정렬 고정', async () => {
    await mountViewer(bindings())
    expect(text()).toContain('읽기 전용 기록입니다. 삭제 · 수정할 수 없습니다.')
    expect(text()).toContain('총 128건')
    expect(text()).toContain('정렬: 최신순(고정)')
  })
})

describe('AuditLogViewer — 펼침', () => {
  it('🔴 "내역"을 누르면 그 행의 키(logNo 문자열)만 올린다', async () => {
    const b = await mountViewer(bindings())
    buttonByText('내역')!.click()
    await flushPromises()
    expect(b['onUpdate:expanded']).toHaveBeenCalledWith(['1'])
  })

  it('펼친 행 — 바뀐 항목(필드 라벨) · 기타 기록 · 요청 줄 · 세션 · User-Agent · 한 행만', async () => {
    await mountViewer(bindings({ expanded: ['1'], fieldLabels: { roleName: '역할 이름' } }))
    const detail = document.querySelectorAll('.audit-log-detail')
    expect(detail).toHaveLength(1)
    const t = detail[0]!.textContent ?? ''
    for (const part of [
      '바뀐 항목',
      '역할 이름',
      'roleName',
      '상담원',
      '상담 매니저',
      '["users.read","sessions.read"]',
      '기타 기록',
      'clearedDefaults',
      '요청',
      'PATCH /admin/roles/3',
      '세션 #4182',
      'User-Agent',
    ]) {
      expect(t).toContain(part)
    }
    expect(buttonByText('접기')).toBeDefined()
  })

  it('🔴 가린 항목은 이름만 — *** 를 그리지 않는다', async () => {
    await mountViewer(bindings({ expanded: ['3'] }))
    const t = document.querySelector('.audit-log-detail')?.textContent ?? ''
    expect(t).toContain('가려진 항목: apiSecret — 값은 표시하지 않습니다')
    expect(t).toContain('바뀐 항목 없음')
    expect(t).not.toContain('***')
  })

  it('기록이 없으면 그렇게 적는다 · User-Agent 가 없으면 그 줄이 없다', async () => {
    await mountViewer(bindings({ expanded: ['2'] }))
    const t = document.querySelector('.audit-log-detail')?.textContent ?? ''
    expect(t).toContain('기록된 변경 내역이 없습니다')
    expect(t).not.toContain('User-Agent')
  })
})

describe('AuditLogViewer — 빈 상태 · 실패', () => {
  it('🔴 아직 없음과 조건에 맞는 것 없음을 가른다', async () => {
    await mountViewer(bindings({ rows: [], itemsLength: 0 }))
    expect(text()).toContain('아직 기록이 없습니다')
    wrapper!.unmount()
    document.body.innerHTML = ''
    await mountViewer(bindings({ rows: [], itemsLength: 0, filtered: true }))
    expect(text()).toContain('조건에 맞는 기록이 없습니다')
    expect(text()).not.toContain('아직 기록이 없습니다')
  })

  it('조회 실패 — 알림과 [다시 시도], 빈 상태 문구는 없다', async () => {
    const b = await mountViewer(bindings({ rows: [], itemsLength: 0, loadFailed: true }))
    expect(text()).toContain('감사 로그를 불러오지 못했습니다.')
    expect(text()).not.toContain('아직 기록이 없습니다')
    buttonByText('다시 시도')!.click()
    expect(b.onRetry).toHaveBeenCalled()
  })
})

describe('AuditLogViewer — 필터', () => {
  const input = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)

  it('번호 모드 — 입력은 update:draft, 번호 칸 Enter 는 적용', async () => {
    const b = await mountViewer(bindings())
    const actor = wrapper!.find('input[name="actorUserNo"]')
    await actor.setValue('12')
    expect(b['onUpdate:draft']).toHaveBeenLastCalledWith({
      ...emptyAuditLogDraft(),
      actorUserNo: '12',
    })
    await wrapper!.find('input[name="targetRefNo"]').trigger('keyup', { key: 'Enter' })
    expect(b.onApply).toHaveBeenCalledTimes(1)
    expect(input('from')?.type).toBe('date')
    expect(input('to')?.type).toBe('date')
  })

  it('[적용] · [초기화]', async () => {
    const b = await mountViewer(bindings())
    buttonByText('적용')!.click()
    buttonByText('초기화')!.click()
    expect(b.onApply).toHaveBeenCalledTimes(1)
    expect(b.onReset).toHaveBeenCalledTimes(1)
  })

  it('경고 · 권한 안내 · 힌트', async () => {
    await mountViewer(
      bindings({ filterError: M.rangeReversed, actorHint: M.actorNoPermissionHint }),
    )
    expect(text()).toContain(M.rangeReversed)
    expect(text()).toContain(M.actorNoPermissionHint)
    expect(text()).toContain(M.periodHint)
    expect(text()).toContain(M.actionHint)
  })

  it('동작 칸 — 묶음이 먼저', async () => {
    await mountViewer(bindings())
    const action = wrapper!
      .findAllComponents(VAutocomplete)
      .find((c) => c.props('label') === '동작')!
    expect((action.props('items') as { title: string }[])[0]!.title).toBe('[묶음] 인증 (auth.*)')
  })

  it('검색 모드 — 검색어를 알리고, 🔴 고른 항목 글자로는 다시 알리지 않는다', async () => {
    const b = await mountViewer(
      bindings({
        actorMode: 'search',
        draft: { ...emptyAuditLogDraft(), actorUserNo: '12' },
        actorItems: [{ value: '12', title: '김운영 (ops01)' }],
      }),
    )
    const actor = wrapper!
      .findAllComponents(VAutocomplete)
      .find((c) => c.props('label') === '행위자')!
    expect(actor.props('modelValue')).toBe('12')
    actor.vm.$emit('update:search', '김')
    actor.vm.$emit('update:search', '김운영 (ops01)')
    expect(b.onSearchActors).toHaveBeenCalledTimes(1)
    expect(b.onSearchActors).toHaveBeenCalledWith('김')
    actor.vm.$emit('update:modelValue', null)
    expect(b['onUpdate:draft']).toHaveBeenLastCalledWith(emptyAuditLogDraft())
  })
})

describe('흐름 + 화면 — useAuditLogs 와 함께', () => {
  it('입력은 조회하지 않고, [적용] · 내역 · 이 사람 기록만이 끝까지 닿는다', async () => {
    const fetch = vi.fn(async (_params: ServerTableParams<AuditLogFilter>) => ({
      items: ROWS,
      total: ROWS.length,
    }))
    wrapper = mount(
      defineComponent({
        setup() {
          const audit = useAuditLogs({ fetch })
          return () => h(AuditLogViewer as Component, { ...audit.viewer.value, formatDate: utc })
        },
      }),
      { attachTo: document.body, global: { plugins: [vuetify] } },
    )
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)

    await wrapper.find('input[name="targetRefNo"]').setValue('3')
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)
    buttonByText('적용')!.click()
    await flushPromises()
    expect(fetch.mock.lastCall?.[0].filter).toEqual({ targetRefNo: 3n })

    buttonByText('내역')!.click()
    await flushPromises()
    expect(document.querySelector('.audit-log-detail')?.textContent).toContain('바뀐 항목')

    document
      .querySelector<HTMLButtonElement>('button[aria-label="김운영 (ops01) 기록만 보기"]')!
      .click()
    await flushPromises()
    expect(fetch.mock.lastCall?.[0].filter).toEqual({ actorUserNo: 12n, targetRefNo: 3n })
  })
})
```

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/audit/audit-log-viewer.render.test.ts`
Expected: FAIL — `./AuditLogViewer.vue` 를 찾지 못함.

- [ ] **Step 2: 부품 셋과 화면 한 벌을 만든다**

`packages/admin-ui/src/components/audit/AuditLogFilterBar.vue`:

```vue
<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { VAlert, VAutocomplete, VBtn, VSelect, VTextField } from 'vuetify/components'
  import type { AuditFilterItem, AuditLogDraft, AuditLogMessages } from './audit-log.js'

  // 감사 로그 필터 카드(내부 부품). 입력값만 고치고, 조회는 [적용] · [초기화] · 번호 칸 Enter 에서만 일어난다(A1).
  //
  // 정본: hangang-home apps/admin/src/pages/settings/audit-logs.vue 필터 카드
  // 바꾼 점: 주체 선택기(100명 목록) + 번호 칸 둘을 행위자 칸 하나로 — 서버 검색 자동완성 또는 번호 칸(A8).
  //   동작 값은 묶음 끝 점 · 개별 코드 그대로(A4). 버튼은 조회 중에도 막지 않는다 — 늦은 응답은 순번으로 버린다.

  const props = defineProps<{
    draft: AuditLogDraft
    actorMode: 'search' | 'number'
    actorHint: string | null
    actorItems: readonly AuditFilterItem[]
    actorSearching: boolean
    actorSearchFailed: boolean
    actionItems: readonly AuditFilterItem[]
    targetItems: readonly AuditFilterItem[]
    filterError: string | null
    messages: AuditLogMessages
  }>()

  const emit = defineEmits<{
    'update:draft': [draft: AuditLogDraft]
    searchActors: [keyword: string]
    apply: []
    reset: []
  }>()

  function patch(key: keyof AuditLogDraft, value: unknown): void {
    emit('update:draft', { ...props.draft, [key]: typeof value === 'string' ? value : '' })
  }

  const actorItemList = computed(() => [...props.actorItems])
  const actionItemList = computed(() => [...props.actionItems])
  const targetItemList = computed(() => [...props.targetItems])

  const actorSearchText = ref('')
  const selectedActorTitle = computed(
    () => props.actorItems.find((item) => item.value === props.draft.actorUserNo)?.title ?? null,
  )

  /** 🔴 항목을 고르면 VAutocomplete 가 검색어를 그 항목 글자로 바꾼다 — 그 글자로 다시 검색하지 않는다 */
  function onActorSearch(value: string | null): void {
    const keyword = value ?? ''
    actorSearchText.value = keyword
    if (keyword === selectedActorTitle.value) return
    emit('searchActors', keyword)
  }

  const actorNoData = computed(() => {
    if (props.actorSearchFailed) return props.messages.actorSearchFailed
    return actorSearchText.value.trim() === ''
      ? props.messages.actorSearchHint
      : props.messages.actorSearchEmpty
  })
</script>

<template>
  <div class="audit-log-filter">
    <div class="audit-log-filter__fields">
      <VAutocomplete
        v-if="actorMode === 'search'"
        autocomplete="off"
        class="audit-log-filter__actor"
        clearable
        density="compact"
        hide-details
        item-title="title"
        item-value="value"
        :items="actorItemList"
        :label="messages.actorLabel"
        :loading="actorSearching"
        :model-value="draft.actorUserNo === '' ? null : draft.actorUserNo"
        name="actorUserNo"
        no-filter
        :no-data-text="actorNoData"
        :placeholder="messages.allPlaceholder"
        variant="outlined"
        @update:model-value="patch('actorUserNo', $event)"
        @update:search="onActorSearch"
      />
      <VTextField
        v-else
        autocomplete="off"
        class="audit-log-filter__number"
        clearable
        density="compact"
        hide-details
        :label="messages.actorNumberLabel"
        :model-value="draft.actorUserNo"
        name="actorUserNo"
        :placeholder="messages.numberPlaceholder"
        variant="outlined"
        @keyup.enter="emit('apply')"
        @update:model-value="patch('actorUserNo', $event)"
      />
      <VAutocomplete
        autocomplete="off"
        class="audit-log-filter__action"
        clearable
        density="compact"
        hide-details
        item-title="title"
        item-value="value"
        :items="actionItemList"
        :label="messages.actionLabel"
        :model-value="draft.action === '' ? null : draft.action"
        name="action"
        :placeholder="messages.allPlaceholder"
        variant="outlined"
        @update:model-value="patch('action', $event)"
      />
      <VSelect
        class="audit-log-filter__target"
        clearable
        density="compact"
        hide-details
        item-title="title"
        item-value="value"
        :items="targetItemList"
        :label="messages.targetTypeLabel"
        :model-value="draft.targetType === '' ? null : draft.targetType"
        name="targetType"
        :placeholder="messages.allPlaceholder"
        variant="outlined"
        @update:model-value="patch('targetType', $event)"
      />
      <VTextField
        autocomplete="off"
        class="audit-log-filter__number"
        clearable
        density="compact"
        hide-details
        :label="messages.targetRefNoLabel"
        :model-value="draft.targetRefNo"
        name="targetRefNo"
        :placeholder="messages.numberPlaceholder"
        variant="outlined"
        @keyup.enter="emit('apply')"
        @update:model-value="patch('targetRefNo', $event)"
      />
      <VTextField
        class="audit-log-filter__date"
        density="compact"
        hide-details
        :label="messages.fromLabel"
        :model-value="draft.from"
        name="from"
        type="date"
        variant="outlined"
        @update:model-value="patch('from', $event)"
      />
      <VTextField
        class="audit-log-filter__date"
        density="compact"
        hide-details
        :label="messages.toLabel"
        :model-value="draft.to"
        name="to"
        type="date"
        variant="outlined"
        @update:model-value="patch('to', $event)"
      />
      <div class="audit-log-filter__buttons">
        <VBtn variant="text" @click="emit('reset')">{{ messages.reset }}</VBtn>
        <VBtn color="primary" variant="flat" @click="emit('apply')">{{ messages.apply }}</VBtn>
      </div>
    </div>
    <div class="audit-log-filter__hints text-body-2 text-medium-emphasis">
      <div>{{ messages.periodHint }}</div>
      <div>{{ messages.actionHint }}</div>
      <div v-if="actorHint">{{ actorHint }}</div>
    </div>
    <VAlert v-if="filterError" density="compact" type="warning" variant="tonal">
      {{ filterError }}
    </VAlert>
  </div>
</template>

<style scoped>
  .audit-log-filter {
    display: grid;
    gap: 12px;
  }
  .audit-log-filter__fields {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }
  .audit-log-filter__actor {
    flex: 1 1 220px;
  }
  .audit-log-filter__action {
    flex: 1 1 280px;
  }
  .audit-log-filter__target {
    flex: 0 1 180px;
  }
  .audit-log-filter__number {
    flex: 0 1 150px;
  }
  .audit-log-filter__date {
    flex: 0 1 170px;
  }
  .audit-log-filter__buttons {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }
  .audit-log-filter__hints {
    display: grid;
    gap: 2px;
  }
</style>
```

`packages/admin-ui/src/components/audit/AuditLogDetail.vue`:

```vue
<script setup lang="ts">
  import { computed } from 'vue'
  import type { AdminAuditLog } from '@ssworks/admin-shared'
  import { diffAuditMeta, metaJson, type AuditLogMessages } from './audit-log.js'

  // 펼친 행 내용(내부 부품) — 바뀐 항목 · 가린 항목 · 기타 기록 · 요청 줄(A14).
  //
  // 정본: hangang-home apps/admin/src/pages/settings/audit-logs.vue `#expanded-row`
  // 바꾼 점: 항목 이름에 `fieldLabels`(gise audit-fields 의 일반화), 요청 줄에 세션 번호.
  //
  // 🔴 서버가 가린 값(***)은 풀거나 추측하지 않는다 — 이름만 낸다.

  const props = defineProps<{
    row: AdminAuditLog
    fieldLabels: Readonly<Record<string, string>>
    messages: AuditLogMessages
  }>()

  const diff = computed(() => diffAuditMeta(props.row.meta, props.messages.absent))
  const restJson = computed(() => (diff.value.rest == null ? '' : metaJson(diff.value.rest)))

  function fieldLabel(key: string): string | null {
    return Object.hasOwn(props.fieldLabels, key) ? (props.fieldLabels[key] ?? null) : null
  }
</script>

<template>
  <div class="audit-log-detail">
    <template v-if="diff.hasDiff">
      <div class="audit-log-detail__title">{{ messages.changesTitle }}</div>
      <table v-if="diff.changes.length > 0" class="audit-log-detail__diff">
        <thead>
          <tr>
            <th>{{ messages.changeField }}</th>
            <th>{{ messages.changeBefore }}</th>
            <th>{{ messages.changeAfter }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="change in diff.changes" :key="change.key">
            <td>
              <template v-if="fieldLabel(change.key)">
                {{ fieldLabel(change.key) }}
                <span class="audit-log-detail__key">{{ change.key }}</span>
              </template>
              <template v-else>{{ change.key }}</template>
            </td>
            <td>{{ change.before }}</td>
            <td>{{ change.after }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="text-body-2">{{ messages.noChanges }}</p>
      <p v-if="diff.masked.length > 0" class="text-body-2 text-medium-emphasis">
        {{ messages.masked(diff.masked) }}
      </p>
    </template>
    <template v-if="restJson !== ''">
      <div class="audit-log-detail__title">{{ messages.restTitle }}</div>
      <pre class="audit-log-detail__json">{{ restJson }}</pre>
    </template>
    <p v-if="!diff.hasDiff && restJson === ''" class="text-body-2 text-medium-emphasis">
      {{ messages.nothingRecorded }}
    </p>
    <div class="text-body-2">
      <strong>{{ messages.requestLabel }}</strong>
      {{ row.method }} {{ row.path }}
      <template v-if="row.sessionNo != null">
        · {{ messages.sessionLabel(row.sessionNo) }}</template
      >
    </div>
    <div v-if="row.userAgent" class="text-body-2 audit-log-detail__ua">
      <strong>{{ messages.userAgentLabel }}</strong>
      {{ row.userAgent }}
    </div>
  </div>
</template>

<style scoped>
  .audit-log-detail {
    display: grid;
    gap: 8px;
    padding: 12px 4px;
  }
  .audit-log-detail__title {
    font-weight: 600;
    font-size: 0.875rem;
  }
  .audit-log-detail__diff {
    border-collapse: collapse;
    font-size: 0.875rem;
  }
  .audit-log-detail__diff th,
  .audit-log-detail__diff td {
    border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
    padding: 4px 8px;
    text-align: left;
    vertical-align: top;
    overflow-wrap: anywhere;
  }
  .audit-log-detail__key {
    font-family: Consolas, Monaco, monospace;
    font-size: 0.8em;
    opacity: 0.7;
  }
  .audit-log-detail__json {
    background-color: rgb(var(--v-theme-surface-variant));
    border-radius: 4px;
    font-family: Consolas, Monaco, monospace;
    font-size: 0.85em;
    margin: 0;
    max-height: 320px;
    overflow: auto;
    padding: 12px;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .audit-log-detail__ua {
    overflow-wrap: anywhere;
  }
</style>
```

`packages/admin-ui/src/components/audit/AuditLogTable.vue`:

```vue
<script setup lang="ts" generic="R extends AdminAuditLog">
  import { computed } from 'vue'
  import { VBtn, VChip } from 'vuetify/components'
  import type { AdminAuditLog, AuditCatalog } from '@ssworks/admin-shared'
  import { formatDateTime } from '../../utils/format-date-time.js'
  import EmptyState from '../common/EmptyState.vue'
  import DataTableBody from '../table/DataTableBody.vue'
  import type { AdminTableHeader } from '../table/data-table.js'
  import AuditLogDetail from './AuditLogDetail.vue'
  import {
    actorText,
    auditResultOf,
    auditResultText,
    targetText,
    type AuditLogMessages,
    type AuditResultKind,
  } from './audit-log.js'

  // 감사 로그 표(내부 부품) — 셀 · 이 사람 기록만 · 글자 펼침 버튼 · 펼친 행 · 빈 상태(A12 · A13 · A15).
  //
  // 정본: hangang-home apps/admin/src/pages/settings/audit-logs.vue `DataTableBody` 부분
  // 바꾼 점: 결과를 칩 + 글자로(crm 칩 · hangang 글자), 행위자 셀에 "이 사람 기록만"(A10).
  //
  // 🔴 펼침 키는 `String(logNo)` 다 — 키가 없으면 한 행을 펼칠 때 전 행이 펼쳐지고, bigint 는 비교가 안 된다(hangang).
  //    `item-value` · `expanded` 는 `DataTableBody` 의 props 가 아니라 루트 `VDataTableServer` 로 떨어지는 속성이다.
  // 🔴 펼침 버튼은 아이콘이 아니라 글자다 — 사람이 읽고, 테스트가 글자로 찾는다(hangang 453).
  // 🔴 머리 정렬을 모두 막는다 — 서버가 최신순만 낸다(A11). 화살표만 움직이면 거짓 신호다.

  const props = withDefaults(
    defineProps<{
      rows: readonly R[]
      itemsLength: number
      loading: boolean
      loadFailed: boolean
      filtered: boolean
      expanded: readonly string[]
      catalog: AuditCatalog
      fieldLabels: Readonly<Record<string, string>>
      messages: AuditLogMessages
      formatDate?(iso: string): string
    }>(),
    { formatDate: undefined },
  )

  const page = defineModel<number>('page', { default: 1 })
  const itemsPerPage = defineModel<number>('itemsPerPage', { default: 20 })

  const emit = defineEmits<{
    'update:expanded': [keys: string[]]
    filterByActor: [row: R]
  }>()

  const RESULT_COLOR: Record<AuditResultKind, string> = {
    success: 'success',
    redirect: 'info',
    denied: 'warning',
    error: 'error',
  }

  const headers = computed<AdminTableHeader[]>(() => [
    { title: props.messages.columnCreateAt, key: 'createAt', sortable: false, nowrap: true },
    { title: props.messages.columnActor, key: 'actor', sortable: false },
    { title: props.messages.columnAction, key: 'action', sortable: false },
    { title: props.messages.columnTarget, key: 'target', sortable: false },
    { title: props.messages.columnResult, key: 'statusCode', sortable: false, nowrap: true },
    { title: props.messages.columnIp, key: 'ip', sortable: false, nowrap: true },
    { title: '', key: 'data-table-expand', sortable: false, align: 'end' },
  ])

  const expandedKeys = computed(() => [...props.expanded])
  const rowKey = (row: R) => String(row.logNo)
  /** 슬롯 props 의 타입이 넓다 — 행 타입을 되찾는다(hangang 247) */
  const row = (item: unknown) => item as R

  function format(iso: string): string {
    return props.formatDate ? props.formatDate(iso) : formatDateTime(iso, { seconds: true })
  }
</script>

<template>
  <DataTableBody
    v-model:items-per-page="itemsPerPage"
    v-model:page="page"
    class="audit-log-table"
    :expanded="expandedKeys"
    :headers="headers"
    :item-value="rowKey"
    :items="rows"
    :items-length="itemsLength"
    :loading="loading"
    @update:expanded="emit('update:expanded', $event)"
  >
    <template #item.createAt="{ item }">
      <span class="audit-log-table__time">{{ format(row(item).createAt) }}</span>
    </template>
    <template #item.actor="{ item }">
      <div>{{ actorText(row(item), messages) }}</div>
      <VBtn
        v-if="row(item).actorUserNo != null"
        :aria-label="messages.filterByActorLabel(actorText(row(item), messages))"
        class="audit-log-table__actor-button"
        size="x-small"
        variant="text"
        @click="emit('filterByActor', row(item))"
      >
        {{ messages.filterByActor }}
      </VBtn>
    </template>
    <template #item.action="{ item }">
      <div>{{ catalog.labelOf(row(item).action) }}</div>
      <div
        v-if="catalog.labelOf(row(item).action) !== row(item).action"
        class="audit-log-table__code"
      >
        {{ row(item).action }}
      </div>
    </template>
    <template #item.target="{ item }">{{ targetText(row(item), catalog) }}</template>
    <template #item.statusCode="{ item }">
      <VChip
        :color="RESULT_COLOR[auditResultOf(row(item).statusCode)]"
        size="x-small"
        variant="tonal"
      >
        {{ auditResultText(row(item).statusCode, messages) }}
      </VChip>
      <div v-if="row(item).errorCode" class="audit-log-table__code">{{ row(item).errorCode }}</div>
    </template>
    <template #item.ip="{ item }">{{ row(item).ip ?? '—' }}</template>
    <template #item.data-table-expand="{ item, internalItem, isExpanded, toggleExpand }">
      <VBtn
        :aria-expanded="isExpanded(internalItem)"
        :aria-label="
          messages.expandLabel(
            format(row(item).createAt),
            catalog.labelOf(row(item).action),
            isExpanded(internalItem),
          )
        "
        size="small"
        variant="text"
        @click="toggleExpand(internalItem)"
      >
        {{ isExpanded(internalItem) ? messages.collapse : messages.expand }}
      </VBtn>
    </template>
    <template #expanded-row="{ columns, item }">
      <tr class="audit-log-table__expanded">
        <td :colspan="columns.length">
          <AuditLogDetail :field-labels="fieldLabels" :messages="messages" :row="row(item)" />
        </td>
      </tr>
    </template>
    <template #no-data>
      <EmptyState
        v-if="!loadFailed"
        :filtered="filtered"
        :filtered-title="messages.filteredEmptyTitle"
        :title="messages.emptyTitle"
      />
    </template>
  </DataTableBody>
</template>

<style scoped>
  .audit-log-table__time {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .audit-log-table__code {
    font-family: Consolas, Monaco, monospace;
    font-size: 0.78rem;
    opacity: 0.7;
    overflow-wrap: anywhere;
  }
  .audit-log-table__actor-button {
    margin-left: -8px;
  }
</style>
```

(동작 셀의 아래 줄은 라벨이 코드와 다를 때만 그린다 — 카탈로그 밖 코드를 두 번 적지 않는다. Review Focus 5.)

`packages/admin-ui/src/components/audit/AuditLogViewer.vue`:

```vue
<script setup lang="ts" generic="R extends AdminAuditLog">
  import { VAlert, VBtn } from 'vuetify/components'
  import type { AdminAuditLog, AuditCatalog } from '@ssworks/admin-shared'
  import AuditLogFilterBar from './AuditLogFilterBar.vue'
  import AuditLogTable from './AuditLogTable.vue'
  import type { AuditFilterItem, AuditLogDraft, AuditLogMessages } from './audit-log.js'

  // 감사 로그 화면 한 벌 — 읽기 전용 안내 · 조회 실패 알림 · 필터 카드 · 머리 줄 · 표.
  // 흐름은 `useAuditLogs` 가 갖고, 이 컴포넌트는 그 바인딩(`audit.viewer.value`)을 받아 그리고 이벤트만 낸다.
  //
  // 정본: hangang-home apps/admin/src/pages/settings/audit-logs.vue 템플릿
  // 바꾼 점: `ColumnPane` 루트 · 페이지 제목이 없다 — 틀과 제목은 페이지 몫이다(C6). 조회 실패는 알림 + [다시 시도](C7).
  //   내보내기 · 만들기 · 수정 · 삭제 버튼을 두지 않는다 — 읽기 전용이고 서버에 그 라우트가 없다(hangang 46).

  withDefaults(
    defineProps<{
      draft: AuditLogDraft
      actorMode: 'search' | 'number'
      actorHint: string | null
      actorItems: readonly AuditFilterItem[]
      actorSearching: boolean
      actorSearchFailed: boolean
      actionItems: readonly AuditFilterItem[]
      targetItems: readonly AuditFilterItem[]
      filterError: string | null
      rows: readonly R[]
      itemsLength: number
      page: number
      itemsPerPage: number
      loading: boolean
      loadFailed: boolean
      filtered: boolean
      expanded: readonly string[]
      catalog: AuditCatalog
      fieldLabels: Readonly<Record<string, string>>
      messages: AuditLogMessages
      /** 시각 표기. 기본 `YYYY-MM-DD HH:mm:ss`(브라우저 현지 시각) */
      formatDate?(iso: string): string
    }>(),
    { formatDate: undefined },
  )

  const emit = defineEmits<{
    'update:draft': [draft: AuditLogDraft]
    searchActors: [keyword: string]
    apply: []
    reset: []
    'update:page': [page: number]
    'update:itemsPerPage': [size: number]
    retry: []
    'update:expanded': [keys: readonly string[]]
    filterByActor: [row: R]
  }>()
</script>

<template>
  <div class="audit-log-viewer">
    <p class="text-body-2 text-medium-emphasis">{{ messages.readOnlyNote }}</p>
    <VAlert v-if="loadFailed" density="compact" type="error" variant="tonal">
      <div class="audit-log-viewer__alert">
        <span>{{ messages.loadFailed }}</span>
        <VBtn size="small" variant="text" @click="emit('retry')">{{ messages.retry }}</VBtn>
      </div>
    </VAlert>
    <AuditLogFilterBar
      :action-items="actionItems"
      :actor-hint="actorHint"
      :actor-items="actorItems"
      :actor-mode="actorMode"
      :actor-search-failed="actorSearchFailed"
      :actor-searching="actorSearching"
      :draft="draft"
      :filter-error="filterError"
      :messages="messages"
      :target-items="targetItems"
      @apply="emit('apply')"
      @reset="emit('reset')"
      @search-actors="emit('searchActors', $event)"
      @update:draft="emit('update:draft', $event)"
    />
    <div class="audit-log-viewer__head text-body-2 text-medium-emphasis">
      <span>{{ loadFailed ? '' : messages.total(itemsLength) }}</span>
      <span>{{ messages.fixedSortLabel }}</span>
    </div>
    <AuditLogTable
      :catalog="catalog"
      :expanded="expanded"
      :field-labels="fieldLabels"
      :filtered="filtered"
      :format-date="formatDate"
      :items-length="itemsLength"
      :items-per-page="itemsPerPage"
      :load-failed="loadFailed"
      :loading="loading"
      :messages="messages"
      :page="page"
      :rows="rows"
      @filter-by-actor="emit('filterByActor', $event)"
      @update:expanded="emit('update:expanded', $event)"
      @update:items-per-page="emit('update:itemsPerPage', $event)"
      @update:page="emit('update:page', $event)"
    />
  </div>
</template>

<style scoped>
  .audit-log-viewer {
    display: grid;
    gap: 12px;
  }
  .audit-log-viewer__alert {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .audit-log-viewer__head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px;
  }
</style>
```

- [ ] **Step 3: 통과를 확인한다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/audit/audit-log-viewer.render.test.ts`
Expected: PASS

막히면 먼저 이 순서로 본다:

- 펼침 테스트만 실패 — Vuetify 4.2 의 `item.data-table-expand` 슬롯 props(`internalItem` · `isExpanded` · `toggleExpand`)와 `#expanded-row` 의 `columns` 를 `node_modules/vuetify/lib/components/VDataTable/VDataTableRow.d.ts` 에서 확인한다. `DataTableBody` 가 속성을 루트로 떨어뜨리지 않으면(`inheritAttrs`) 그 사실을 보고하고 멈춘다 — `DataTableBody` 를 고치는 일은 이 플랜 범위 밖이다.
- `VAutocomplete` 이벤트 테스트만 실패 — 킷 `team-move-dialog.render.test.ts` 가 같은 방식(`findComponent(VAutocomplete).vm.$emit`)을 쓴다. 라벨로 찾는 부분이 맞는지 본다.

Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: 통과. 제네릭 SFC 의 `defineModel` · 슬롯 타입 오류가 나면 `row()` 도우미로 좁힌다(위 코드처럼).

- [ ] **Step 4: 빌드로 위험 ① 을 잰다 — 제네릭 SFC 의 d.ts**

Run: `pnpm --filter @ssworks/admin-ui build`
Expected: 성공. `packages/admin-ui/dist/` 아래에 `AuditLogViewer.vue.d.ts`(또는 같은 이름의 선언)가 생기고, 그 안에 `R extends AdminAuditLog` 제네릭이 남아 있다. 3d `TeamUserList` · 3e `LegalDocumentEditor` 와 같은 방식으로 나온다.

- [ ] **Step 5: 커밋한다**

```bash
git add packages/admin-ui/src/components/audit/AuditLogFilterBar.vue packages/admin-ui/src/components/audit/AuditLogDetail.vue packages/admin-ui/src/components/audit/AuditLogTable.vue packages/admin-ui/src/components/audit/AuditLogViewer.vue packages/admin-ui/src/components/audit/audit-log-viewer.render.test.ts
git commit -m "feat(admin-ui): AuditLogViewer — 필터 카드 · 표(칩 + 글자 · 이 사람 기록만) · 펼친 행 diff · 빈 상태" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 공개 · README · changeset · 진행 문서 · 최종 확인

**Files:**

- Modify: `packages/admin-ui/src/index.ts`
- Modify: `packages/admin-ui/README.md`("## 감사 로그" 절 — "## 약관" 절 뒤)
- Create: `.changeset/admin-ui-audit.md`
- Modify: `CLAUDE.md`(진행표)
- Modify: `docs/01-phase0.md`(§8)
- Modify: `docs/HANDOFF.md`(103행 · 넘긴 것)

**Interfaces:**

- Consumes: Task 2 · Task 4 · Task 6
- Produces: 공개 export — 값 `useAuditLogs` · `AuditLogViewer`, 타입 `UseAuditLogsOptions` · `AuditLogs` · `AuditLogViewerBindings` · `AuditLogDraft` · `AuditLogFilter` · `AuditActorOption` · `AuditActionGroup` · `AuditFilterItem` · `AuditLogMessages`

- [ ] **Step 1: export 를 더한다**

`packages/admin-ui/src/index.ts` 맨 끝("── 마크다운 · 약관 ──" 절 뒤)에 더한다:

```ts
// ── 감사 로그 ─────────────────────────────────────────────────────────
export { default as AuditLogViewer } from './components/audit/AuditLogViewer.vue'
export {
  type AuditActorOption,
  type AuditActionGroup,
  type AuditLogDraft,
  type AuditLogFilter,
  type AuditFilterItem,
  type AuditLogMessages,
} from './components/audit/audit-log.js'
export {
  useAuditLogs,
  type UseAuditLogsOptions,
  type AuditLogs,
  type AuditLogViewerBindings,
} from './composables/useAuditLogs.js'
```

- [ ] **Step 2: README 절을 쓴다**

`packages/admin-ui/README.md` 의 "## 약관" 절(그 아래 "### 알려진 한계 · 수동 확인" 까지) 뒤에 더한다:

````md
## 감사 로그

관리자 쓰기 · 인증 사건의 기록을 읽는 화면이다. 읽기 전용이고 내보내기는 없다. 필터는 입력한 뒤 [적용]을 눌러야 조회한다 — 입력 중에 조회하지 않는다. 페이지 제목 · 카드 틀 · 메뉴는 템플릿 몫이다.

### Phase 2 서버를 쓰는 새 서비스

```ts
// api/audit.ts
export const auditApi = {
  list: (params: ServerTableParams<AuditLogFilter>) =>
    api.get<Paginated<AdminAuditLog>>('/admin/audit-logs', { params }),
  // 행위자 자동완성 — /users 의 검색어(아이디 · 이름 부분일치). 퇴사자의 지난 행위도 감사 대상이라 상태로 거르지 않는다
  searchActors: (keyword: string) =>
    api
      .get<Paginated<AdminUser>>('/admin/users', {
        params: { page: 1, itemsPerPage: 20, filter: { keyword } },
      })
      .then((r) =>
        r.items.map((u) => ({
          userNo: u.userNo,
          userId: u.userId,
          userName: u.userName,
          resigned: u.resignAt != null,
        })),
      ),
}
```

```ts
const audit = useAuditLogs({
  fetch: auditApi.list,
  catalog: auditCatalog, // 프로젝트 defineAuditCatalog — 서버 audit.catalog 와 같은 객체
  searchActors: auditApi.searchActors,
  canSearchActors: () => can(P.USERS_READ), // 거짓이면 번호 칸 — /users 를 부르지 않는다
  urlSync: true,
  fieldLabels: { roleName: '역할 이름', permissions: '권한', cidr: 'CIDR', description: '설명' },
})
```

```vue
<CardLayout>
  <VCardTitle>감사 로그</VCardTitle>
  <AuditLogViewer v-bind="audit.viewer.value" />
</CardLayout>
```

- **동작 필터**: "[묶음] 역할 (org.role.\*)" 은 그 계열 전체, "역할 수정 (org.role.update)" 은 그 동작 하나다. 프로젝트 액션 묶음은 `actionGroups: [{ prefix: 'members.points', label: '포인트' }]` 로 더한다. 걸리는 액션이 둘 이상일 때만 항목이 된다.
- **바뀐 항목**: 서버 `attachAuditDiff` 의 `before` · `after` 를 표로 보인다. 같은 값은 빼고, 서버가 가린 값(`***`)은 이름만 적는다. 항목 이름은 `fieldLabels` 가 있으면 라벨, 없으면 키 원문이다.
- **기간**: 날짜 두 칸은 브라우저 시간대 기준이고 끝 날짜의 하루 전체를 포함한다(다음 날 0시 전까지).

### 다른 화면에서 걸러진 감사 기록으로 보내기

`urlSync: true` 면 필터가 주소에 실린다. 키는 `actor` · `action` · `targetType` · `targetRefNo` · `from` · `to`(로컬 `YYYY-MM-DD`)다. 형식이 틀린 키는 없는 것으로 친다.

```ts
// 사용자 상세 → 그 사람이 한 일
router.push({ path: '/settings/audit-logs', query: { actor: String(user.userNo) } })
// 역할 화면 → 그 역할에 일어난 일
router.push({
  path: '/settings/audit-logs',
  query: { targetType: 'role', targetRefNo: String(role.roleNo) },
})
// 묶음은 값 끝에 점 — 로그인 실패 · 차단만
router.push({ path: '/settings/audit-logs', query: { action: 'auth.login.' } })
```

### 알려진 한계 · 수동 확인

- 행위자 칸에 번호로만 들어온 사람(URL · 셀 버튼)은 목록에 그 사람의 행이 보이기 전까지 `#번호` 로 보인다. 번호로 이름을 찾으려고 따로 부르지 않는다.
- 테스트가 잴 수 없어 사람이 확인하는 것 — 좁은 폭에서 필터 칸 일곱이 줄바꿈되는지, 자동완성 디바운스(300ms)와 검색 중 표시의 체감.
````

Run: `pnpm exec prettier --write packages/admin-ui/README.md` 를 두 번, 그다음 `pnpm exec prettier --check packages/admin-ui/README.md`
Expected: 통과

- [ ] **Step 3: changeset 을 만든다**

`.changeset/admin-ui-audit.md`:

```md
---
'@ssworks/admin-ui': minor
---

PR #3f — 감사 로그 조회 화면.

- **소비자가 할 일:** admin-ui 의 peer `@ssworks/admin-shared` 하한이 `>=0.4.0` 이 됐다(감사 카탈로그를 런타임에 쓴다). 세 패키지를 같은 번호로 설치하면 할 일이 없다.
- admin-ui 새 API: `useAuditLogs` · `AuditLogViewer`, 타입 `UseAuditLogsOptions` · `AuditLogs` · `AuditLogViewerBindings` · `AuditLogDraft` · `AuditLogFilter` · `AuditActorOption` · `AuditActionGroup` · `AuditFilterItem` · `AuditLogMessages`.
  - 입력값/적용값 분리 · 같은 조건 재적용 · 검증 실패면 조회 안 함.
  - 동작 필터 묶음(prefix · 값 끝 점)과 개별(exact).
  - 행위자 서버 검색(`searchActors` + 권한 게터, 없으면 번호 칸) · "이 사람 기록만".
  - 선택 옵션 `urlSync`(`actor` · `action` · `targetType` · `targetRefNo` · `from` · `to`).
  - 펼친 행의 바뀐 항목 diff(가린 값은 이름만) · `fieldLabels`.
- 서버 계약은 그대로다(`GET /admin/audit-logs`). 기존 API 동작은 바뀌지 않는다.
```

Run: `pnpm changeset status`
Expected: `@ssworks/admin-ui` minor 가 보이고, `fixed` 묶음이라 admin-shared · admin-server 도 같은 번호로 오른다고 나온다.

- [ ] **Step 4: 진행 문서를 갱신한다**

`CLAUDE.md` 진행표에서 "킷 버전 상향 — ringside 선행" 행 아래, "Phase 4 —" 행 위에 두 행을 더한다:

```md
| Phase 1 후속 PR #3f — `useAuditLogs` · `AuditLogViewer`(감사 로그 조회 · 입력/적용 · URL · 행위자 검색 · peer 하한 0.4.0) | 완료 | 스펙 `docs/superpowers/specs/2026-10-18-admin-ui-audit-ip-design.md` · 플랜 `docs/superpowers/plans/2026-10-18-admin-ui-audit.md` |
| Phase 1 후속 PR #3g — `useIpAccessRules` · `IpAccessManager`(IP 접근 제어 관리 화면) | 다음(3f 머지 뒤 플랜) | 스펙 `docs/superpowers/specs/2026-10-18-admin-ui-audit-ip-design.md` |
```

`docs/01-phase0.md` §8 의 "킷 버전 상향(2026-10-17) 완료 —" 문단 뒤, "다음:" 문단 앞에 더한다:

```md
admin-ui 감사 로그 화면 PR #3f(2026-10-18) 완료 — `useAuditLogs` · `AuditLogViewer`(입력/적용 · 묶음 prefix · 행위자 서버 검색 · URL · 바뀐 항목 diff), admin-ui peer admin-shared 하한 0.4.0(스펙 `docs/superpowers/specs/2026-10-18-admin-ui-audit-ip-design.md` · 플랜 `docs/superpowers/plans/2026-10-18-admin-ui-audit.md`). IP 접근 제어 화면 PR #3g 는 다음이다.
```

`docs/HANDOFF.md`:

- "PR 2c 가 넘긴 것" 아래 줄 ` - 감사 화면(admin-ui 에 없다 — 템플릿 B 가`adminAuditLogSchema`·`labelOf` 로), 보존 · 청소(B), 가드 거부(401 · 403)는 남지 않는다(⑧ F1).` 의 끝에 `→ 감사 화면은 **3f 에서 닫음**(2026-10-18 — B 가 아니라 admin-ui A 로:`useAuditLogs`·`AuditLogViewer`)` 를 붙인다.
- "킷 상향이 넘긴 것(2026-10-17)" 블록 뒤에 블록을 더한다:

```md
- **PR #3f 가 넘긴 것(2026-10-18)**
  - 템플릿 `preset/admin` 에 감사 로그 페이지를 반영한다 — `pages/settings/audit-logs.vue` · `api/audit.ts`(admin-ui README "## 감사 로그" 예시 그대로, `canSearchActors` 는 users 읽기 권한). 템플릿 push 는 사람.
  - PR #3g(IP 접근 제어 화면) 플랜 — 3f 의 `useRemoteSearch` · `local-date` · 화면 한 벌 패턴을 쓴다.
```

Run: `pnpm exec prettier --write CLAUDE.md docs/01-phase0.md docs/HANDOFF.md` 를 두 번, 그다음 `pnpm exec prettier --check CLAUDE.md docs/01-phase0.md docs/HANDOFF.md`
Expected: 통과

- [ ] **Step 5: 전체 검사를 돌린다**

Run: `pnpm check`
Expected: lint → typecheck → test → build → check:dts 모두 초록. 테스트 수를 기록해 둔다(PR 본문에 적는다).

- [ ] **Step 6: 발행 형태를 확인한다**

`/smoke` 스킬을 실행한다(패킹한 tarball 을 임시 소비 앱에서 typecheck · build). Windows 긴 경로 때문에 짧은 `%TEMP%` 경로에서 돌린다. 스모크 앱 코드에 아래 두 줄을 더해 공개 타입이 쓰이는지 본다:

```ts
import { AuditLogViewer, useAuditLogs, type AuditLogViewerBindings } from '@ssworks/admin-ui'
const _bindings: AuditLogViewerBindings<import('@ssworks/admin-shared').AdminAuditLog> | null = null
```

Expected: `KIT+APP OK` — 킷 출처 타입 오류 0.

- [ ] **Step 7: 커밋한다**

```bash
git add packages/admin-ui/src/index.ts packages/admin-ui/README.md .changeset/admin-ui-audit.md CLAUDE.md docs/01-phase0.md docs/HANDOFF.md
git commit -m "docs(admin-ui): PR #3f — 감사 로그 공개 · README 절 · changeset · 진행 문서" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

PR 은 만들지 않는다 — push 는 사람이 한다(`.claude/settings.json` 이 `git push` 를 거부한다). 브랜치 상태와 테스트 수를 보고한다.
