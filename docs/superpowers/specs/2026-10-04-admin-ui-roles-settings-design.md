# admin-ui 역할 · 설정 설계 (Phase 1 PR #3b)

작성일: 2026-10-04 · 상태: 확정(구현 전) · 선행: PR #3a 스펙(`2026-10-03-admin-ui-list-write-design.md`) §2-1 · §4-4, `docs/01-phase0.md` §4, `docs/phase0-reports/fe-pages.md` §2 · `be-modules.md`

## 1. 목표

역할(직책) 화면과 설정 셸을 패키지에 넣는다. 화면 배치는 템플릿(B)에 남기고, 네 프로젝트가 복사-수정해 온 **상태 · 규칙**을 패키지가 갖는다.

- admin-shared 에 역할 코어 스키마(`adminRoleSchema` 등)를 먼저 둔다. Phase 2 서버와 admin-ui 가 같은 모양을 본다.
- admin-ui 에 `PermissionMatrix`(표시) · `useRoleEditor`(상태 · 규칙, headless) · `SettingsShell`(설정 2단 셸)을 넣는다.
- 3a 의 `useWriteFlow` 에서 남은 두 문제를 고친다. 하나는 검증 오류가 조용히 사라지는 경로이고, 다른 하나는 언마운트 중 재인증이 멈추는 결함이다.

새 peer 의존은 없다.

## 2. 결정

### 2-1. 3b 경계 결정 (2026-10-04)

결정 문서는 세션 아티팩트였고 지금은 없다. 이 표가 정본이다.

| 결정                        | 확정                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| ① 매트릭스 카탈로그 모양    | **M1** — 카테고리 격자(axion 모양). 칸 키 `${resource}:${action}` 이 유효 권한 목록에 없으면 비활성(hangang). 누락 검사 도우미 |
| ② scope 축                  | **S1** — 매트릭스는 scope 를 모른다. 행 끝 슬롯 `#row-extra` 만 둔다                                                           |
| ③ 함의 권한                 | **I1** — `useRoleEditor` 의 `implies` 옵션. 매트릭스는 칸 하나만 토글한다                                                      |
| ④ `useRoleEditor` 범위      | **R1** — hangang 역할 화면의 상태 · 규칙 전부를 headless 로. 2단 배치 · 드래그 정렬 · 문구는 B                                 |
| ⑤ `SettingsShell` 메뉴      | **E1** — 라우트 자식 `meta` 에서 파생. 판정은 `filterMenu`                                                                     |
| ⑥ 검증 오류 처리됨(3a 잔여) | **V1** — `run({ fields })`. 폼이 그리는 키만 처리됨                                                                            |
| 역할 모양                   | admin-shared 코어 스키마를 선행한다                                                                                            |
| `revision`                  | **필수**. 3b 에는 끄는 경로가 없다 — 실제로 필요한 프로젝트가 나오면 명시적 선택지로 더한다                                    |
| 릴리스                      | Version Packages PR #2 머지를 3b 가 main 에 들어올 때까지 보류한다. 0.3.0 하나에 3a + 3b                                       |

### 2-2. 3b 설계 결정

| #   | 결정                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | `revision` 은 수정 · 삭제 본문에 필수다. 🔴 **순서 이동은 `revision` 을 싣지도 올리지도 않는다** — 순서는 내용이 아니다. 올리면 남이 순서만 바꿔도 편집 중인 사람의 저장이 충돌로 떨어진다 |
| D2  | `PermissionMatrix` 는 칸 하나만 토글하는 순수 표시 컴포넌트다. 함의 · 전체 권한 · 권한 상승 방지는 `useRoleEditor` 가 판정해 바인딩(`modelValue` · `disabled` · `canPick`)으로 넘긴다      |
| D3  | `useRoleEditor` 의 쓰기는 내부 `useWriteFlow` 하나로 한다. 만들기 · 수정 · 삭제의 관문은 `reauth` 옵션으로 정하고, 이동은 늘 `none` 이다                                                   |
| D4  | revision 충돌은 `useRoleEditor` 가 처리한다(전역 토스트 없음). 폼을 유지하고 `conflicted` 를 켠다. 같은 행을 다시 `select` 하면 풀린다                                                     |
| D5  | 빈 이름 · 변경 없는 저장은 `canSave` 로 버튼 단계에서 막는다. 그래서 패키지에 검증 문구 상수를 두지 않는다. 길이 · 중복은 서버 검증이 `fieldErrors` 로 온다                                |
| D6  | `SettingsShell` 은 자기 라우트 레코드를 vue-router `matchedRouteKey` 주입으로 읽는다. 소비자의 라우트 표를 import 하지 않는다                                                              |
| D7  | 앱 스토어에 `refresh()` 를 더한다. 자기 직책 저장 뒤 `/me` 를 다시 받을 길이 지금은 없다(`initialize()` 는 한 번만 가져온다)                                                               |
| D8  | `useWriteFlow`: `fields` 로 처리됨 판정(V1), 재인증 관문의 `currentPassword` 검증 오류는 다이얼로그 `error` 로, 스코프 해제 뒤에는 어떤 오류도 처리됨으로 표시하지 않는다                  |
| D9  | 반환 형태는 3a 와 같이 ref 묶음이다. 다이얼로그 · 매트릭스는 `v-bind` 로 붙는 바인딩 객체로 낸다(`useWriteFlow` 의 `confirmDialog` 와 같은 모양)                                           |

## 3. 정본과 흡수 목록

| 산출물              | 정본                                                                              | 흡수할 것                                                                                                                                                                                                    | 버릴 것                                                                                 |
| ------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 역할 스키마         | gise 역할 DTO(revision) · hangang `roles.api.ts` 모양                             | 공통 필드 `roleNo · roleName · displayOrder · isDefault · permissions`, gise `revision`, hangang 이동 본문 분리                                                                                              | `createAt` · `updateAt`(화면이 쓰지 않음, 소비자가 `.extend`), gise `userCount`         |
| `PermissionMatrix`  | hangang `components/org/PermissionMatrix.vue` + axion `data/permission_matrix.ts` | hangang: 없는 칸 비활성, `'*'` 를 구조적으로 못 만듦, 칸 하나만 토글. axion: 카테고리마다 다른 열 · 라벨                                                                                                     | hangang 고정 열 `read/write/delete` · 라벨 없음, `data-perm` 속성(테스트 전용)          |
| `useRoleEditor`     | hangang `pages/settings/roles.vue` · `roles-messages.ts`                          | §4-4 의 🔴 규칙 전부(전체 권한 스위치, 함의 써 넣기, 바뀐 것만 전송, 이웃 순서, 재조회와 선택 이동, 자기 직책 판정, 응답 경합). gise 권한 상승 방지(`coversPermissions` 로 칸 · 행 잠금), gise revision 충돌 | hangang 문구 · 메시지 해석(→ 전역 토스트), `total` 잘림 안내(→ 어댑터가 전량), 2단 배치 |
| `SettingsShell`     | hangang `pages/settings/index.vue`                                                | 자식 `meta` 파생, `watch(route.path, { immediate })` 재진입 리다이렉트, 허용된 첫 자식 · 없으면 403                                                                                                          | 라우트 표 직접 import(→ `matchedRouteKey`), `usePermission` 직접 import(→ `check` prop) |
| 앱 스토어 `refresh` | hangang `initialize()` 의 매번 재요청                                             | 자기 직책 저장 뒤 `/me` 재조회                                                                                                                                                                               | 실패 시 세션 비우기(→ 기존 값 유지)                                                     |

## 4. 공개 API

### 4-1. admin-shared 역할 스키마 (`src/roles.ts`)

```ts
const roleNameSchema = z.string().min(1).max(64)
const revisionSchema = z.number().int().min(0)

export const adminRoleSchema = z.object({
  roleNo: z.bigint(),
  roleName: roleNameSchema,
  displayOrder: z.number().int().min(0),
  isDefault: z.boolean(),
  /** 프로젝트가 `.extend({ permissions: permissionListSchema })` 로 좁힌다. */
  permissions: z.array(z.string()),
  /** 🔴 Phase 0 §4 "쓰기 보호는 revision 기본". 수정 · 삭제 성공마다 서버가 올린다. 이동은 올리지 않는다. */
  revision: revisionSchema,
})
export const adminRoleCreateSchema = z.object({
  roleName: roleNameSchema,
  isDefault: z.boolean(),
  permissions: z.array(z.string()),
})
export const adminRoleUpdateSchema = z.object({
  roleName: roleNameSchema.optional(),
  isDefault: z.boolean().optional(),
  permissions: z.array(z.string()).optional(),
  revision: revisionSchema,
})
export const adminRoleMoveSchema = z.object({ displayOrder: z.number().int().min(0) })
export const adminRoleRemoveSchema = z.object({ revision: revisionSchema })

export type AdminRole = z.infer<typeof adminRoleSchema>
// AdminRoleCreate · AdminRoleUpdate · AdminRoleMove · AdminRoleRemove 도 같은 방식
```

- 🔴 **`.refine()` 을 걸지 않는다.** zod 4 는 refinement 가 있는 객체 스키마의 `.omit()` · `.pick()` 을 던진다(4.6.5 실측 — `.extend()` 는 refinement 를 안고 동작한다). 그러면 프로젝트가 필드를 덜어 낼 수 없고, §10 의 "`revision` 끄는 경로"(`.omit({ revision: true })`)도 막힌다. "수정할 값이 없다" 검사는 서버가 원하면 따로 건다.
- `roleName` 최대 64 는 hangang 의 `maxlength` 이다. Phase 2 컬럼 길이와 맞춘다.
- 🔴 **`'*'` 는 `permissions` 안에서 `['*']` 하나로만 쓴다**(hangang 서버 정규화 규칙 ①). 스키마는 이것을 강제하지 않고 서버 정규화가 맡는다. 주석으로 적는다.

### 4-2. `PermissionMatrix`

```ts
export interface PermissionMatrixColumn {
  action: string
  label: string
}
export interface PermissionMatrixRow {
  resource: string
  label: string
}
export interface PermissionMatrixCategory {
  id: string
  label: string
  columns: readonly PermissionMatrixColumn[]
  rows: readonly PermissionMatrixRow[]
}

/** 카탈로그의 모든 권한(`'*'` 제외)이 어느 한 칸에 놓였는지. 아니면 빠진 키를 나열하며 던진다. */
export function assertMatrixCoversPermissions(
  categories: readonly PermissionMatrixCategory[],
  permissions: readonly string[],
): void
```

| prop / 슬롯                      | 내용                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `v-model`(`modelValue`)          | `string[]`. 칸을 켜면 그 키를 더하고, 끄면 그 키를 뺀 새 배열을 낸다. 다른 키는 건드리지 않는다                    |
| `categories`                     | 위 모양. 카테고리마다 표 하나                                                                                      |
| `permissions`                    | 유효 권한 목록. 칸 키가 여기 없으면 그 칸은 비활성 · 미체크다                                                      |
| `disabled`                       | 기본 false. 모든 칸 비활성                                                                                         |
| `canPick?(p)`                    | 메서드 꼴(bivariant, `MainMenu` 의 `filter` 와 같은 이유). false 면 그 칸 비활성. 체크 표시는 모델을 그대로 따른다 |
| `#row-extra="{ row, category }"` | 있으면 카테고리 표마다 끝에 열 하나를 더해 행마다 그린다. scope 선택 상자 자리(S1)                                 |

- 렌더: 카테고리마다 `VTable`. 첫 머리 칸은 카테고리 라벨, 그다음은 열 라벨이다. 행 머리 칸(`th scope="row"`)은 행 라벨이다.
- 칸은 `VCheckbox` 다. 접근 가능한 이름은 `aria-label="{행 라벨} {열 라벨}"`, `name` 은 권한 키다. 테스트는 이 둘로 찾는다(`data-testid` 를 쓰지 않는다).
- 🔴 `'*'` 는 칸이 될 수 없다. 칸 키는 늘 `${resource}:${action}` 이라 `'*'` 와 같아질 수 없다. 이것이 hangang 의 "전체 권한을 행으로 넣으면 `*:read` 가 조용히 버려진다" 사고를 구조적으로 막는다.
- 리소스에 점이 있어도 된다(`org.users:read`). 키를 쪼개지 않으므로 상관없다.

### 4-3. 내부 순수 함수 (`composables/role-permissions.ts`, export 하지 않음)

| 함수                                                   | 동작                                                                                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `orderedPermissions(catalog, list)`                    | `catalog` 순서로 거른다. `'*'` 와 카탈로그 밖 키는 버린다                                                                                 |
| `impliedClosure(implies, key)`                         | `key` 가 연쇄적으로 함의하는 키 전부(순환 안전). `key` 자신은 빼고 돌려준다                                                               |
| `togglePermission(catalog, implies, current, key, on)` | 켜면 `key` + 닫힘, 끄면 `key` + 그것을 닫힘에 포함하는 키를 함께 바꾼다. 카탈로그 밖 키는 만들지도 지우지도 않는다. 결과는 `catalog` 순서 |
| `samePermissionList(a, b)`                             | 순서까지 보는 완전 대조. 양쪽 다 `orderedPermissions` 를 지났거나 정확히 `['*']` 이므로 순서가 다르면 그 자체가 결함이다(hangang)         |

🔴 끄는 방향은 `implies` 에서 **유도한다** — 두 번째 표를 받지 않는다. 두 표가 갈리면 "읽기는 껐는데 편집은 켜진" 집합이 성립하고, 서버 정규화가 그것을 되살려 화면과 저장소가 갈린다(hangang `dependentsOf`).

### 4-4. `useRoleEditor`

```ts
export interface RoleWriteContext {
  /** `reauth: true` 일 때만 있다. 본문 · 헤더 중 어디에 실을지는 어댑터가 정한다. */
  currentPassword?: string
}

export interface RoleEditorApi<R extends AdminRole = AdminRole> {
  /** 🔴 전량, `displayOrder` 오름차순. 쪽을 나누는 서버면 어댑터가 끝까지 받아 이어 붙인다. */
  list(): Promise<readonly R[]>
  /** 새 `roleNo` 를 돌려준다 — 만든 행을 선택하는 데 쓴다. */
  create(body: AdminRoleCreate, ctx: RoleWriteContext): Promise<bigint>
  update(roleNo: bigint, body: AdminRoleUpdate, ctx: RoleWriteContext): Promise<void>
  remove(roleNo: bigint, body: AdminRoleRemove, ctx: RoleWriteContext): Promise<void>
  /** 🔴 재인증 없음 · revision 없음(D1). */
  move(roleNo: bigint, body: AdminRoleMove): Promise<void>
}

export type RoleEditorAction = 'create' | 'update' | 'remove'

export interface RoleEditorOptions<P extends string = string, R extends AdminRole = AdminRole> {
  api: RoleEditorApi<R>
  /** 정렬 순서이자 유효 키 목록. 보통 카탈로그의 `ALL_PERMISSION_VALUES`. `'*'` 는 걸러 낸다. */
  permissions: readonly P[]
  /** 쓰기 권한. 게터 — 호출 시점마다 평가한다. */
  canWrite: () => boolean
  /** `{ 'org.users:write': ['org.users:read'] }`. 연쇄를 펼친다. */
  implies?: Partial<Record<P, readonly P[]>>
  /** 기본 false. true 면 만들기 · 수정 · 삭제에 재인증 관문. 이동은 늘 관문 없음. */
  reauth?: boolean
  /** 기본 `useAdminUi().user()?.permissions ?? []`. */
  actorPermissions?: () => readonly string[]
  /** 기본 `user()?.roleName === role.roleName`(roleName 은 UNIQUE 전제 — hangang). */
  isSelf?: (role: R) => boolean
  /** 자기 직책 **수정** 성공 뒤. 템플릿이 `store.refresh()` 와 권한 상실 시 이동을 한다. */
  onSelfRoleSaved?: () => void | Promise<void>
  /** 관문 다이얼로그 문구. 기본은 §4-4-3 */
  dialogText?: (action: RoleEditorAction, role: R | null) => { title?: string; message: string }
}

export interface RoleForm {
  roleName: string
  isDefault: boolean
  /** 🔴 전체 권한 — 매트릭스 행이 아니라 독립 스위치다. */
  isAll: boolean
  /** 매트릭스의 키들. 🔴 `'*'` 가 들어오는 길이 없다. */
  permissions: string[]
}

export interface PermissionMatrixBindings {
  modelValue: string[]
  'onUpdate:modelValue': (value: string[]) => void
  permissions: readonly string[]
  disabled: boolean
  canPick: (permission: string) => boolean
}

export interface RoleEditor<R extends AdminRole = AdminRole> {
  roles: Readonly<Ref<readonly R[]>>
  loading: Readonly<Ref<boolean>>
  /** 마지막 목록 조회의 오류. 다음 조회 시작 때 비운다. */
  loadError: Readonly<Ref<unknown>>
  reload: () => Promise<void>

  /** 불러온 원본 스냅샷. `null` 이면 새 역할 모드. */
  selected: Readonly<Ref<R | null>>
  select: (role: R) => void
  startCreate: () => void

  form: Ref<RoleForm>
  /** `<PermissionMatrix v-bind="matrix" :categories="…" />` */
  matrix: ComputedRef<PermissionMatrixBindings>

  canToggleAll: ComputedRef<boolean>
  permissionsLocked: ComputedRef<boolean>
  isSelfRole: ComputedRef<boolean>
  isDirty: ComputedRef<boolean>
  conflicted: Readonly<Ref<boolean>>
  canSave: ComputedRef<boolean>
  canRemove: ComputedRef<boolean>
  canMove: (role: R, direction: 'up' | 'down') => boolean

  /** 성공 true · 취소 · 실패 · 막힘 false. */
  save: () => Promise<boolean>
  remove: () => Promise<boolean>
  move: (role: R, direction: 'up' | 'down') => Promise<boolean>

  // 내부 useWriteFlow 의 것 그대로
  submitting: Readonly<Ref<boolean>>
  fieldErrors: Readonly<Ref<Record<string, string[]>>>
  confirmDialog: ComputedRef<ConfirmDialogBindings>
  reauthDialog: ComputedRef<ReauthDialogBindings>
}

export function useRoleEditor<P extends string, R extends AdminRole = AdminRole>(
  options: RoleEditorOptions<P, R>,
): RoleEditor<R>
```

setup 안에서 부른다. `actorPermissions`·`isSelf` 기본값을 쓸 때만 `useAdminUi()` 를 부른다(플러그인이 없으면 거기서 안내하며 던진다).

#### 4-4-1. 파생 값

`busy = loading || submitting`. `built()` = `form.isAll ? ['*'] : orderedPermissions(form.permissions)`. `snapshot` = 선택할 때의 `built()`.

| 값                   | 정의                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `matrix.modelValue`  | `form.isAll` 이면 카탈로그 전체(`'*'` 제외) — 체크된 채 잠겨 보인다. 🔴 `form.permissions` 는 건드리지 않는다 — 끄면 이전 값이 돌아온다          |
| `matrix.permissions` | 옵션 `permissions` 에서 `'*'` 를 뺀 목록(카탈로그 순서)                                                                                          |
| `matrix.disabled`    | `!canWrite() \|\| busy \|\| form.isAll \|\| permissionsLocked`                                                                                   |
| `matrix.canPick(p)`  | `coversPermissions(actor, [p, ...impliedClosure(p)])` — 켜면 함께 켜질 키까지 행위자가 가져야 한다                                               |
| `permissionsLocked`  | `selected != null && !coversPermissions(actor, snapshot)` — 행위자보다 넓은 역할. 이름 · 기본 여부는 고칠 수 있다                                |
| `canToggleAll`       | `canWrite() && !busy && actor 에 '*'`                                                                                                            |
| `isSelfRole`         | `selected != null && isSelf(selected)`. 🔴 폼이 아니라 원본으로 — 이름을 고쳐도 경고가 남는다                                                    |
| `isDirty`            | 새 역할: 이름(trim) 이 있거나 `isDefault` 거나 `built()` 가 비어 있지 않음. 기존: 이름(trim) · `isDefault` · `built()` 중 하나라도 스냅샷과 다름 |
| `canSave`            | `canWrite() && !busy && !conflicted && form.roleName.trim() !== '' && (selected == null \|\| isDirty)`                                           |
| `canRemove`          | `canWrite() && !busy && selected != null`                                                                                                        |
| `canMove(r, d)`      | `canWrite() && !busy` 이고 `roleNo` 로 찾은 `r` 의 그 방향 이웃이 있음                                                                           |

#### 4-4-2. 동작 계약

1. **첫 조회.** setup 에서 `reload()` 한다. 첫 조회가 성공했을 때 선택이 없고 목록이 있으면 첫 행을 연다.
2. **목록 경합.** `reload()` 는 순번을 매겨 늦게 온 옛 응답을 버린다(성공 · 실패 모두). 실패하면 `roles` 는 그대로 두고 `loadError` 를 채운다 — 로딩 · 목록 · 실패 · 빈 목록 네 갈래를 화면이 가를 수 있다.
3. **`select(role)`** 은 읽기 동작이다 — `canWrite` 로 막지 않는다. 🔴 `submitting` 동안은 무시한다(진행 중이던 저장이 성공하며 선택을 되돌리는 것을 막는다). 폼 · 스냅샷을 그 행으로 세우고, `fieldErrors` 와 `conflicted` 를 비운다.
4. **`startCreate()`** 는 `canWrite() && !busy` 일 때만. 선택을 비우고 폼을 초기화하며, `fieldErrors` 와 `conflicted` 를 비운다.
5. **매트릭스 갱신.** `matrix.disabled` 면 무시한다. 옛 `form.permissions` 와 대조해 바뀐 키 하나를 찾는다(없으면 무시). `canPick` 이 거짓이면 무시한다. 그다음 `togglePermission` 으로 함의를 **값에 써 넣는다**(hangang §7-2 "표시만 하지 말라").
6. **`save()`.** `canSave` 가 아니면 `false`. 관문은 `reauth ? 'reauth' : 'none'`, `fields: ['roleName', 'isDefault', 'permissions']`.
   - 만들기 본문: `{ roleName: trim, isDefault, permissions: built() }`.
   - 수정 본문: `{ roleName: trim, isDefault, revision: selected.revision }` + `built()` 가 스냅샷과 다를 때만 `permissions`. 🔴 늘 실으면 서버의 권한 상승 검사가 바뀌었는지와 무관하게 보낸 배열 전부를 행위자와 대조해, 범위 밖 권한을 가진 역할은 이름조차 못 고친다(hangang `samePermissionSet` 머리말).
   - 요청이 실제로 나갔으면(관문 취소가 아니면) **성공 · 실패 모두 `reload()`** 한다. 404 는 "목록이 낡았다", 409 는 "상태가 갈렸다" 이므로 새로 고치는 것이 옳은 다음 행동이다.
   - 🔴 선택은 **성공했을 때만** 옮긴다. 만들기는 돌려받은 `roleNo` 의 행(없으면 선택 비움), 수정은 같은 `roleNo` 의 행(새 `revision`)이다. 실패하면 폼을 그대로 둔다 — 고친 값을 잃지 않는다.
   - 수정 성공이고 **요청 전에 잡아 둔** `isSelfRole` 이 참이면, 재조회 · 재선택 뒤에 `onSelfRoleSaved` 를 기다린다. 훅이 던지면 `save()` 가 그대로 reject 한다(비-ApiError 를 삼키지 않는 `useWriteFlow` 원칙과 같다).
7. **`remove()`.** `canRemove` 가 아니면 `false`. 관문은 `reauth ? 'reauth' : 'confirm'`(`reversible: false`). 본문 `{ revision: selected.revision }`. 요청이 나갔으면 `reload()`. 성공이면 첫 행을 열거나(없으면 선택 비움), 실패면 그대로 둔다. 🔴 목록에서 지우는 것은 서버 성공 뒤의 재조회가 한다.
8. **`move(role, direction)`.** `canMove` 가 아니면 `false`(🔴 이웃 없는 경계도 여기서 요청 없이 끝난다). 🔴 목표값은 "내 순서 ± 1" 이 아니라 **이웃 행의 `displayOrder`** 다 — 서버가 구간 재번호라 ±1 은 구멍이 있으면 200 을 받고도 안 움직인다. `roleNo` 로 찾는다(`indexOf` 아님). 관문 `none`. 요청이 나갔으면 `reload()`. 선택 · 폼은 건드리지 않는다.
9. **revision 충돌**(`ERR_COMMON_REVISION_CONFLICT`). `save` · `remove` 의 `onConflict` 로 처리한다 → 전역 토스트 없음. `conflicted = true`, 폼 유지, 위 규칙대로 `reload()`. 화면은 배너를 그리고, 사용자가 같은 행을 다시 `select` 하면 최신 값으로 열리며 풀린다.
10. **오류 문구.** 성공 문구를 띄우지 않는다 — `save()` 등이 `true` 면 화면이 띄운다. 처리되지 않은 실패는 `createApiClient` 의 전역 `onError` 가 알린다(서버 `message` 를 그대로 — hangang 의 "`ERR_COMMON_CONFLICT` 는 한 코드가 여러 뜻" 함정).

#### 4-4-3. 관문 문구 기본값

| action   | title         | message                             |
| -------- | ------------- | ----------------------------------- |
| `create` | `역할 만들기` | `새 역할을 만듭니다.`               |
| `update` | `역할 저장`   | `「{roleName}」 역할을 저장합니다.` |
| `remove` | `역할 삭제`   | `「{roleName}」 역할을 삭제합니다.` |

`{roleName}` 은 **원본**(`selected`)의 이름이다. `gate: 'none'` 이면 쓰이지 않는다. 프로젝트 용어(직책 · 권한 그룹)는 `dialogText` 로 바꾼다.

### 4-5. `SettingsShell`

```vue
<!-- 템플릿: 라우트 /settings 의 컴포넌트 -->
<SettingsShell />
```

| prop / 슬롯     | 내용                                                                        |
| --------------- | --------------------------------------------------------------------------- |
| `check?`        | `PermissionCheck`. 생략하면 `useAdminUi().user()?.permissions`(게터)로 판정 |
| `forbiddenPath` | 기본 `'/403'`(가드 기본값과 같음)                                           |
| `menuWidth`     | 기본 `'240px'`                                                              |
| default 슬롯    | 기본 내용 `<RouterView />`. 전환 효과 등으로 감쌀 자리                      |

1. **자기 레코드.** `inject(matchedRouteKey)` — 이 셸(또는 셸을 품은 페이지)을 그린 `RouterView` 의 레코드다. 없으면(`RouterView` 밖) 안내하며 던진다. 🔴 `setupLayouts` 처럼 `path: ''` 래퍼 아래에 있어도 그 래퍼가 아니라 셸을 그린 레코드가 잡힌다.
2. **항목.** 그 레코드의 **직속 자식**. 🔴 `path: ''`(인덱스)와 동적 세그먼트(`:`)가 있는 자식은 메뉴로 갈 수 있는 자리가 아니므로 뺀다. 링크는 레코드 경로에 이은 전체 경로(`buildMenu` 와 같은 규칙), 제목은 `meta.menu?.title ?? meta.title ?? 전체 경로`, 아이콘은 `meta.menu?.icon` 이다.
3. **판정.** `filterMenu(items, check)` — 빈 권한은 공개, `permissions` AND, `anyPermissions` OR. 사용자는 게터로 읽는다 — 로그아웃 · `refresh()` 를 따른다.
4. **리다이렉트.** 🔴 `watch(() => route.path, …, { immediate: true })`. 경로가 자기 레코드 경로(끝 슬래시 무시)와 같으면 걸러진 첫 항목으로, 없으면 `forbiddenPath` 로 `router.replace`. `onMounted` 가 아닌 이유: 자식 → 부모 이동에서 부모는 다시 마운트되지 않고 patch 만 돼 오른쪽이 빈다. 사이드바의 "설정" 을 다시 누르는 것이 가장 흔한 경로다. 🔴 고정 자식이 아니라 **걸러진** 첫 항목이다 — 고정 자식은 그 권한 하나만 없는 관리자를 설정 전체에서 막는다.
5. **렌더.** `ColumnLayout` 안에 `ColumnPane(menuWidth)` + `VList nav`(`VListItem :to`)와 슬롯. 자식 페이지가 자기 루트에서 `ColumnPane` 을 내면 fragment 로 나란히 붙는다.
6. **한계.** 자기 레코드 경로에 동적 세그먼트가 있으면(`/projects/:id/settings`) 지원하지 않는다 — `console.warn` 하고 항목을 그리지 않는다.

템플릿 쪽 규약(README): 부모 레코드는 `anyPermissions` ⊇ 자식 권한 합집합을 선언한다(가드 fail-closed — 없으면 셸이 뜨기 전에 403). 템플릿 라우트 테스트에서 `assertParentAnyPermissionsCoverChildren(routes)` 를 부른다. 설정 자식은 사이드바에 올리지 않는다(`buildMenu` `depth: 1` 기본).

### 4-6. 앱 스토어 `refresh()`

```ts
interface AppStoreActions {
  /** `/me` 를 다시 받는다. 🔴 절대 거부하지 않는다. 실패하면 기존 상태를 그대로 둔다. */
  refresh: () => Promise<void>
}
```

- 진행 중인 `initialize()` · `refresh()` 가 있으면 그것을 기다린 뒤 **새로** 받는다(`login()` 과 같은 이유 — 옛 요청의 응답을 믿지 않는다).
- 성공하면 `sanitize` 를 거쳐 `userInfo` 를 바꾸고 `authorized = true`, `permissionDenied = false`.
- 실패하면 아무것도 바꾸지 않는다. 🔴 `load()` 처럼 세션을 비우면 저장 직후의 일시 오류 하나로 로그아웃된다. 401 은 `createApiClient` 의 `onUnauthorized` 경로가 따로 처리한다.
- 세대 번호 규칙은 그대로다 — 도중에 `clearSession()` 이 불리면 결과를 버린다.

### 4-7. `useWriteFlow` 변경

```ts
interface WriteCommon<T> {
  onSuccess?: …
  onConflict?: …
  /** 폼이 그리는 필드 키(`toFieldErrors` 의 점 경로). 검증 오류의 키가 전부 여기 있을 때만 처리됨. */
  fields?: readonly string[]
}
```

3a §4-4 결과 분류 표의 두 행을 바꾸고, 해제 규칙을 더한다.

| 결과                                                                       | 동작                                                                                                  | `handled`                                                         |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `ERR_COMMON_VALIDATION`, 재인증 관문이 열려 있고 `currentPassword` 키 있음 | 그 문구를 `reauthDialog.error` 로, 다이얼로그 **유지**(재인증 실패와 같음). 나머지 키는 `fieldErrors` | 나머지 키가 없거나 전부 `fields` 안                               |
| `ERR_COMMON_VALIDATION`(그 밖)                                             | `fieldErrors = toFieldErrors(e)`(**어느 경우든** 채운다), 관문 닫음 → `false`                         | 키가 하나 이상이고 **전부** `fields` 안. `fields` 가 없으면 false |
| 스코프 해제 뒤 도착한 모든 실패                                            | 관문 닫음 → `false`. `onConflict` 를 부르지 않는다                                                    | false — 보여 줄 곳이 없다                                         |

- 🔴 키는 **정확히 일치**한다. 접두 일치면 `fields: ['permissions']` 가 `permissions.3` 을 덮는데, 폼은 그 키를 그리지 않으므로 오류가 조용히 사라진다.
- 🔴 **해제 결함(3a 잔여).** 요청이 나간 동안 스코프가 해제되고 `ERR_REAUTH_REQUIRED` 가 오면, `reauthOpen` 이 아직 true 라 "다이얼로그 유지" 분기를 타고 settle 없이 끝나 `await run()` 이 영구히 멈췄다. `onScopeDispose` 가 `disposed` 를 켜고, 유지 분기 둘(재인증 실패 · `currentPassword`)은 `!disposed` 를 조건에 더한다.
- `onSuccess` 는 해제 뒤에도 부른다 — 쓰기는 이미 성공했다.
- README 의 "미표시 키 안내" 경고를 `fields` 사용법으로 바꿔 쓴다.

## 5. 의존성

새 의존 없음. `zod`(admin-shared peer, 이미 있음) · `vue-router`(admin-ui 필수 peer, `matchedRouteKey` 는 4.x export) · `pinia`(이미 있음).

## 6. 파일

| 파일 (`packages/…`)                                       | 내용                                                    |
| --------------------------------------------------------- | ------------------------------------------------------- |
| `admin-shared/src/roles.ts` · `index.ts`                  | §4-1                                                    |
| `admin-ui/src/components/permission/PermissionMatrix.vue` | §4-2 컴포넌트                                           |
| `admin-ui/src/components/permission/permission-matrix.ts` | §4-2 타입 · `assertMatrixCoversPermissions`             |
| `admin-ui/src/composables/role-permissions.ts`            | §4-3(내부)                                              |
| `admin-ui/src/composables/useRoleEditor.ts`               | §4-4                                                    |
| `admin-ui/src/layout/SettingsShell.vue`                   | §4-5                                                    |
| `admin-ui/src/store/app-store.ts`                         | §4-6                                                    |
| `admin-ui/src/composables/useWriteFlow.ts`                | §4-7                                                    |
| `admin-ui/src/index.ts` · `admin-ui/README.md`            | export · "역할 · 설정" 절 · `useWriteFlow` 절 고쳐 쓰기 |

각 파일 옆에 테스트. 정본에서 가져온 파일은 머리 주석에 출처와 바꾼 점.

## 7. 테스트 계약

TDD — 실패하는 테스트부터. DOM 이 필요한 파일은 `// @vitest-environment happy-dom`, 오버레이를 여는 테스트는 `installVisualViewport()`. 라우터는 `createMemoryHistory`.

- **역할 스키마**: 필수 필드 · `revision` 누락 거부 · 수정 본문의 선택 필드 · `.extend({ permissions })` 로 좁히기와 `.omit({ revision: true })` 가 동작(refine 없음의 근거).
- **`role-permissions`**: 연쇄 함의(`delete ⇒ write ⇒ read`) · 끄는 방향 유도 · 순환 함의에서 멈춤 · 카탈로그 밖 키를 만들지도 지우지도 않음 · `'*'` 제거 · 순서 대조.
- **`PermissionMatrix`**(렌더): 카테고리 · 열 · 행 라벨 · 접근 가능한 이름과 `name` · 없는 칸 비활성 · `disabled` · `canPick` 거짓 칸 비활성 · 칸 하나만 토글(다른 키 보존) · `#row-extra` 열 · `'*'` 미렌더 · `assertMatrixCoversPermissions` 의 누락 나열과 통과.
- **`useRoleEditor`**(실제 `PermissionMatrix` · `ConfirmDialog` · `ReauthDialog` 를 `v-bind` 로 붙인 렌더 하네스 + 가짜 어댑터): §4-4-1 표의 각 값 · §4-4-2 의 1~10 각각. 특히 — 전체 권한 켬 → `['*']` 전송과 끔 → 이전 값 복귀 · 함의 써 넣기 · 이름만 고치면 `permissions` 미전송 · 범위 밖 역할의 매트릭스 잠금과 이름 저장 가능 · `'*'` 없는 행위자의 전체 권한 스위치 잠금 · 이웃 `displayOrder` 와 경계 무요청 · 실패 시 폼 유지와 재조회 · 관문 취소 시 재조회 없음 · 자기 직책 판정이 원본 기준 · `onSelfRoleSaved` 가 수정 성공에서만 · revision 충돌의 `conflicted` 와 재선택 해제 · 저장 중 `select` 무시 · 늦은 목록 응답 무시 · `reauth` 옵션별 관문(이동은 늘 없음) · 서버 검증 오류가 `fieldErrors.roleName` 에 들어오고 처리됨.
- **`SettingsShell`**(실제 vue-router): 자식 파생과 두 제외 규칙 · 권한 걸러내기 · 첫 진입 → 첫 허용 자식 · 자식 → 부모 재진입 시 다시 이동 · 허용 0개 → `forbiddenPath` · `path: ''` 래퍼 아래 · 슬롯 대체 · `RouterView` 밖에서 던짐.
- **앱 스토어 `refresh`**: 성공 시 교체(`sanitize` 적용) · 실패 시 기존 값 유지 · 거부하지 않음 · 진행 중 요청 뒤에 새로 받음 · `clearSession` 뒤 결과 버림.
- **`useWriteFlow`**: `fields` 판정 표(전부 안 · 하나 밖 · 루트 `''` · 없음 · 접두만 일치) · `fieldErrors` 는 늘 채움 · `currentPassword` 의 다이얼로그 유지와 나머지 키 처리 · 해제 결함 재현(수정 전 실패 → 수정 후 `false` 로 끝남) · 해제 뒤 `onConflict` 미호출 · 기존 3a 테스트의 처리됨 기대를 `fields` 로 고친다. `wiring.integration.test.ts` 도 같다.
- **마무리**: `pnpm check` 초록 · `/smoke`(새 export 포함) · `no-cycles` 유지.

## 8. 릴리스 · 문서

- changeset **minor**(두 패키지, `fixed` 묶음). 내용: 새 API(§4-1 ~ §4-6), `useWriteFlow` 의 `fields`(검증 오류를 처리됨으로 표시하려면 폼이 그리는 키를 넘길 것), 서버 계약(§9).
- 🔴 Version Packages PR #2 는 3b 가 main 에 들어올 때까지 머지하지 않는다. 그러면 0.3.0 에 3a + 3b 가 함께 실리고, `fields` 없이 처리됨으로 표시하던 3a 동작은 한 번도 발행되지 않는다. 3a changeset 은 그 동작을 적지 않았으므로 고칠 것이 없다.
- 3a 스펙 §2-1 의 끊긴 아티팩트 링크를 "세션 아티팩트였고 지금은 없다 — 아래 표가 정본" 으로 바꾼다.
- `docs/01-phase0.md` §8 · `CLAUDE.md` · `docs/HANDOFF.md` 진행표에 3b 완료를 적는다.

## 9. Phase 2 서버 계약 (이 PR 에서 구현하지 않음)

- 역할 목록은 쪽을 나누지 않는다. `displayOrder` 오름차순.
- 수정 · 삭제는 `revision` 이 다르면 409 `ERR_COMMON_REVISION_CONFLICT`. 성공하면 `revision` 을 올린다. 이동은 받지도 올리지도 않는다(D1).
- 이동 목표값까지 구간을 재번호한다.
- `permissions` 정규화: `'*'` 가 섞이면 `['*']` 하나, 함의 적용, 카탈로그 순서(hangang `permissions.normalize.ts`).
- 권한 상승 검사는 `permissions` 가 본문에 있을 때만 한다. 전권자 잔존 검사도 같다.
- 만들기는 `{ roleNo }` 를 돌려준다.
- `isDefault` 단일성은 서버가 정한다(이 PR 은 다루지 않는다).

## 10. 비범위 · 보류

- 드래그 정렬(crm · axion) · 2단 배치 · 문구 · 기본 역할 표시 → B.
- scope 선택 상자 → B(`#row-extra` 슬롯에 그린다).
- gise 처럼 자원마다 액션 어휘가 다른 평면 목록 레이아웃(M3) — 빈 칸 많은 격자로 그린다.
- `revision` 을 끄는 경로(`.omit({ revision: true })` + `useRoleEditor({ revision: false })`) — 필요한 프로젝트가 나오면.
- 다른 역할로 옮길 때 저장 안 한 변경 경고 — `isDirty` 만 내고 `useDirtyGuard` 연결은 B.

## 11. 구현 중 정정 (2026-10-04)

- **R1 — refine 금지의 근거를 고쳤다(§4-1).** zod 4.6.5 에서 refinement 가 있는 객체 스키마의 `.extend()` 는 동작하고, 던지는 것은 `.omit()` · `.pick()` 이다. 결론은 같다 — 프로젝트가 필드를 덜어 내는 길과 §10 의 `revision` 끄는 경로(`.omit({ revision: true })`)를 막지 않는다.
- **R2 — `joinPath` 를 `menu.ts` 에서 export 한다**(패키지 내부용, index 에는 없음). `SettingsShell` 이 `buildMenu` 와 같은 경로 규칙을 쓴다.
- **R3 — `refresh()` 는 진행 중인 요청을 기다리기 **전에** 세대 번호를 잡는다(§4-6).** 플랜 코드는 기다린 뒤에 잡아, 기다리는 동안 `clearSession()` 이 불리면 `/me` 를 다시 받아 지운 세션을 되살렸다. 기다리는 동안 세대가 바뀌었으면 받지 않는다(Task 3 리뷰).
- **R4 — `save()` · `remove()` 는 쓰기 뒤 재조회 동안 사용자가 다른 행을 골랐으면 재선택(수정 · 만들기) · 첫 행 이동(삭제)을 하지 않는다(§4-4-2 #3 보강).** `select()` 는 요청이 나가 있는 동안(`submitting`)만 무시하고, 재조회 중의 선택은 사용자의 선택으로 존중한다. 자기 직책 수정이면 `onSelfRoleSaved` 는 그래도 부른다(Task 7 리뷰).
- **R5 — `SettingsShell` 의 "RouterView 밖" 테스트는 `expect(() => mount(…)).toThrow(/RouterView/)` 로 잰다.** `@vue/test-utils` 의 `mount()` 는 `config.errorHandler` 와 무관하게 setup 오류를 다시 던져, 플랜의 errorHandler 수집 방식은 통과할 수 없었다(Task 8).
