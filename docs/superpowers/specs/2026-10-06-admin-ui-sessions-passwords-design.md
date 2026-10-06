# admin-ui 세션 · 비밀번호 설계 (Phase 1 PR #3c)

작성일: 2026-10-06 · 상태: 확정(구현 전) · 선행: PR #3a 스펙(`2026-10-03-admin-ui-list-write-design.md`) §4-3 · §4-4, PR #3b 스펙(`2026-10-04-admin-ui-roles-settings-design.md`) §4-6 · §11, `docs/phase0-reports/fe-pages.md` §1-A · §1-E · §2-2, `be-core-auth.md` · `be-modules.md`

## 1. 목표

세션 화면과 비밀번호 화면의 공통 부분을 패키지에 넣는다. 화면 배치(내 계정 화면, 강제 변경 화면, 계정별 세션 다이얼로그, 사용자 목록의 행 메뉴)는 템플릿(B)에 남긴다.

- admin-shared 에 세션 행 스키마, 기기 문구 해석, 비밀번호 정책 팩토리를 먼저 둔다. Phase 2 서버와 admin-ui 가 같은 모양 · 같은 숫자를 본다.
- admin-ui 에 `SessionTable`(표시) · `useSessions`(조회 · 끊기 흐름) · `TemporaryPasswordDialog` · `copyText` · `PasswordChangeForm` 을 넣는다.
- `AdminUserInfo` 에 강제 변경 표시(`isPasswordChangeRequired?`)를 더한다. 강제 변경 가드는 이미 `createAdminGuard` 에 있다.

새 peer 의존은 없다.

## 2. 결정

### 2-1. 3c 경계 결정 (2026-10-05)

결정 문서: https://claude.ai/artifact/JsdnYqHB59mML1Bs6sTWtU (세션 아티팩트 — 지워져도 아래 표가 정본이다)

| 결정                    | 확정                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| ① 세션 화면 구성        | **S1** — 표시용 `SessionTable` + 흐름용 `useSessions`. 관리자 전체 목록도 같은 조합(`useSessions` 가 `useServerTable` 을 감쌈) |
| ② 기기 문구             | **D1** — 행에는 브라우저 원문(`userAgent`)만, 킷의 `describeUserAgent()` 가 해석(gise)                                         |
| ③ 현재 세션 · 자기 자신 | **C1** — 현재 세션은 목록에서 끊지 못함(로그아웃 안내). 내 계정 전체 끊기는 1인칭 경고 후 허용                                 |
| ④ 세션 동작 범위        | **A1** — 하나 끝내기 · 다른 세션 모두 · 사용자 전체, 셋 다 어댑터가 준 것만                                                    |
| ⑤ 임시 비밀번호         | **T1** — `TemporaryPasswordDialog`(gise 모양 + hangang 규칙) + `copyText()`                                                    |
| ⑥ 비밀번호 변경         | **P1** — `PasswordChangeForm` 컴포넌트. 요청 · 성공 뒤 처리는 페이지가 `useWriteFlow` 로                                       |
| ⑦ 틀린 현재 비밀번호    | **W1** — `ERR_COMMON_VALIDATION` + `details.issues[{ path: ['currentPassword'] }]`(gise)                                       |
| ⑧ 비밀번호 길이 정책    | **L2** — admin-shared 정책 팩토리로 서버 · 화면 공유, **기본 최소 8자**(권장안 12자에서 바꿈)                                  |
| 릴리스                  | changeset minor. 전부 추가라 Version Packages PR #2 를 보류할 필요가 없다                                                      |

### 2-2. 3c 설계 결정

| #   | 결정                                                                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 계약을 admin-shared 에 먼저 둔다(3b 와 같은 방식). 와이어 필드명은 `lastAccessAt` · `loginAt`(Phase 2 정본 hangang 컬럼, crm · axion 도 같음), `userAgent`(원문임이 드러나는 이름). 임시 비밀번호 응답 키는 `temporaryPassword`(gise) — 변경 본문의 `newPassword` 와 뜻이 겹치지 않게         |
| D2  | `describeUserAgent()` 는 admin-shared 에 둔다. 프레임워크 무관한 순수 함수라 Phase 2 서버가 감사 로그 문구에 같은 함수를 쓸 수 있다                                                                                                                                                           |
| D3  | `SessionTable` 은 두 모드 모두 킷 `DataTableBody` 위에 그린다. `itemsLength` 를 주면 서버 페이징, 안 주면 행 전부 + 쪽 이동 숨김. 열 머리 정렬은 없다(네 곳 모두 마지막 활동 내림차순 고정)                                                                                                   |
| D4  | 🔴 현재 세션 행에는 "끝내기" 가 없다. 목록에서 끊으면 다음 요청이 401 이 되어 화면이 갑자기 로그인으로 튕긴다 — 로그아웃 버튼이 같은 일을 정상 경로로 한다. 내 계정 전체 끊기는 1인칭 경고로 확인받고, 성공하면 재조회 대신 `onSelfSignedOut` 을 부른다                                       |
| D5  | 세션 동작 셋 모두 `confirm` 관문 · `reversible: false`(끊은 세션은 되살릴 수 없다). 재인증은 걸지 않는다(네 곳 모두 없음)                                                                                                                                                                     |
| D6  | 요청이 실제로 나갔으면 성공 · 실패 모두 재조회한다(404 = 이미 끝난 세션). 관문 취소면 재조회하지 않는다 — 3b `useRoleEditor` 와 같은 규칙                                                                                                                                                     |
| D7  | 🔴 `TemporaryPasswordDialog` 의 `v-model` 은 값 자체(`string \| null`)다. 닫기가 곧 `null` 을 내보내 부모의 값을 비운다 — "닫으면 부모가 비운다" 를 부모의 성실함에 맡기지 않는다                                                                                                             |
| D8  | 복사 결과 문구는 토스트가 아니라 다이얼로그 안 값 바로 아래에 낸다(관리자가 지금 보는 자리). `execCommand('copy')` 대체 경로는 두지 않는다 — 화면의 글자가 정본이다                                                                                                                           |
| D9  | `PasswordChangeForm` 은 `submit: (body) => Promise<boolean>` prop 을 받는다. `true` 면 세 칸을 비우고 `false` 면 둔다. 페이지는 `useWriteFlow({ gate: 'none', fields: ['currentPassword', 'newPassword'] })` 로 보낸다 — 재인증 관문을 쓰지 않는다(본문이 이미 현재 비밀번호를 받음, hangang) |
| D10 | 정책 기본값은 최소 8자 · 최대 200자. `changePasswordSchema` 에는 "새 = 현재" 검사(`.refine`, 경로 `newPassword`)를 건다 — 3b 의 "refine 금지"(§11 R1)는 소비자가 `.omit()` 할 코어 행 스키마 이야기이고, 이 스키마는 변경 본문 전용이라 덜어 낼 일이 없다                                     |

## 3. 정본과 흡수 목록

| 산출물                    | 정본                                                                                             | 흡수할 것                                                                                                                                  | 버릴 것                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 세션 스키마               | hangang `sessions.*`(컬럼 · 라우트) + crm `session.schema.ts`(목록 행)                           | 공통 필드, 목록 행의 사용자 필드, `isCurrent`, `{ revokedCount }`                                                                          | crm `source` · `apiKeyName` · `device{}`(→ B / D1), gise `lastActiveAt`(실제는 행 생성 시각)                 |
| `describeUserAgent`       | gise `apps/admin/src/utils/user-agent.ts`                                                        | 판정 순서 표 · 결과 문구 4종                                                                                                               | —                                                                                                            |
| `SessionTable`            | gise `components/SessionTable.vue` + crm `SessionsAdminPanel.vue`(사용자 열 · 서버 페이징)       | 기기 칸(요약 · "이 기기" 칩 · 원문), 현재 행 안내, 행을 구분하는 접근 이름, `busy` 잠금                                                    | gise `testPrefix` · `data-test`, 클라이언트 전용 `VDataTable`(→ `DataTableBody`), crm 메뉴(→ 텍스트 버튼)    |
| `useSessions`             | gise `pages/me.vue` · `AccountSessionsDialog.vue`(흐름) + hangang `users.vue` "세션 종료"        | 확인 문구표, 응답 경합 방지, 개수 있을 때만 개수, 다른 세션이 있을 때만 "모두", 1인칭 자기 경고                                            | gise "403/404/409 만 재조회, 500 은 다이얼로그 유지"(→ D6), 50개 상한 안내(전량 계약), 각 화면의 상태 흩어짐 |
| `TemporaryPasswordDialog` | gise `components/TemporaryPasswordDialog.vue` + hangang `users.vue` 인라인 · `users-messages.ts` | gise: 컴포넌트 · 제목 2종 · 값 잔존 없음. hangang: 글자로 표시 · 복사 3갈래 · 경고 문구 · 자동으로 닫지 않음 · 세션 폐기 안내              | crm 필드 안 마스크, axion 거짓 복사 성공, gise 토스트 복사 알림                                              |
| `copyText`                | hangang `users.vue:723-737`                                                                      | 3갈래 판정                                                                                                                                 | —                                                                                                            |
| `PasswordChangeForm`      | gise `pages/password.vue` + hangang `pages/account.vue`                                          | gise: 숨은 아이디 칸 · 요청 중 `readonly` · 필드 오류 · 첫 오류 칸 포커스 · 이중 제출 방지. hangang: 킷 `PasswordField` · 재인증 관문 없음 | crm 필드별 자체 눈 토글, 상단 알림 하나로 뭉뚱그린 오류(crm · hangang), 화면 배치                            |
| 비밀번호 정책             | gise `ACCOUNT_LIMITS` · `ADMIN_PASSWORD_LENGTH_MESSAGE`(shared 공유)                             | 서버 · 화면이 같은 숫자 · 같은 문구, "새 = 현재" 를 `newPassword` 필드 오류로                                                              | 복잡도 규칙(네 곳 모두 없음)                                                                                 |

## 4. 공개 API

### 4-1. admin-shared 세션 스키마 (`src/sessions.ts`)

```ts
export const adminSessionSchema = z.object({
  sessionNo: z.bigint(),
  /** 브라우저 원문. 화면이 `describeUserAgent()` 로 해석한다. 없으면 null */
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  loginAt: z.iso.datetime(),
  lastAccessAt: z.iso.datetime(),
  expireAt: z.iso.datetime(),
  /** 요청한 사람이 지금 쓰는 세션인가 — 목록에서 끊지 못하게 막는 근거(D4) */
  isCurrent: z.boolean(),
})

/** 관리자 전체 목록 행 — 누구의 세션인지가 더 붙는다 */
export const adminSessionListItemSchema = adminSessionSchema.extend({
  userNo: z.bigint(),
  userId: z.string(),
  userName: z.string(),
})

/** "다른 세션 모두" · "사용자 전체" 의 응답 */
export const adminSessionRevokeResultSchema = z.object({ revokedCount: z.number().int().min(0) })

export type AdminSession = z.infer<typeof adminSessionSchema>
export type AdminSessionListItem = z.infer<typeof adminSessionListItemSchema>
export type AdminSessionRevokeResult = z.infer<typeof adminSessionRevokeResultSchema>
```

- 🔴 날짜는 와이어에서 ISO UTC 문자열(`Z`)이다. 킷 JSON 코덱은 `"BigInt(n)"` 만 되살리고 날짜는 문자열로 둔다. `z.iso.datetime()` 은 오프셋 없는 `Z` 형식만 받는다(4.6.5 실측).
- 이 스키마들에도 `.refine()` 을 걸지 않는다(3b §11 R1 — 소비자의 `.extend()` · `.omit()` 을 막지 않는다).

### 4-2. admin-shared `describeUserAgent` (`src/user-agent.ts`)

```ts
export function describeUserAgent(userAgent: string | null | undefined): string
```

- 판정은 앞에서부터 처음 맞는 것. 브라우저: Edge(`Edg/` · `EdgA/` · `EdgiOS/`) → Whale → Samsung Internet(`SamsungBrowser/`) → Firefox(`Firefox/` · `FxiOS/`) → Chrome(`Chrome/` · `CriOS/`) → Safari(`Safari/` 이고 위 어느 것도 아님). 운영체제: ChromeOS(`CrOS`) → iOS(`iPhone` · `iPad` · `iPod`) → Android → Windows → macOS(`Mac OS X` · `Macintosh`) → Linux.
- 🔴 순서가 규칙이다. Edge · Whale · Samsung 원문에는 `Chrome/` 이 들어 있고, Chrome 원문에는 `Safari/` 가 들어 있다. iOS 원문에는 `Mac OS X` 가 들어 있다.
- 결과: 둘 다 알면 `"Chrome · Windows"`, 하나만 알면 그것만, 둘 다 모르면 `"알 수 없는 기기"`, 원문이 `null` · `undefined` · 공백뿐이면 `"기기 정보 없음"`.

### 4-3. admin-shared 비밀번호 (`src/passwords.ts`)

```ts
export interface PasswordPolicyOptions {
  /** 기본 8 */
  minLength?: number
  /** 기본 200 */
  maxLength?: number
}

export interface PasswordPolicy {
  readonly minLength: number
  readonly maxLength: number
  /** "비밀번호는 8자 이상 200자 이하로 정하세요." */
  readonly lengthMessage: string
  /** "새 비밀번호가 현재 비밀번호와 같습니다." */
  readonly sameAsCurrentMessage: string
  /** 새 비밀번호 · 임시 비밀번호 검증 — 길이 위반이면 `lengthMessage` */
  readonly passwordSchema: z.ZodString
  /** 비밀번호 변경 본문. 새 = 현재면 경로 `newPassword` 의 검증 오류 */
  readonly changePasswordSchema: z.ZodType<{ currentPassword: string; newPassword: string }>
}

export function definePasswordPolicy(options?: PasswordPolicyOptions): PasswordPolicy

/** 비밀번호 초기화 응답(그리고 계정 생성 응답에 함께 실리는 값) */
export const adminTemporaryPasswordSchema = z.object({ temporaryPassword: z.string().min(1) })
export type AdminTemporaryPassword = z.infer<typeof adminTemporaryPasswordSchema>
```

- `minLength` 는 1 이상 정수, `maxLength` 는 `minLength` 이상 정수여야 한다. 아니면 정의 시점에 던진다(설정 실수를 첫 실행에서 드러낸다).
- `changePasswordSchema` = `z.object({ currentPassword: z.string().min(1).max(Math.max(maxLength, 256)), newPassword: passwordSchema }).refine(...)`. `currentPassword` 상한을 정책 최대보다 낮추지 않는 이유: 정책을 나중에 줄여도 예전에 정한 긴 비밀번호로 바꾸기를 할 수 있어야 한다.
- 🔴 서버가 이 스키마로 본문을 검증하면 길이 위반과 "새 = 현재" 가 저절로 `ERR_COMMON_VALIDATION` + 필드 경로가 된다(W1). 틀린 현재 비밀번호는 서비스가 같은 모양(경로 `currentPassword`)으로 던진다(§9).

### 4-4. admin-ui `AdminUserInfo`

```ts
export interface AdminUserInfo {
  userId: string
  userName: string
  permissions: readonly string[]
  teamName?: string
  roleName?: string
  /** 임시 비밀번호로 로그인해 새 비밀번호를 정해야 하는가. `createAdminGuard({ isPasswordChangeRequired })` 에 잇는다 */
  isPasswordChangeRequired?: boolean
}
```

### 4-5. `SessionTable`

```ts
export type SessionTableRow = AdminSession &
  Partial<Pick<AdminSessionListItem, 'userNo' | 'userId' | 'userName'>>
```

| prop · 모델 · 이벤트 · 슬롯                            | 내용                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `sessions`                                             | `readonly SessionTableRow[]`                                                          |
| `itemsLength?`                                         | 숫자. 있으면 서버 페이징 모드(쪽 이동 보임), 없으면 전량 모드(쪽 이동 숨김, 행 전부)  |
| `v-model:page` · `v-model:items-per-page`              | 서버 페이징 모드에서만 의미 — 복수 모델 예외 규약                                     |
| `loading`                                              | 기본 false                                                                            |
| `busy`                                                 | 기본 false. 동작 버튼 `:disabled`                                                     |
| `showUser` · `showIp` · `showLoginAt` · `showExpireAt` | 기본 false · true · false · true                                                      |
| `canRevoke` · `canRevokeUser`                          | 기본 true · false                                                                     |
| `emptyText`                                            | 기본 `'로그인된 세션이 없습니다.'`                                                    |
| `formatDate?(iso)`                                     | 메서드 꼴. 기본은 브라우저 현지 시각 `YYYY-MM-DD HH:mm`, 형식이 틀린 값은 원문 그대로 |
| `@revoke(row)` · `@revoke-user(row)`                   | 부모(보통 `useSessions` 바인딩)가 확인 · 요청을 한다                                  |
| `#no-data`                                             | 빈 목록 대체                                                                          |

열(키 · 제목): `user` 사용자 · `device` 기기 · `ipAddress` IP · `loginAt` 로그인 · `lastAccessAt` 마지막 활동 · `expireAt` 만료 · `actions`(제목 없음). 정렬 가능 열 없음.

1. **기기 칸**: `describeUserAgent(row.userAgent)` 요약, 현재 세션이면 `이 기기` 칩, 원문이 있으면 그 아래 작은 글씨로 원문(줄바꿈 허용). 요약이 같은 두 줄을 사람이 구분하는 자리다(gise).
2. **사용자 칸**: `userName (userId)`.
3. **IP**: 없으면 `-`.
4. 🔴 **현재 세션 행**: "끝내기" 버튼이 없고 `이 기기는 로그아웃으로 끝냅니다.` 를 보인다(D4). "사용자 전체 끊기" 는 그 행에도 있다(C1 — 경고는 `useSessions` 가 한다).
5. **버튼**: 텍스트 버튼 `끝내기`(`canRevoke`) · `사용자 전체 끊기`(`canRevokeUser`). 둘 다 `busy` 동안 `:disabled`.
6. **접근 가능한 이름**: 끝내기 = `"{기기 요약} 세션 끝내기 (마지막 활동 {시각})"`, 사용자 열이 보이면 앞에 `"{이름} · "`. 사용자 전체 끊기 = `"{이름}({아이디}) 사용자 전체 끊기"`. 테스트는 이 이름으로 찾는다 — `data-testid` 를 심지 않는다.
7. **표**: 두 모드 모두 `DataTableBody`. 전량 모드는 `items-length = sessions.length` + 쪽 이동 숨김(`VDataTableServer` 는 넘긴 행을 자르지 않는다).

### 4-6. `useSessions`

```ts
export interface SessionDialogText {
  title: string
  message: string
  confirmLabel: string
}

export interface SessionMessages<R> {
  revoke: SessionDialogText
  revokeOthers: SessionDialogText
  revokeUser: (row: R) => SessionDialogText
  revokeUserSelf: (row: R) => SessionDialogText
}

export type SessionAction = 'revoke' | 'revokeOthers' | 'revokeUser'

export interface SessionRevokedEvent<R> {
  action: SessionAction
  row?: R
  /** 서버가 준 경우에만. 없으면 화면이 개수를 지어내지 않는다 */
  revokedCount?: number
}

interface SessionsCommonOptions<R extends SessionTableRow> {
  revoke?: (row: R) => Promise<void>
  revokeOthers?: () => Promise<{ revokedCount?: number } | void>
  revokeUser?: (row: R) => Promise<{ revokedCount?: number } | void>
  /** 게터 — 호출 시점마다 평가한다. 기본 `() => true` */
  canWrite?: () => boolean
  /** 사용자 전체 끊기의 "나 자신" 판정. 기본 `row.userId === useAdminUi().user()?.userId` */
  isSelf?: (row: R) => boolean
  onRevoked?: (event: SessionRevokedEvent<R>) => void | Promise<void>
  /** 내 계정 전체를 끊은 뒤 — 템플릿이 세션을 비우고 로그인으로 보낸다 */
  onSelfSignedOut?: () => void | Promise<void>
  messages?: Partial<SessionMessages<R>>
  /** 기본 true. 다이얼로그 안처럼 열 때 불러야 하면 false + `reload()` */
  immediate?: boolean
}

export type UseSessionsOptions<
  R extends SessionTableRow,
  F extends object = Record<string, never>,
> =
  | (SessionsCommonOptions<R> & { list: () => Promise<readonly R[]> })
  | (SessionsCommonOptions<R> & {
      fetch: ServerTableOptions<R, F>['fetch']
      filters?: ServerTableOptions<R, F>['filters']
      isFiltered?: ServerTableOptions<R, F>['isFiltered']
      urlSync?: ServerTableOptions<R, F>['urlSync']
      itemsPerPage?: number
    })

/** `<SessionTable v-bind="table" show-… />` */
export interface SessionTableBindings<R> {
  sessions: readonly R[]
  itemsLength?: number
  page?: number
  itemsPerPage?: number
  'onUpdate:page'?: (page: number) => void
  'onUpdate:itemsPerPage'?: (size: number) => void
  loading: boolean
  busy: boolean
  canRevoke: boolean
  canRevokeUser: boolean
  onRevoke: (row: R) => void
  onRevokeUser: (row: R) => void
}

export interface Sessions<R> {
  rows: Readonly<Ref<readonly R[]>>
  /** 전량 모드는 `rows.length` */
  total: Readonly<Ref<number>>
  loading: Readonly<Ref<boolean>>
  loadError: Readonly<Ref<unknown>>
  reload: () => Promise<void>
  table: ComputedRef<SessionTableBindings<R>>
  canRevokeOthers: ComputedRef<boolean>
  /** 성공 true · 취소 · 실패 · 막힘 false */
  revokeOthers: () => Promise<boolean>
  submitting: Readonly<Ref<boolean>>
  confirmDialog: ComputedRef<ConfirmDialogBindings>
  /** 서버 페이징 모드에서만 — 필터 · `isFiltered` · `flushUrl` 을 쓸 때 */
  serverTable: ServerTable<R> | null
}

export function useSessions<R extends SessionTableRow, F extends object = Record<string, never>>(
  options: UseSessionsOptions<R, F>,
): Sessions<R>
```

setup 안에서 부른다. `isSelf` 기본값을 쓸 때만(`revokeUser` 를 주고 `isSelf` 를 안 줬을 때) `useAdminUi()` 를 부른다.

#### 4-6-1. 기본 확인 문구

| 동작             | 제목                  | 문구                                                                                                       | 확정 버튼   |
| ---------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- | ----------- |
| `revoke`         | 세션 끝내기           | 그 브라우저는 즉시 로그아웃되고, 다시 쓰려면 다시 로그인해야 합니다.                                       | 끝내기      |
| `revokeOthers`   | 다른 세션 모두 끝내기 | 이 기기를 뺀 모든 세션이 즉시 로그아웃됩니다.                                                              | 모두 끝내기 |
| `revokeUser`     | 사용자 전체 끊기      | 「{userName}({userId})」의 모든 세션이 즉시 로그아웃됩니다. 그 사람은 다시 로그인해야 합니다.              | 모두 끊기   |
| `revokeUserSelf` | 사용자 전체 끊기      | 이 계정은 지금 로그인한 당신 자신입니다. 확인하는 즉시 이 화면에서도 로그아웃되고, 다시 로그인해야 합니다. | 모두 끊기   |

#### 4-6-2. 동작 계약

1. **모드.** `list` 를 주면 전량 모드 — 순번으로 늦게 온 옛 응답을 버리고, 실패하면 `rows` 를 두고 `loadError` 를 채운다(다음 조회 시작에 비움). `fetch` 를 주면 서버 페이징 모드 — `useServerTable({ fetch, sort: false, filters, isFiltered, urlSync, itemsPerPage, immediate })` 를 만들어 그 `items` · `total` · `loading` · `error` · `reload` 를 그대로 쓴다.
2. **바쁨.** `busy = loading || submitting`. 표 바인딩의 `busy` 다.
3. **동작 노출.** `table.canRevoke = revoke 있음 && canWrite()`, `table.canRevokeUser = revokeUser 있음 && canWrite()`. `canRevokeOthers = revokeOthers 있음 && canWrite() && !busy && rows 중 isCurrent 아닌 행이 하나라도 있음`(서버 페이징 모드에서는 "다른 세션 모두" 를 쓰지 않는다 — 내 세션은 전량 모드다).
4. **관문.** 세 동작 모두 `useWriteFlow` 의 `gate: 'confirm'`, `reversible: false`, 문구는 §4-6-1(또는 `messages`).
5. 🔴 **현재 세션 방어.** `onRevoke(row)` 에 `row.isCurrent` 가 오면 요청 없이 무시한다 — 표가 버튼을 안 그리지만 바인딩을 직접 부르는 길도 막는다.
6. **요청 뒤.** 요청이 실제로 나갔으면 성공 · 실패 모두 `reload()` 한다. 관문 취소 · 진행 중 막힘이면 재조회하지 않는다. 성공이면 `onRevoked({ action, row, revokedCount })` 를 부른다 — `revokedCount` 는 응답에 숫자가 있을 때만 싣는다.
7. 🔴 **내 계정 전체.** `revokeUser` 대상이 `isSelf(row)` 면 `revokeUserSelf` 문구로 확인받는다. 성공하면 `onRevoked` 다음에 `onSelfSignedOut` 을 부르고 재조회하지 않는다 — 서버가 지금 세션까지 끊어 재조회는 401 로 실패할 뿐이다.
8. **권한.** `canWrite()` 가 거짓이면 세 동작 모두 요청 없이 `false` 다.

### 4-7. `copyText`

```ts
export type CopyResult = 'done' | 'failed' | 'unavailable'
export function copyText(text: string): Promise<CopyResult>
```

- `navigator.clipboard?.writeText` 가 없으면 `'unavailable'`(보안 컨텍스트가 아닌 사내 http 주소), 거부되면 `'failed'`, 성공하면 `'done'`. 던지지 않는다.
- 🔴 성공 문구는 `'done'` 일 때만 낸다(axion 사고 — API 가 없어도 "복사했습니다").

### 4-8. `TemporaryPasswordDialog`

| prop · 모델 · 슬롯      | 내용                                                                             |
| ----------------------- | -------------------------------------------------------------------------------- |
| `v-model`(`modelValue`) | `string \| null`. 값이 있으면 열림. 닫기는 `null` 을 내보낸다                    |
| `mode`                  | `'create' \| 'reset'`, 기본 `'reset'`                                            |
| `title?`                | 없으면 `create` → `계정을 만들었습니다`, `reset` → `비밀번호를 초기화했습니다`   |
| `target?`               | 누구의 값인지(예: `홍길동(hong)`). 있으면 값 위에 `「{target}」의 임시 비밀번호` |
| `sessionsRevoked`       | 기본 false. 켜면 정보 알림 `이 계정의 접속 세션은 서버가 함께 끊었습니다.`       |
| 기본 슬롯               | 안내 아래에 문단을 더한다                                                        |

1. 🔴 **값은 `<code>` 글자로** 낸다 — 고정폭 큰 글씨, `user-select: all`. 입력칸의 `value` 에 두지 않는다(화면 읽기 도구가 못 읽고 수동 복사가 불편하다, hangang).
2. **안내**: 경고 알림 `이 값은 지금 한 번만 보입니다. 창을 닫으면 다시 볼 수 없고, 잃어버리면 다시 발급해야 합니다.` + 문장 `처음 로그인하면 새 비밀번호를 정하게 됩니다.`
3. **복사 버튼** `복사` → `copyText` → 값 아래 `aria-live="polite"` 문단에 결과 — `done` `임시 비밀번호를 복사했습니다.` · `failed` `복사하지 못했습니다. 위 값을 직접 선택해 복사하세요.` · `unavailable` `이 브라우저에서는 복사 기능을 쓸 수 없습니다. 위 값을 직접 선택해 복사하세요.` 복사 중 버튼 `:disabled`.
4. 🔴 **스스로 닫지 않는다.** `persistent`(바깥 클릭 · ESC 무시), 제목 줄 X 없음, 닫기는 `닫기` 버튼 하나. 부모가 목록을 다시 불러와도 열린 채다(hangang).
5. 값이 바뀌거나 닫히면 복사 결과 문구를 지운다. 컴포넌트는 값을 따로 보관하지 않는다(prop 만 읽는다).
6. 최대 폭 480.

### 4-9. `PasswordChangeForm`

| prop          | 내용                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------ |
| `policy`      | `PasswordPolicy`(필수) — 길이 · 문구                                                       |
| `submit`      | `(body: { currentPassword: string; newPassword: string }) => Promise<boolean>`(필수)       |
| `errors`      | `Readonly<Record<string, readonly string[]>>`, 기본 `{}` — `useWriteFlow` 의 `fieldErrors` |
| `userId?`     | 있으면 숨은 `autocomplete="username"` 칸(비밀번호 관리자가 계정을 알아본다, gise)          |
| `submitLabel` | 기본 `비밀번호 변경`                                                                       |

1. **칸**: 킷 `PasswordField` 셋 — `현재 비밀번호`(`name="currentPassword"`, `autocomplete="current-password"`) · `새 비밀번호`(`newPassword`, `new-password`, 도움말 `policy.lengthMessage` 를 늘 표시) · `새 비밀번호 확인`(`confirmPassword`, `new-password`). 전체가 `<form>` — Enter 로 제출.
2. **화면 안 검증**(그 칸에 무언가 입력한 뒤에만 보인다): 새 비밀번호 길이가 정책 밖 → `policy.lengthMessage` · 확인 불일치 → `새 비밀번호가 서로 다릅니다.` · 새 = 현재 → `policy.sameAsCurrentMessage`.
3. **제출 조건** `canSubmit` = 처리 중 아님 && 현재 칸 비어 있지 않음 && 새 비밀번호 길이 정책 안 && 확인 일치 && 새 ≠ 현재. 버튼은 `:disabled="!canSubmit"` + `:loading`.
4. 🔴 **제출 함수 첫 줄이 같은 검사다** — Enter 두 번 · 빠른 이중 클릭에도 `submit` 은 한 번만 불린다.
5. 🔴 **처리 중에는 세 칸을 `readonly`** 로 둔다(`disabled` 아님 — 값과 포커스를 유지한다, gise).
6. `submit` 이 `true` 면 세 칸을 비우고, `false` 면 둔다. 비밀번호 값은 이 컴포넌트 상태에만 있다. `submit` 이 던지면 처리 중 표시만 풀고 다시 던진다.
7. **서버 오류**: `errors.currentPassword` · `errors.newPassword` 를 해당 칸 `error-messages` 로. `errors` 가 새 객체로 바뀌어 두 키 중 하나라도 있으면 첫 오류 칸(현재 → 새)으로 포커스를 옮긴다. 사용자가 그 칸 값을 고치면 그 칸의 서버 오류를 숨긴다(다음 `errors` 가 오면 다시 보인다). 그 밖의 키는 그리지 않는다 — 페이지가 `fields: ['currentPassword', 'newPassword']` 로 보내므로 전역 토스트가 알린다(3b 규칙).

## 5. 의존성

새 의존 없음. `zod`(admin-shared peer) · `vue-router` · `vuetify`(admin-ui peer, 기존).

## 6. 파일

| 파일 (`packages/…`)                                            | 내용                                     |
| -------------------------------------------------------------- | ---------------------------------------- |
| `admin-shared/src/sessions.ts`                                 | §4-1                                     |
| `admin-shared/src/user-agent.ts`                               | §4-2                                     |
| `admin-shared/src/passwords.ts`                                | §4-3                                     |
| `admin-shared/src/index.ts`                                    | export                                   |
| `admin-ui/src/context/admin-ui.ts`                             | §4-4                                     |
| `admin-ui/src/components/session/session-table.ts`             | `SessionTableRow` · 날짜 표기 함수(내부) |
| `admin-ui/src/components/session/SessionTable.vue`             | §4-5                                     |
| `admin-ui/src/composables/useSessions.ts`                      | §4-6                                     |
| `admin-ui/src/utils/copy-text.ts`                              | §4-7                                     |
| `admin-ui/src/components/password/TemporaryPasswordDialog.vue` | §4-8                                     |
| `admin-ui/src/components/password/PasswordChangeForm.vue`      | §4-9                                     |
| `admin-ui/src/index.ts` · `admin-ui/README.md`                 | export · "세션 · 비밀번호" 절 · API 표   |

각 파일 옆에 테스트. 정본에서 가져온 파일은 머리 주석에 출처와 바꾼 점.

## 7. 테스트 계약

TDD — 실패하는 테스트부터. DOM 이 필요한 파일은 `// @vitest-environment happy-dom`, 오버레이를 여는 테스트는 `installVisualViewport()`.

- **세션 스키마**: 필수 필드 · `isCurrent` 필수 · ISO `Z` 시각만 · `null` 허용 필드 · 목록 행 확장 · 끊기 결과 음수 거부.
- **`describeUserAgent`**: 표 기반 — Edge 가 Chrome 보다 먼저, Whale · Samsung, iOS Chrome(`CriOS`) · iOS Firefox(`FxiOS`) · iOS Safari(macOS 로 오판하지 않음), ChromeOS, Android, Windows, macOS, Linux, 브라우저만 · OS 만, 모름, `null` · 공백.
- **비밀번호 정책**: 기본 8/200 과 문구, 사용자 값, 잘못된 옵션에 던짐, `passwordSchema` 경계, `changePasswordSchema` 새 = 현재 → 경로 `newPassword` · 문구, `currentPassword` 빈 값 거부, 임시 비밀번호 스키마.
- **`copyText`**: `navigator.clipboard` 없음 → `unavailable` · 거부 → `failed` · 성공 → `done` + 값 그대로.
- **`SessionTable`**(렌더): 열 켜고 끄기 · 기기 칸 요약 · 칩 · 원문 · 현재 행에 끝내기 없음과 안내 · 현재 행에도 사용자 전체 끊기 · 접근 이름이 같은 요약 행을 구분 · `busy` 잠금 · 두 이벤트 · 빈 문구와 `#no-data` · 전량 모드에 쪽 이동 없음 · 서버 페이징 모드에 쪽 이동과 쪽 모델 · `formatDate` 와 기본 형식 · 틀린 날짜는 원문.
- **`useSessions`**(실제 `SessionTable` · `ConfirmDialog` 를 붙인 렌더): §4-6-2 의 1~8 각각 — 특히 취소면 요청 · 재조회 없음, 실패도 재조회, 개수 있을 때만 `revokedCount`, 다른 세션이 없으면 "모두" 꺼짐, 내 계정 전체 → 1인칭 문구 · `onSelfSignedOut` · 재조회 없음, 현재 행 바인딩 직접 호출 무시, `canWrite` 거짓 → 버튼 없음, 서버 페이징 모드의 `fetch` 인자 · `itemsLength` · 쪽 이동, `immediate: false`, 늦은 목록 응답 무시.
- **`TemporaryPasswordDialog`**: 값이 있을 때만 열림 · 값이 `code` 글자(입력칸 아님) · 복사 3갈래 문구 · 복사 중 버튼 잠금 · 닫기 → `update:modelValue(null)` · 바깥 클릭 · ESC 로 안 닫힘 · 값이 바뀌면 문구 초기화 · 제목 2종과 `title` · `target` · `sessionsRevoked` · 기본 슬롯.
- **`PasswordChangeForm`**: 칸 이름 · `autocomplete` · 숨은 아이디 칸 · 정책 문구 도움말 · 검증 문구는 입력 뒤에만 · 조건 전 버튼 잠금 · Enter 두 번에도 `submit` 1번 · 처리 중 `readonly` · `true` 면 비움, `false` 면 유지 · 서버 오류 표시 · 첫 오류 칸 포커스(현재 우선) · 고치면 그 칸 서버 오류 숨김 · `submit` 이 던지면 처리 중 해제 후 다시 던짐.
- **`AdminUserInfo`**: 타입 테스트(선택 필드).
- **마무리**: `pnpm check` 초록 · `/smoke`(새 export 포함) · `no-cycles` 유지.

## 8. 릴리스 · 문서

- changeset **minor**(admin-shared · admin-ui, `fixed` 묶음). 내용: 새 API(§4), `AdminUserInfo.isPasswordChangeRequired?`, 서버 계약(§9). 발행된 동작은 §11 R3(`PasswordField` 의 `autocomplete`)만 바뀐다 — Version Packages PR #2 는 3c 와 무관하게 머지해도 된다(먼저 머지되면 3c 는 0.4.0).
- README: "세션 · 비밀번호" 절(배선 예시 — 내 세션 · 관리자 전체 · 계정별 다이얼로그, 임시 비밀번호 발급 흐름, 비밀번호 변경 페이지 · 강제 변경 가드 연결), API 표에 새 export.
- `docs/01-phase0.md` §8 · `CLAUDE.md` · `docs/HANDOFF.md` 진행표에 3c 완료를 적는다.

## 9. Phase 2 서버 계약 (이 PR 에서 구현하지 않음)

- **세션 라우트 6개**(hangang 5개 + "다른 세션 모두"): 전체 목록(서버 페이징, 마지막 활동 내림차순, 검색어 = 아이디 · 이름 부분일치) · 내 세션(전량 `{ items }`) · 하나 끝내기 · 사용자 전체(`{ revokedCount }`) · 내 세션 하나 끝내기(남의 세션이면 404) · 다른 세션 모두(`{ revokedCount }`). 폐기 사유 `terminated`.
- 응답 행은 §4-1 스키마. `isCurrent` 는 요청마다 계산한다.
- 🔴 지금 쓰는 세션은 목록 라우트로 끊지 못한다(내 세션 하나 끝내기 · 관리자 하나 끝내기 모두 거부). 로그아웃이 정상 경로다.
- **비밀번호 초기화**: 서버가 만든다(16자, 혼동 문자 `I O l o 0 1` 제외, 편향 없는 난수 — gise · hangang). 응답 `{ temporaryPassword }`. `isPasswordChangeRequired = true`, 대상 세션을 같은 트랜잭션에서 끊는다. 관문(재인증 · 확인)과 권한 단조성 검사는 프로젝트 정책.
- **비밀번호 변경**: 본문을 `changePasswordSchema` 로 검증. 틀린 현재 비밀번호는 `ERR_COMMON_VALIDATION` + `details.issues[{ path: ['currentPassword'], message }]`(W1). 성공 시 `isPasswordChangeRequired = false`, 다른 세션 폐기(gise).
- **강제 변경**: `/me` 가 `isPasswordChangeRequired` 를 낸다. 변경 필요 계정은 권한을 빈 배열로 보고 본인 경로를 403 으로 막되, 비밀번호 변경 라우트만 연다(gise).

## 10. 비범위 · 보류

- crm 고유의 세션 출처(web · API 키) 열과 필터 → B.
- 관리자 목록의 필터 칸 · 카드 · 제목, 계정별 세션 다이얼로그 조립, 사용자 목록에서 자기 · 상위 계정 행 막기 → B.
- 강제 변경 화면 조립(auth 레이아웃, 안내, 돌아가기 숨김, 로그아웃) · 내 정보 표시 · 표시 이름 수정(gise) → B.
- 자기 계정 비밀번호 초기화 차단(hangang) → B(README 에 적음).
- axion 의 소셜 · 이메일 비밀번호 설정 흐름 → X.
- 비밀번호 복잡도 규칙 — 네 곳 모두 없음.
- 세션 목록 50개 상한 안내(gise) — 전량 계약이라 필요 없음.

## 11. 구현 중 정정 (2026-10-06)

- **R1 — eslint `vue/valid-v-slot` 에 `allowModifiers: true` 를 켰다(`eslint.config.js`).** Vuetify 표의 셀 슬롯 이름에는 점이 들어간다(`#item.device`). 이 설정 없이는 `SessionTable` 이 lint 를 통과하지 못하고, 앞으로 표마다 비활성화 주석이 반복된다(Task 4).
- **R2 — `TemporaryPasswordDialog` 의 복사는 순번으로 묶는다(§4-8 #5 보강).** 복사가 끝나기 전에 값이 바뀌면(다른 값 · 닫기) 늦게 끝난 결과를 버리고 복사 버튼 잠금도 바로 푼다. 그렇지 않으면 클립보드에는 이전 값이 있는데 새 값 아래에 "복사했습니다" 가 붙는다(Task 6 리뷰).
- **R3 — `PasswordField` 의 `autocomplete="off"` 를 `$attrs` 앞으로 옮겼다(PR #1 부터의 결함).** 뒤에 있어서 호출하는 쪽의 값이 늘 덮였다 — `ReauthDialog` 의 `current-password` 도 `off` 가 되어 비밀번호 관리자가 칸을 알아보지 못했다. `vue/attributes-order` 의 자동 수정이 결함을 되살리므로 그 요소만 규칙을 끈다(Task 7).
- **R4 — 계정별 다이얼로그는 대상마다 인스턴스를 새로 만든다(`:key`). (2026-10-06)** 전량 모드 rows 보존(§4-6-2 #1)은 같은 목록의 재조회를 위한 것이라, 대상이 바뀌는 재사용은 앞 사람의 세션을 남기고 실패 시 그 행에 쓰기를 허용한다. `immediate` 주석 · README 를 고쳤다.
- **R5 — `사용자 전체 끊기` 의 접근 이름을 `"{이름}({아이디}) 사용자 전체 끊기"` 로. (2026-10-06)** 보이는 글자를 이름에 담는다(WCAG 2.5.3, 음성 조작).
- **R6 — `useSessions` 견고성. (2026-10-06)** 내 계정 전체 끊기 성공 뒤 `onSelfSignedOut` 은 `onRevoked` 가 던져도 부른다(finally), 받는 쪽이 없으면 재조회한다. `revokeOthers()` 는 `canWrite()` 를 호출 시점에 다시 읽는다. `revokedCount` 는 숫자일 때만 키째 싣는다. 세션 스키마는 `z.iso.datetime()`.
