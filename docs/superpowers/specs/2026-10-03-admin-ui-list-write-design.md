# admin-ui 목록 · 쓰기 기반 설계 (Phase 1 PR #3a)

작성일: 2026-10-03 · 상태: 확정(구현 전) · 선행: `docs/01-phase0.md` §2-2, `docs/phase0-reports/fe-pages.md` §2, PR #2 스펙(`2026-10-01-admin-ui-shell-design.md`) R12

## 1. 목표

PR #3 의 나머지 묶음(3b 역할·설정, 3c 계정·세션, 3d 조직, 3e 약관)이 모두 서는 바닥을 먼저 넣는다. 서버 페이징 목록(`useServerTable`), 목록 상태 ↔ URL 쿼리(`useQuerySyncedFilter` + 코덱 층), 쓰기 관문·오류 분류(`useWriteFlow`), 검증 오류 → 필드(`toFieldErrors`). 이 PR 이 끝나면 목록 페이지는 "fetch 어댑터 + 필터 + 헤더", 쓰기는 "`run({ gate, action })` 한 줄" 로 얇아진다.

새 peer 의존은 없다. 3d(he-tree) · 3e(CodeMirror) 에서 생긴다.

## 2. 결정

### 2-1. PR #3 경계 결정 (2026-10-03, 결정 문서 https://claude.ai/artifact/DXSqKqAoqUuYAQRyurtm9u)

| 결정                     | 확정                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| ① `useQuerySyncedFilter` | **A** — 콜백형 핵심(`read`·`toQuery`) + **선택형 코덱 층**(기본 6종 + `QueryCodec` 커스텀 인터페이스). crm 코덱 13종 전체는 넣지 않는다 |
| ② `useFieldErrors`       | **A 는 `toFieldErrors` 순수 함수만.** gise 의 표시 추적(provide/inject · `unmatchedIssues`)은 **B**. `path` 는 배열 유지(킷 선언대로)   |
| ③ he-tree                | **필수 peer** — 드래그 `TeamTree` 를 패키지에 넣는다(3d)                                                                                |
| ④ CodeMirror             | **필수 peer** — `LegalDocumentEditor` 를 패키지에 넣는다(3e). 엔트리는 하나로 유지                                                      |
| 범위                     | PR #3 을 3a~3e 로 나눈다. 이 문서는 3a                                                                                                  |

### 2-2. 3a 설계 결정

| #   | 결정                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `useServerTable` 이 URL 동기화를 **옵션(`urlSync`)으로 품는다.** 안에서 `useQuerySyncedFilter` 를 불러 "복원이 감시보다 먼저" 순서를 패키지가 보장한다. `useQuerySyncedFilter` 는 단독 export 도 한다 |
| D2  | revision 충돌 전용 코드 **`ERR_COMMON_REVISION_CONFLICT`(409)** 를 admin-shared 공통 코드에 추가한다. `ERR_COMMON_CONFLICT` 는 중복·상태 충돌 전용으로 좁힌다                                         |
| D3  | 이중 알림은 **처리 표시 + 지연 보고**로 막는다. `ApiError.handled` 를 두고, `createApiClient` 가 `onError` 를 한 매크로태스크 뒤에 부르며 `handled` 면 건너뛴다                                       |
| D4  | `useWriteFlow` 가 **확인 · 재인증 관문을 둘 다** 맡는다. `run()` 마다 `gate: 'none' \| 'confirm' \| 'reauth'`                                                                                         |
| D5  | 코덱 `bool` 은 `'1'`/`'0'` 만 인정한다(crm). 같은 상태가 두 URL 로 갈리지 않게                                                                                                                        |
| D6  | 반환 형태는 킷 관례(`useTableSelection`)대로 **ref 묶음**이다. 쓰는 쪽이 구조 분해한다 — 템플릿은 최상위 바인딩만 자동 언래핑한다                                                                     |

## 3. 정본과 흡수 목록

| 산출물                 | 정본                                                                          | 흡수할 것                                                                                                                                                                                                                                                 | 버릴 것                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `useQuerySyncedFilter` | gise `apps/admin/src/composables/useRouteQuerySync.ts`(74줄)                  | crm `frontend-core/composables/useQuerySyncedFilter.ts` 의 🔴 규칙 — 초기 복원 선행, 멱등 쓰기, `ownPath` 가드와 그 알려진 한계, `lastWritten` 슬롯 1개 전제, `flushUrl`, 언마운트 시 쓰기 안 함, `onInbound` 는 초기 복원에서 안 부름, replace 실패 삼킴 | gise `isRestoring`(표가 내부에서 처리), crm 필터·정렬·extra 3분할 스펙, crm 필수 `sort` 옵션                                                                 |
| 코덱 층                | crm `frontend-core/utils/queryCodec.ts`(427줄)                                | `decode` 는 던지지 않고 틀린 형식은 없는 것으로, `withDefault` 의 기본값 생략, `bool` 은 `'1'`/`'0'`                                                                                                                                                      | `intRange` · `bigintArray` · `enumArray` · `stringArray`(→ `array(inner)`), `calendarDate` · `dateString`(시간대 정책은 프로젝트 몫), `sortCodec`(표가 처리) |
| `useServerTable`       | hangang `apps/admin/src/pages/org/users.vue`                                  | 요청 조건 `computed` 하나 · 감시 하나, seq 가드, 필터 변경 시 1쪽, 정렬 키 폐집합 보정과 `sortBy` 되돌림, bigint `total` → number, `isFiltered`(EmptyState `filtered`)                                                                                    | 페이지 로컬 상태 흩어짐, 오류 문구 해석(→ 전역 `onError`)                                                                                                    |
| `useWriteFlow`         | hangang `users.vue` `onReauthConfirm` · `users-messages.ts` `isReauthFailure` | gise revision 충돌 처리(→ `onConflict`), gise `toFieldErrors` 연결, 공통 "실패 시 다이얼로그 유지 · 성공 시 닫기 · 재조회"                                                                                                                                | 페이지별 `switch(action)`, AxiosError 직접 읽기(→ `ApiError.code`)                                                                                           |
| `toFieldErrors`        | gise `apps/admin/src/composables/useFieldErrors.ts` 의 `toFieldErrors`        | 형태가 틀리면 `{}`(던지지 않음)                                                                                                                                                                                                                           | 점 연결 문자열 `path`(킷은 배열), `payload.` 접두 제거, provide/inject 표시 추적                                                                             |

## 4. 공개 API

모든 composable 은 setup 안에서 부른다(`useRoute`·`useRouter`·`onUnmounted` 를 쓴다).

### 4-1. `useQuerySyncedFilter`

```ts
export interface QuerySyncOptions {
  /** URL → 화면 상태. 쿼리에 없거나 형식이 틀린 키는 기본값으로 되돌린다(전체 대입). */
  read: (query: LocationQuery) => void
  /** 화면 상태 → URL. 기본값과 같은 값은 `undefined` 로 빼서 돌려준다. */
  toQuery: () => LocationQueryRaw
  /** 뒤로·앞으로 가기 등 외부 요인으로 복원된 직후 1회. 초기 복원에서는 부르지 않는다. */
  onInbound?: () => void
  /** 상태 변경 → URL 쓰기 지연(ms). 기본 0. */
  debounceMs?: number
}

export function useQuerySyncedFilter(options: QuerySyncOptions): {
  /** 대기 중인 쓰기를 즉시 확정하고 완료까지 기다린다. 행 클릭 → 상세 push 동선용. */
  flushUrl: () => Promise<void>
}
```

동작 계약:

1. **초기 복원 선행.** setup 동기 시점에 `read(route.query)` 를 하고, 그 뒤에 감시를 등록한다. 순서가 바뀌면 화면 결과는 같은데 첫 요청만 2배가 된다.
2. **멱등 쓰기.** `toQuery()` 의 안정 문자열이 바뀌면 `router.replace({ query })` 로 쓴다. 현재 주소의 안정 문자열과 같으면 쓰지 않는다 — 쓰기 ↔ 감시 루프 차단.
3. **안정 문자열**(`stableQueryKey`, 내부): `undefined`·`null` 값 제외, 배열은 원소마다 문자열화, 키 정렬, 키·값 `encodeURIComponent`, `k=v1,v2&…`. `JSON.stringify` 를 쓰지 않는다(gise G6 게이트와 같은 이유 — 키 순서·타입 표기에 따라 같은 쿼리가 다른 문자열이 된다).
4. **경로 가드.** 마운트 시점 `route.path` 와 다르면 인바운드 감시를 무시한다. 다른 화면으로 이동하면 vue-router 가 `currentRoute` 를 먼저 갱신하므로 떠나는 화면의 감시가 목적지 쿼리로 먼저 깨어난다. ⚠️ 알려진 한계(crm 그대로 옮김): 동적 세그먼트만 바뀌는 상세 라우트는 인스턴스가 재사용돼 이 가드가 영구 참이 된다 — 그런 라우트에서는 쓰지 않는다.
5. **자기 쓰기 무시.** 마지막으로 쓴 안정 문자열 하나(`lastWritten`)와 같으면 인바운드로 보지 않는다. ⚠️ 슬롯이 하나라는 것은 동시에 떠 있는 자기 쓰기가 최대 1건이라는 전제다. 전역 라우터 가드가 진짜 비동기 대기를 하게 되면 다시 본다.
6. **언마운트 시 쓰지 않는다.** 그 시점의 replace 는 목적지 경로에 쓴다. 타이머만 정리한다.
7. **`flushUrl`** 이 진행 중이면 감시발 쓰기를 건너뛴다 — vue-router 의 `pendingLocation` 슬롯을 다투면 앞 쓰기가 취소된다.
8. **replace 실패 삼킴.** 취소·중복·리다이렉트는 실패 *값*으로 resolve 되고 가드 예외만 reject 다. 쓰기는 `then(() => {}, () => {})`.
9. `toQuery()` 가 담지 않은 쿼리 키는 URL 에서 빠진다(gise 와 같다).

### 4-2. 코덱 층

```ts
export type RawQueryValue = LocationQueryValue | LocationQueryValue[] | undefined

export interface QueryCodec<T> {
  /** 형식이 틀리면 `undefined`. 던지지 않는다. */
  decode(raw: RawQueryValue): T | undefined
  /** `undefined` 면 URL 에서 뺀다. */
  encode(value: T): string | string[] | undefined
}

export const queryCodec: {
  string(): QueryCodec<string> // 빈 문자열 → undefined
  int(options?: { min?: number; max?: number }): QueryCodec<number> // /^-?\d+$/, 안전 정수, 범위 밖 → undefined
  bool(): QueryCodec<boolean> // '1' | '0' 만
  enumOf<const T extends string>(values: readonly T[]): QueryCodec<T>
  bigint(): QueryCodec<bigint> // /^(0|[1-9]\d*)$/ — 앞자리 0 거부(표기 하나)
  array<T>(inner: QueryCodec<T>): QueryCodec<T[]> // 반복 키. 틀린 원소는 버림. 빈 배열 → URL 에서 뺌
}

/** 없거나 틀리면 기본값으로 읽고, 기본값과 같으면 URL 에서 뺀다. 배열·bigint 는 값 비교. */
export function withDefault<T>(codec: QueryCodec<T>, defaultValue: T): QueryCodec<T>

/** 코덱 묶음 → `useQuerySyncedFilter`·`urlSync` 가 받는 `{ read, toQuery }`. */
export function bindQueryCodecs<S extends object>(
  state: Ref<S>,
  spec: QueryCodecSpec<S>,
): { read: (query: LocationQuery) => void; toQuery: () => LocationQueryRaw }
```

- `read` 는 spec 의 키만 새로 대입한다(`state.value = { ...state.value, ...decoded }`). spec 밖 상태 키는 그대로 둔다.
- `withDefault` 가 없는 코덱의 키는 상태 타입에서 `undefined` 를 허용해야 한다 — URL 에 없으면 `undefined` 가 들어가기 때문이다. `QueryCodecSpec<S>` 가 타입으로 막는다(crm `FilterSpecFor` 와 같은 이유: 컴파일은 통과하고 런타임에 터지는 유형).
- 커스텀 코덱은 `QueryCodec<T>` 를 구현한 사용자 객체다. 옵션을 늘리지 않는다.

### 4-3. `useServerTable`

```ts
export interface ServerTableParams<TFilter> {
  page: number
  itemsPerPage: number
  sortBy: string[]
  sortOrder: ('asc' | 'desc')[]
  filter: TFilter
}

export interface ServerTableOptions<TRow, TFilter extends object> {
  /** `params` 는 admin-shared `createQuerySchema` 가 읽는 모양 그대로 — GET 파라미터로 그대로 보낸다. */
  fetch: (params: ServerTableParams<TFilter>) => Promise<{ items: TRow[]; total: number | bigint }>
  /** 필수 — 생략을 허용하면 정렬이 조용히 빠진다. 정렬 없는 표는 `false`. */
  sort: { keys: readonly string[]; default: AdminTableSort } | false
  /** "적용된" 필터 값. 바뀌면 1쪽으로 돌아가고 다시 조회한다. 기본 `() => ({})`. */
  filters?: () => TFilter
  /** 기본: `filters()` 에 `undefined`·`null`·`''`·빈 배열이 아닌 값이 하나라도 있으면 true. */
  isFiltered?: () => boolean
  /** 기본 20(`DEFAULT_ITEMS_PER_PAGE`). 1..100 으로 자른다. */
  itemsPerPage?: number
  /** 켜면 page·itemsPerPage·sort 는 표가, 필터는 이것이 URL 과 맞춘다. */
  urlSync?: { read: (query: LocationQuery) => void; toQuery: () => LocationQueryRaw }
  /** 기본 true — onMounted 에서 첫 조회. */
  immediate?: boolean
}

export function useServerTable<TRow, TFilter extends object = Record<string, never>>(
  options: ServerTableOptions<TRow, TFilter>,
): {
  page: Ref<number>
  itemsPerPage: Ref<number>
  sortBy: Ref<AdminTableSort[]>
  items: Ref<TRow[]>
  total: Ref<number>
  loading: Ref<boolean>
  error: Ref<ApiError | null>
  isFiltered: ComputedRef<boolean>
  reload: () => Promise<void>
  /** `urlSync` 가 없으면 즉시 resolve. */
  flushUrl: () => Promise<void>
}
```

사용(템플릿은 최상위 바인딩만 언래핑하므로 구조 분해한다 — D6):

```ts
const { page, itemsPerPage, sortBy, items, total, loading, isFiltered, reload } = useServerTable({
  fetch: (params) => api.get<Paginated<UserRow>>('/users', { params }),
  sort: { keys: ['userId', 'joinAt'], default: { key: 'joinAt', order: 'desc' } },
  filters: () => ({ userId: applied.value.userId || undefined, teamNo: applied.value.teamNo }),
  urlSync: bindQueryCodecs(applied, {
    userId: withDefault(queryCodec.string(), ''),
    teamNo: queryCodec.bigint(),
  }),
})
```

동작 계약:

1. **요청 조건 하나, 감시 하나.** `params` 를 `computed` 하나로 만들고 그것만 감시한다. 페이지·정렬·필터가 한 틱에 같이 바뀌어도 조회는 1번(hangang 🔴).
2. **seq 가드.** 조회마다 번호를 올리고, 응답·오류·`loading` 해제를 자기 번호가 최신일 때만 반영한다. AbortController 는 쓰지 않는다(네 프로젝트 모두 미사용).
3. **필터·쪽 크기 변경 → 1쪽.** 필터 안정 문자열이나 `itemsPerPage` 가 바뀌면 `page = 1` 을 같은 틱에 처리해 조회 1번(쪽 크기를 키우면 지금 쪽 번호가 범위를 넘을 수 있다). **URL 인바운드 복원 중에는 하지 않는다** — 복원한 쪽 번호가 같은 틱에 1로 덮인다(crm `onInbound` 의 이유를 표가 내부에서 처리).
4. **정렬 보정.** `sortBy[0].key` 가 `keys` 밖이거나 `sortBy` 가 비면(Vuetify 는 같은 헤더 세 번째 클릭에 `[]` 로 만든다) 기본 정렬로 대체하고, `sortBy` ref 자체도 되돌려 라벨·화살표·요청이 한 값을 보게 한다(hangang). `sort: false` 면 `sortBy`·`sortOrder` 는 빈 배열로 보낸다.
5. **`total` 은 number.** bigint 면 `Number()` — `DataTableBody.itemsLength` 는 number 라 그대로 넘기면 타입은 통과하는데 표가 조용히 틀린다(hangang 🔴).
6. **오류.** `items = []`, `total = 0`, `error = toApiError(e)`. 처리 표시는 하지 않는다 — 알림은 전역 `onError` 몫이다. 다음 조회 시작 때 `error = null`.
7. **`urlSync`.** 표가 `page`(1이면 생략) · `size`(기본값이면 생략) · `sort`(`key:order`, 기본 정렬이면 생략)를 URL 에 싣고 읽는다. 필터 키는 `urlSync.read`·`toQuery` 몫. 필터 `toQuery()` 결과에 `page`·`size`·`sort` 키가 나오면(기본값 생략 때문에 setup 시점엔 안 보일 수 있으니 **쓸 때마다** 검사) 개발 빌드에서 throw, 배포 빌드는 `console.error` 후 표 값으로 덮어 진행(crm 과 같은 이유 — 배포에서 던지면 화면이 백지).
8. **itemsPerPage** 는 1..100 으로 자르고 정수가 아니면 기본값.

### 4-4. `useWriteFlow`

```ts
type WriteRunOptions<T> =
  | ({ gate?: 'none'; action: () => Promise<T> } & WriteCommon<T>)
  | ({ gate: 'confirm'; reversible: boolean; action: () => Promise<T> } & WriteCommon<T> &
      DialogText)
  | ({ gate: 'reauth'; action: (ctx: { currentPassword: string }) => Promise<T> } & WriteCommon<T> &
      DialogText)

interface DialogText {
  title?: string
  message?: string
  confirmLabel?: string
  confirmColor?: string // confirm 관문만
}

interface WriteCommon<T> {
  onSuccess?: (result: T) => void | Promise<void>
  /** `ERR_COMMON_REVISION_CONFLICT`. 있으면 처리 표시(전역 토스트 막음), 없으면 전역 토스트. */
  onConflict?: (error: ApiError) => void | Promise<void>
}

export function useWriteFlow(): {
  /** 성공 true · 취소·실패 false. 진행 중이면 무시하고 false. */
  run: <T>(options: WriteRunOptions<T>) => Promise<boolean>
  submitting: Readonly<Ref<boolean>>
  fieldErrors: Readonly<Ref<Record<string, string[]>>>
  clearFieldErrors: () => void
  /** `<ConfirmDialog v-bind="confirmDialog" />` */
  confirmDialog: ComputedRef<ConfirmDialogBindings>
  /** `<ReauthDialog v-bind="reauthDialog" />` */
  reauthDialog: ComputedRef<ReauthDialogBindings>
}
```

`ConfirmDialogBindings`·`ReauthDialogBindings` 는 각 다이얼로그의 props + `onUpdate:modelValue` + `onConfirm` 이다(필드 이름은 PR #1 의 컴포넌트 그대로).

동작 계약:

1. **한 번에 하나.** `submitting` 이거나 관문 다이얼로그가 열려 있으면 `run()` 은 즉시 `false`. 권한 검사는 페이지가 `run()` 전에 한다(hangang: 권한 → 재인증 순).
2. **관문.** `none` 은 바로 실행. `confirm` 은 `ConfirmDialog` 를 열고 확정 시 실행. `reauth` 는 `ReauthDialog` 를 열고 `confirm(password)` 시 `action({ currentPassword })`. 비밀번호는 flow 상태에 남기지 않는다 — 다이얼로그 안에만 있다가 한 번 전달된다.
3. **실행 시작 시** `fieldErrors` 를 비우고 `submitting = true`, 끝나면 false.
4. **결과 분류**(`ApiError.code`):

| 결과                                                                     | 동작                                                                                               | `handled`                       |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------- |
| 성공                                                                     | 관문 다이얼로그 닫음 → `onSuccess(result)` → `true`                                                | —                               |
| `ERR_REAUTH_REQUIRED`(reauth 관문)                                       | 재인증 다이얼로그 **유지**, `reauthDialog.error` 에 `error.message`. 사용자가 다시 시도하거나 취소 | true                            |
| `ERR_COMMON_VALIDATION`                                                  | `fieldErrors = toFieldErrors(e)`, 관문 닫음 → `false`                                              | 변환 결과가 비어 있지 않을 때만 |
| `ERR_COMMON_REVISION_CONFLICT`                                           | 관문 닫음 → `onConflict(e)` → `false`                                                              | `onConflict` 가 있을 때만       |
| 그 밖의 `ApiError`(reauth 관문이 아닌 쓰기의 `ERR_REAUTH_REQUIRED` 포함) | 관문 닫음 → `false`                                                                                | false(전역 토스트)              |
| `ApiError` 가 아닌 예외                                                  | 관문 닫음 → 그대로 다시 던진다(프로그래밍 오류를 삼키지 않는다)                                    | —                               |

5. **처리 표시는 `catch` 안에서 동기로** 한다(D3 의 전제 — §4-6).
6. **취소**(다이얼로그 닫기)는 `false`. 성공 알림은 flow 가 띄우지 않는다 — `onSuccess` 에서 페이지가 띄운다.

### 4-5. `toFieldErrors`

```ts
export function toFieldErrors(error: unknown): Record<string, string[]>
```

`ApiError` 이고 `code === ERR_COMMON_VALIDATION` 이며 `details` 가 admin-shared `validationDetailsSchema` 를 통과할 때만 변환한다. `path` 배열을 `.` 으로 잇는다(`['members', 0, 'name']` → `'members.0.name'`, 루트 `[]` → `''`). 같은 키의 메시지는 순서대로 모은다. 그 밖에는 `{}` — 던지지 않는다.

### 4-6. 오류 계약 변경

- **admin-shared `error-codes.ts`**: `ERR_COMMON_REVISION_CONFLICT`(409, "낙관적 잠금(revision) 불일치 — 다시 불러와야 한다") 추가. `ERR_COMMON_CONFLICT` 설명을 "중복 값 · 상태 전이 충돌" 로 좁힌다.
- **admin-ui `ApiError`**: `handled: boolean`(기본 false) 공개 필드.
- **admin-ui `createApiClient`**: `onError` 를 `setTimeout(…, 0)` 으로 미루고, 그때 `handled` 면 부르지 않는다. 🔴 근거 주석: 호출처의 `await` 연쇄와 `catch` 는 모두 마이크로태스크라 한 매크로태스크 안에 끝난다 — 그래서 `catch` 에서 **동기로** 표시하면 늦지 않는다. 타이머를 기다린 뒤 표시하면 늦는다. 훅 예외는 지금처럼 잡아서 `console.error`.

## 5. 의존성

새 의존 없음. `zod`(admin-shared 스키마 검증, 이미 peer 경유)·`vue-router`(이미 필수 peer).

## 6. 파일

| 파일 (`packages/…`)                                | 내용                           |
| -------------------------------------------------- | ------------------------------ |
| `admin-ui/src/composables/useQuerySyncedFilter.ts` | §4-1 + `stableQueryKey`(내부)  |
| `admin-ui/src/composables/query-codec.ts`          | §4-2                           |
| `admin-ui/src/composables/useServerTable.ts`       | §4-3                           |
| `admin-ui/src/composables/useWriteFlow.ts`         | §4-4                           |
| `admin-ui/src/api/field-errors.ts`                 | §4-5                           |
| `admin-ui/src/api/error.ts` · `api/client.ts`      | §4-6 (`handled`, 지연 보고)    |
| `admin-shared/src/error-codes.ts`                  | §4-6 (새 코드)                 |
| `admin-ui/src/index.ts` · `admin-ui/README.md`     | export · 사용 예 · 공개 API 표 |

각 파일 옆에 `*.test.ts`. 정본에서 가져온 파일은 머리 주석에 출처와 바꾼 점.

## 7. 테스트 계약

TDD — 실패하는 테스트부터. 라우터는 `createMemoryHistory`, 지연·매크로태스크는 가짜 타이머. DOM 이 필요한 파일은 `// @vitest-environment happy-dom`, 오버레이를 여는 테스트는 `installVisualViewport()`.

- **`useQuerySyncedFilter`**: 초기 복원이 감시보다 먼저라 첫 요청이 1번 · 같은 주소면 쓰지 않음 · 자기 쓰기를 인바운드로 보지 않음 · 다른 경로로 떠날 때 상태가 엎이지 않음 · 뒤로가기 복원 뒤에만 `onInbound`(초기 복원에선 안 부름) · 언마운트 시 쓰지 않음 · `flushUrl` 직후 push 가 취소되지 않음 · `debounceMs` · replace 실패를 삼킴.
- **코덱**: 형식이 틀린 값은 `undefined`(던지지 않음) · `withDefault` 기본값 생략·대체(배열·bigint 값 비교) · `bool` 이 `'1'`/`'0'` 만 · `int` 범위 · `bigint` 앞자리 0 거부 · `array` 반복 키와 틀린 원소 버림 · `bindQueryCodecs` 왕복(URL → 상태 → URL 이 같은 문자열) · spec 밖 상태 키 보존.
- **`useServerTable`**: 동시 변경에 조회 1번 · 늦은 응답 무시 · 필터·쪽 크기 변경 → 1쪽 + 조회 1번 · 인바운드 복원 중 쪽 유지 · 정렬 보정과 `sortBy` 되돌림 · `sort: false` · bigint `total` · 오류 시 비움과 `error`, 다음 조회에서 해제 · `isFiltered` 기본 판정 · `urlSync` 생략 규칙과 키 충돌 오류 · itemsPerPage 자르기 · `immediate: false`.
- **`useWriteFlow`**(실제 `ConfirmDialog`·`ReauthDialog` 를 `v-bind` 로 붙인 렌더 테스트): 관문별 열림 · 비밀번호 1회 전달·미보관 · §4-4 표의 각 행(`handled` 포함) · 진행 중 `run()` 무시 · 취소 → `false` · 비-ApiError 재throw · `submitting` 이 다이얼로그 `submitting` 에 연결.
- **`toFieldErrors`**: 정상 변환 · 루트 path · 같은 키 누적 · 코드 불일치·스키마 불일치·비 ApiError → `{}`.
- **client**: `onError` 가 한 매크로태스크 뒤 · `handled` 면 건너뜀 · 훅 예외 격리. 기존 `client.test.ts`·`wiring.integration.test.ts` 를 새 타이밍에 맞춘다.
- **error-codes**: 새 코드와 409.
- **마무리**: `pnpm check` 초록, `/smoke`(패킹 tarball 을 소비 앱에서 vue-tsc·vite build, 새 export 포함), `no-cycles` 유지.

## 8. 릴리스 · 문서

- changeset **minor**(`fixed` 묶음 → 세 패키지 0.3.0). 소비자 안내: 새 API(§4), 새 오류 코드, **`onError` 가 한 매크로태스크 뒤에 불린다**(동기 호출에 기대던 코드는 고칠 것), 서버는 revision 충돌에 `ERR_COMMON_REVISION_CONFLICT` 를 보낼 것.
- `docs/01-phase0.md` §2-2 에 PR #3 경계 결정(§2-1)을 반영하고 §8 의 "미확인" 을 해소한다.
- `CLAUDE.md`·`docs/HANDOFF.md` 진행표의 PR #3 을 3a~3e 로 나눈다.

## 9. 비범위 · 보류

- 3b~3e 의 컴포넌트·composable(`PermissionMatrix`·`useRoleEditor`·`SettingsShell` / `SessionTable`·`useSessions`·`TemporaryPasswordDialog`·`PasswordChangeForm` / `TeamTree`·`TeamUserList`·`flattenTeamTree`·`useTeamTree` / `LegalDocumentEditor`).
- 글자 입력 지연: 표는 적용된 필터만 본다. 입력값·적용값 분리와 Enter·버튼 적용은 페이지 몫(hangang·gise 공통).
- 마지막 쪽의 마지막 행 삭제 뒤 빈 쪽 보정: 네 프로젝트 어디에도 없다.
- 요청 취소(AbortController), gise `isRestoring`, crm 날짜 코덱, gise 표시 추적(→ B).
