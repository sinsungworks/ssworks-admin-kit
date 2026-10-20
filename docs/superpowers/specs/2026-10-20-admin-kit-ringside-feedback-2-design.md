# admin-kit ringside 둘째 보고 반영 설계 (PR #3i · PR 2g)

작성일: 2026-10-20 · 상태: 확정(구현 전) · 입력: `docs/reports/2026-10-20-admin-kit-report.md`(ringside 가 킷 0.8.0 으로 감사 로그 · IP 접근 제어 화면을 조립하고 회원 화면을 확인하다 찾은 일곱 항목 — 이 세션이 0.8.0 소스로 다시 확인했다) · 선행: PR #3h 스펙(`2026-10-18-admin-ui-ringside-feedback-design.md` — S6), PR #3f · #3g 스펙(`2026-10-18-admin-ui-audit-ip-design.md` — 문구 규약 C2), PR #3a 스펙(`useServerTable` 정렬 보정), PR 2d-1 스펙(역할 · 판정), PR 2f-1 스펙(IP 접근 제어)

## 1. 목표

ringside 보고의 일곱 항목을 스펙 하나 · PR 둘로 반영한다. 둘 다 `main` 에 들어간 뒤 Version Packages 를 머지해 세 패키지를 함께 **0.9.0** 으로 낸다 — ringside 가 계약 고정(2026-10-30) 전에 한 번만 올리면 된다.

| #   | 항목(보고서)                                                                     | 하는 것                                                                       | PR  |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --- |
| R1  | 팀 모듈 없는 앱의 IP 화면에 층 "팀"이 남고 고르면 저장이 늘 400                  | `useIpAccessRules({ scopes })`                                                | #3i |
| R2  | 서버 오류 문구를 앱 용어로 못 바꾼다                                             | `AdminServerModule` 옵션 `messages` — 키별 덮어쓰기, 예외 필터 한 곳에서 적용 | 2g  |
| R3  | "`ipAccess.manage` 는 전체 권한 관리자에게만" 을 서버가 강제하지 못한다          | 카탈로그 `fullAccessOnly` — 역할 쓰기 400 · 기동 검사 · `useRoleEditor` 칸    | 2g  |
| R4  | admin-ui 기본 문구 · `CORE_AUDIT_ACTION_GROUPS` 가 공개 엔트리에 없다            | 기본 문구 객체 여덟 · 코어 묶음을 얼려서 export                               | #3i |
| R5  | 프리셋(`compact` · `hideDetails: 'auto'`)에서 세로 폼의 칸 오류가 아래 칸과 겹침 | README 만(칸 사이 `gap: 12px`) · 실브라우저 확인                              | #3i |
| R6  | 재인증 창이 설명 뒤에 "현재 비밀번호를 입력하세요." 를 구분 없이 붙인다          | 두 문단 · `prompt` prop                                                       | #3i |
| R7  | `useServerTable` 의 기본 정렬 열은 헤더로 오름차순에 닿지 못한다(0.5.0부터)      | 기본 열은 내림 ↔ 오름으로 돈다                                                | #3i |

- 템플릿 · ringside 저장소는 읽기만 한다 — 그쪽 반영은 HANDOFF 에 입력으로 남긴다(§7-3).
- 성공 기준: 팀 없는 앱이 층을 사용자 · 전체로 고정한다 · 서버 404 · 400 칸 오류 문구가 앱 용어로 나온다 · 일반 역할에 전권 전용 키를 넣는 API 호출이 400 이다 · IP 모듈을 켠 앱이 표시를 빠뜨리면 기동에서 멈춘다 · 앱이 기본 문구를 import 해 테스트에서 비교한다 · 재인증 창의 설명과 안내가 다른 문단이다 · 기본 정렬 열 헤더가 내림 → 오름 → 내림으로 돈다 · `pnpm check` · `pnpm test:db`(11.4 · 12.3) 초록 · tarball 스모크 통과.

## 2. 결정

### 2-1. 경계 결정 (2026-10-20)

채팅에서 묻고 설계 절마다 승인받았다. 모두 권장안이다.

| 결정                   | 확정                                                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① 범위 · 묶음          | **일곱 항목 · 스펙 하나 · PR 둘** — PR #3i(admin-ui: R1 · R4 · R5 · R6 · R7, 작고 더하기만)를 먼저, PR 2g(shared · server · ui: R3 · R2)를 뒤에. 0.9.0 하나로 낸다                     |
| ② R2 서버 문구         | **ⓐ 키별 덮어쓰기 · 필터 한 곳** — `AdminServerOptions.messages` 에 묶음별 `Partial`. 기동 때 "기본 문구 → 덮을 문구" 표를 만들고 예외 필터가 바꾼다. 문구를 쓰는 26곳은 고치지 않는다 |
| ③ R3 표시 위치         | **권한 카탈로그**(`definePermissions(…, { fullAccessOnly })`) — `implies` 와 같은 자리. 서버(`permissionCatalog`)와 `useRoleEditor` 가 표 하나를 쓴다                                  |
| ④ R3 기존 역할         | **쓰기에서만 막는다** — 만들기 · 권한을 바꾸는 수정만 400. 업그레이드 전에 그 키를 받은 역할은 정리될 때까지 효력이 있고 화면에서 끌 수만 있다                                         |
| ⑤ R3 IP 슬롯 표시 누락 | **기동에서 멈춘다** — IP 모듈을 켠 앱에서 `ipAccess.manage` 의 키가 `fullAccessOnly` 에 없으면 `AdminRolesModule` 이 기동을 거부한다                                                   |

버린 안과 이유:

- R2 — ⓑ 문구마다 하위 코드(`details.reason`): 앱마다 전역 `onError` 에 대응 표를 다시 만들어야 하고 봉투에 손대는 곳이 넓다. ⓒ 문구 표 DI 주입: 26곳과 순수 함수(`judgeAccountCommand` 등)의 시그니처가 바뀐다 — 요구에 비해 크다.
- R2 · R4 — "용어 하나 바꾸기"(`terms: { user: '운영자' }`): 🔴 한국어 조사가 깨진다. "운영자"는 "사용자"처럼 받침이 없어 우연히 맞지만 "회원"으로 바꾸면 "회원를 찾을 수 없습니다" 가 된다. 키별 덮어쓰기가 안전하다.
- R3 — 슬롯 옵션에 표시(`permissions: { 'ipAccess.manage': { key, fullAccessOnly } }`, 보고서 제안): 서버 슬롯을 모르는 화면(`useRoleEditor`)이 따로 목록을 받아야 해 표가 둘이 된다. 판정에서도 빼기(로그인 주체 권한에서 떼기): 업그레이드 즉시 기존 보유자가 권한을 잃고 `/me` · 메뉴가 함께 바뀐다 — 그 키는 애초에 `*` 관리자만 넣을 수 있었으니 의도된 부여다. 자동 표시(킷이 슬롯 키를 알아서 전권 전용으로): 화면 쪽 표가 따로 남는다.
- R1 — `loadTeams` 가 없으면 "팀" 층 숨기기: 팀 모듈이 있는데 팀 목록 권한만 없는 앱(지금의 번호 칸)과 구분이 안 된다(보고서도 옵션을 권했다).

### 2-2. R1 설계 결정 — IP 층 목록

| #   | 결정                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | `UseIpAccessRulesOptions.scopes?: readonly IpScopeType[]` — 기본 `IP_SCOPE_ORDER`(셋 모두). 🔴 표시 순서는 늘 사용자 → 팀 → 전체(평가 순서)이고 넘긴 순서를 따르지 않는다. 빈 배열 · 모르는 값은 setup 에서 던진다(프로그래밍 오류). 중복은 한 번으로 센다 |
| S2  | `scopeItems` 는 computed 가 된다 — `scopes` 의 층 + 폼이 지금 그 밖의 층이면(편집을 연 기존 규칙) 그 층을 제 순번 자리에 더한다. 폼이 다른 층으로 바뀌면 사라진다(`withCurrent` 와 같은 방식). 바인딩 타입은 그대로                                        |
| S3  | 새 규칙 폼의 기본 층은 `global` 이 목록에 있으면 `global`(지금과 같다), 없으면 `scopes` 의 첫 층. 고친 값 판정의 기준(`baseline`)도 같은 기본값이라 연 순간은 깨끗하다                                                                                     |
| S4  | 🔴 `updateForm` 은 목록 밖 층으로 바꾸지 않는다(지금 층 유지는 허용) — 선택지에 없는 층이 `onUpdate:form` 으로 들어와도 상태가 갈리지 않게                                                                                                                 |
| S5  | 서버는 고치지 않는다 — 팀 테이블은 코어 장이라 팀 모듈이 없어도 있고, 팀 규칙 자체는 유효하다. 목록 표는 기존 팀 규칙을 그대로 그린다                                                                                                                      |
| S6  | README 「IP 접근 제어」: 팀 모듈을 켜지 않은 앱은 `scopes: ['user', 'global']`. 팀 모듈이 있는데 팀 목록 권한만 없는 앱은 `scopes` 를 두지 않는다(번호 칸). 층 설명 문구(`hintLayerShadow` — "사용자 → 팀 → 전체")는 `messages` 로 맞춘다                  |

### 2-3. R2 설계 결정 — 서버 문구 덮어쓰기

| #   | 결정                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | 묶음 여덟: `auth`(`AUTH_MESSAGES`) · `accounts`(`ACCOUNT_MESSAGES`) · `sessions`(`SESSION_MESSAGES`) · `audit`(`AUDIT_MESSAGES`) · `teams`(`TEAM_MESSAGES`) · `legal`(`LEGAL_MESSAGES`) · `ipAccess`(`IP_ACCESS_MESSAGES`) · `ipAccessSchema`(admin-shared `IP_ACCESS_SCHEMA_MESSAGES` — 서버 검증 400 의 칸 오류로 나간다). `GUARD_MESSAGES` 는 5xx 라 고정 문구로 가려지므로 넣지 않는다 |
| M2  | `ADMIN_SERVER_DEFAULT_MESSAGES` = 묶음 → 그 표(같은 객체)를 얼려 export. `as const` 만 붙은 표(`AUTH_MESSAGES` · `SESSION_MESSAGES` · `AUDIT_MESSAGES`)도 `Object.freeze` 한다. 앱이 키를 보고 테스트에서 비교한다(R4 의 서버판)                                                                                                                                                           |
| M3  | `resolveAdminMessages(messages)` — 순수 함수, "기본 글자 → 덮을 글자" `ReadonlyMap` 을 낸다. 🔴 기동에서 멈추는 것: 모르는 묶음 · 키(오타) · 문자열이 아니거나 trim 해서 빈 값 · **같은 기본 글자를 서로 다르게 덮음**(`accounts.noUser` 와 `sessions.noUser` 는 같은 글자다 — 같은 값으로 덮으면 괜찮다). 기본값과 같은 덮기는 표에 넣지 않는다                                           |
| M4  | 🔴 같은 글자는 함께 바뀐다 — 문구는 글자로 맞추므로 한 묶음만 덮어도 같은 글자를 쓰는 다른 묶음의 응답도 바뀐다(예: `accounts.noTeam` 과 `teams.noTeam` 은 같은 "팀을 찾을 수 없습니다."). 의도한 동작이고 README 에 적는다 — 한 곳의 뜻만 바꾸려는 경우는 없었다                                                                                                                          |
| M5  | 코어 모듈이 내부 토큰 `ADMIN_MESSAGE_OVERRIDES` 를 `useFactory: (options) => resolveAdminMessages(options.messages)` 로 낸다 — `forRoot` · `forRootAsync` 모두 기동 때 검증된다                                                                                                                                                                                                            |
| M6  | 적용은 `AdminExceptionFilter` 한 곳 — `@Optional() @Inject(ADMIN_MESSAGE_OVERRIDES)`. `resolveErrorResponse` 뒤, 상태가 5xx 가 아니고 표가 비지 않았을 때 `body.message` 와 `body.details.issues[].message` 를 표로 바꾼다(새 객체 — 예외의 `details` 를 고치지 않는다). 그 밖의 `details` 는 건드리지 않는다                                                                              |
| M7  | 🔴 필터의 "반드시 응답" 불변식: 바꾸기는 자기 try 를 갖고, 던지면 **바꾸지 않은 본문**을 보낸다(경고 로그). 바꾸기 실패가 4xx 를 500 으로 만들지 않는다                                                                                                                                                                                                                                    |
| M8  | 감사 행 · 로그는 그대로다 — 감사 인터셉터 · 인증 이벤트는 `resolveErrorResponse` 의 상태 · 코드만 쓴다(문구 없음). 5xx 로그는 원문이다                                                                                                                                                                                                                                                     |
| M9  | 범위 밖: 문구 표에 없는 글자(zod 기본 문구 · `error-response.ts` 의 413 · Express 4xx 고정 문구 · 5xx 고정 문구). 표에 없는 글자를 덮을 길은 만들지 않는다                                                                                                                                                                                                                                 |
| M10 | 🔴 정적 테스트: `admin-server/src` 의 테스트 아닌 파일에서 `export const <이름>_MESSAGES` 를 찾아, 모두 M1 묶음에 있거나 제외 목록(`GUARD_MESSAGES`)에 있다 — 킷이 문구 표를 늘리고 묶음에 안 넣으면 잡힌다(`legal-append-only.test.ts` 와 같은 방식)                                                                                                                                      |

### 2-4. R3 설계 결정 — 전권 전용 권한

| #   | 결정                                                                                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | admin-shared `DefinePermissionsOptions.fullAccessOnly?: readonly P[]` · `PermissionCatalog.fullAccessOnly` — 얼린 배열, 중복 없이 카탈로그 순서(`ALL_PERMISSION_VALUES`), 기본 `[]`                                                                                                                                                                                  |
| F2  | 🔴 정의할 때 던진다: 카탈로그(+ `extraValues`) 밖 키 · `'*'` · **표시 없는 키의 함의 닫힘에 표시된 키가 있음**(그 키를 켜면 400 이 나는 칸이 생긴다). 표시된 키가 일반 키를 함의하는 것은 괜찮다(`ipAccess:write` → `ipAccess:read`)                                                                                                                                 |
| F3  | admin-server 역할 쓰기: 만들기와 `permissions` 가 있는 수정에서 정규화 결과가 `'*'` 를 갖지 않고 표시된 키가 하나라도 있으면 400 `ERR_COMMON_VALIDATION` + `issues[{ path: ['permissions'] }]`, 문구 `ACCOUNT_MESSAGES.fullAccessOnly`('전체 권한 역할만 가질 수 있는 권한이 들어 있습니다.'). 정규화가 `'*'` 를 정확히 `['*']` 로 만들므로 `*` 역할은 걸리지 않는다 |
| F4  | 순서: 재인증 → 정규화 → **F3** → 403 판정(만들기) / 트랜잭션(수정). 본문만 보는 검사라 트랜잭션 앞이다 — DB 상태를 드러내지 않으니 403 보다 앞서도 된다(2d 스펙 B7 "판정이 revision 보다 먼저" 는 잠근 행을 읽은 뒤의 순서라 해당하지 않는다)                                                                                                                        |
| F5  | 이름 · 기본 표시만 고치는 수정(`permissions` 없음) · 이동 · 삭제 · 사용자 쓰기(역할 배정)는 검사하지 않는다 — 결정 ④. 기존 역할에서 그 키를 빼는 수정은 지난다                                                                                                                                                                                                       |
| F6  | 🔴 기동: `AdminRolesModule.onModuleInit` 에서 `@Optional() @Inject(IP_ACCESS_ENABLED)` 가 참이고 `permissions['ipAccess.manage']` 의 키가 `'*'` 가 아니며 `catalog.fullAccessOnly` 에 없으면 던진다(고칠 한 줄을 문구에). 역할 모듈이 없는 앱은 킷 안에 역할 쓰기 길이 없어 검사하지 않는다                                                                          |
| F7  | 카탈로그 모양 검사(`accounts/options.ts` `isCatalog`)가 `fullAccessOnly` 배열을 요구한다 — 문구에 "admin-shared 0.9.0 이상인지". 그래서 admin-server peer 를 `@ssworks/admin-shared` `workspace:>=0.9.0 <1.0.0` 으로 올린다(`.changeset/README.md` 하한 규칙). `AdminPermissionCatalog` 타입에 `fullAccessOnly` 를 더한다                                            |
| F8  | admin-ui `RoleEditorOptions.fullAccessOnly?: readonly P[]`(보통 `catalog.fullAccessOnly`). 🔴 표시된 칸의 `canPick` 은 **그 키가 지금 폼에 켜져 있을 때만 참**(기존 덮기 판정과 AND) — 켜진 기존 역할은 끌 수 있고 다시 켤 수는 없다. 끄는 방향의 함의(그 키를 함의하는 키도 꺼짐)는 F2 가 표시된 키끼리로 묶는다                                                    |
| F9  | `PermissionMatrix` 는 그대로다(`canPick` 만 받는다). "전체 권한" 스위치를 켜면 지금처럼 모든 칸이 켜진 채 잠기고 `['*']` 만 보낸다. admin-ui peer 하한은 그대로 — 새 export 를 import 하지 않는다(배열을 받는다)                                                                                                                                                     |
| F10 | README(admin-server): IP 절의 "전체 권한 관리자에게만 준다" 주의를 "카탈로그에 `fullAccessOnly` 로 표시한다(없으면 기동 실패)"로, 역할 절에 400 · 업그레이드 전 역할 정리(그 칸이 켜진 역할 — SQL `JSON_CONTAINS(permissions, '"<키>"')`). README(admin-ui): `useRoleEditor` 옵션 표 · 매트릭스 예시에 한 줄                                                         |

### 2-5. R4 설계 결정 — 기본 문구 export

| #   | 결정                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | 🔴 **3f/3g C2 · 3h S6 을 뒤집는다** — 기본 문구 객체는 이제 공개다. 앱이 덮을 키를 고르고 테스트에서 비교한다(ringside 는 설치된 `dist/index.js` 를 읽어 찾았다)                                                                                                                                                                                  |
| E2  | 내보내는 것 여덟: `DEFAULT_SESSION_TABLE_MESSAGES` · `DEFAULT_IP_ACCESS_MESSAGES` · `DEFAULT_AUDIT_LOG_MESSAGES` · `DEFAULT_TEAM_TREE_MESSAGES` · `DEFAULT_TEAM_USER_LIST_MESSAGES` · `DEFAULT_LEGAL_MESSAGES` · `DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES` · `DEFAULT_TEAM_MESSAGES`(`useTeamTree` 의 지역 `DEFAULT_MESSAGES` 를 이름 바꿔 export) |
| E3  | 🔴 모두 `Object.freeze`(타입 `Readonly<…>`) — 얼리지 않은 객체를 내보내면 앱 한 곳의 대입이 킷 기본값을 모든 화면에서 바꾼다. 지금 얼린 것은 IP · 감사 둘뿐이다                                                                                                                                                                                   |
| E4  | `CORE_AUDIT_ACTION_GROUPS` export — 배열과 안의 항목까지 얼린다(`mergeActionGroups` 는 이미 복사한다)                                                                                                                                                                                                                                             |
| E5  | 내보내지 않는 것: `useSessions` 대화상자 기본값(버튼 문구에서 셈하는 함수 — 3h S4) · `useRoleEditor` 의 `defaultDialogText`(이미 `dialogText` 옵션). 둘 다 "사용자" 가 없다                                                                                                                                                                       |

### 2-6. R6 설계 결정 — 재인증 안내

| #   | 결정                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | `ReauthDialog` prop `prompt?: string` — 기본 '현재 비밀번호를 입력하세요.'                                                                                                                               |
| A2  | 그리기: `<p v-if="message" class="mb-2 text-body-2">{{ message }}</p>` · `<p class="mb-4 text-body-2">{{ prompt }}</p>`. 설명이 비면 안내만. `message` JSDoc 의 "뒤에 붙는다" 를 "따로 문단" 으로 고친다 |
| A3  | `ReauthDialogBindings` · `useWriteFlow` 는 그대로다 — 앱은 `v-bind` 위에 `prompt="…"` 를 얹는다. `IpAccessManager` 안의 재인증 창은 기본 안내를 쓴다                                                     |

### 2-7. R7 설계 결정 — 기본 정렬 열 순환

| #   | 결정                                                                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | 🔴 **원인**: Vuetify 헤더 순환은 오름 → 내림 → 정렬 없음(`[]`)이다. 기본 정렬이 `{ createdAt, desc }` 면 첫 클릭이 곧 "정렬 없음" 이고, 정렬 보정이 그것을 기본값(내림)으로 되돌려 오름에 닿지 못한다                                          |
| O2  | 정렬 보정 watch 가 `(value, old)` 를 받는다. **새 값이 `[]` 이고 직전 머리 열이 기본 열이면** 기본값 대신 `[{ key: 기본 열, order: 직전의 반대 }]` 로 되돌린다. 그 밖(직전이 다른 열 · 목록 밖 키 · 잘못된 방향)은 지금처럼 기본값이다         |
| O3  | 결과: 기본 열은 내림 ↔ 오름(`mustSort` 같은 동작), 다른 열은 오름 → 내림 → 기본. 기본 방향이 오름이거나 헤더에 `sortDescFirst` 가 있어도 같은 규칙으로 두 방향을 오간다. URL 에는 기본 열 오름이 `sort=createdAt:asc` 로 남는다(기본값만 생략) |
| O4  | 대가: 이미 기본 정렬인 상태에서 앱이 `sortBy.value = []` 로 "되돌리기" 를 하면 반대 방향이 된다. README 에 "기본으로 되돌리기는 `sortBy.value = [{ ...기본 }]`" 를 적는다. 동작 변경이라 changeset 에 따로 적는다                              |

### 2-8. R5 — README 만

- 「Vuetify 프리셋」에 🔴 항목: 프리셋 기본값 `hideDetails: 'auto'` 는 메시지가 없는 칸의 아래 자리를 없앤다. 그래서 세로로 붙인 칸은 오류가 나오면 아래 칸의 라벨(outlined 의 떠 있는 라벨)과 겹친다. 세로 폼은 칸 사이 간격을 앱이 준다 — 킷 폼(`PasswordChangeForm` · `IpRuleEditor`)과 같은 `gap: 12px`.
- 예시: `VDialog` · `VCard` 안 `<div class="form">` + `.form { display: flex; flex-direction: column; gap: 12px; }`.
- 실브라우저 확인(§8): 간격 없는 대화상자 폼에서 겹침을 재현하고, `gap: 12px` 에서 사라지는지 잰다. 간격으로 풀리지 않으면 이 절을 다시 연다(그때 R5 는 킷 부품 변경으로 커진다).

## 3. 공개 API

### 3-1. admin-ui — PR #3i

```ts
// useIpAccessRules
export interface UseIpAccessRulesOptions<R extends AdminIpRule = AdminIpRule> {
  // …그대로
  /** 기본 ['user', 'team', 'global']. 표시 순서는 늘 사용자 → 팀 → 전체. 팀 모듈 없는 앱은 ['user', 'global'] */
  scopes?: readonly IpScopeType[]
}
```

```vue
<!-- ReauthDialog — prop 하나 더함 -->
<ReauthDialog v-bind="flow.reauthDialog.value" prompt="운영자 본인의 현재 비밀번호를 입력하세요." />
```

`index.ts` 더함: E2 의 여덟 · `CORE_AUDIT_ACTION_GROUPS`. `useServerTable` 시그니처는 그대로(동작만 O2).

### 3-2. admin-shared — PR 2g

```ts
export interface DefinePermissionsOptions<E extends string = never, P extends string = string> {
  extraValues?: readonly E[]
  implies?: Partial<Record<P, readonly P[]>>
  /** 전체 권한(`'*'`) 역할만 가질 수 있는 키. 서버 역할 쓰기가 400 으로 막고 useRoleEditor 가 칸을 잠근다 */
  fullAccessOnly?: readonly P[]
}

export interface PermissionCatalog<T extends Record<string, string>, E extends string = never> {
  // …그대로
  readonly fullAccessOnly: readonly (T[keyof T] | E)[]
}
```

```ts
export const catalog = definePermissions(PERMISSIONS, {
  implies: { 'settings.ipAccess:write': ['settings.ipAccess:read'] },
  fullAccessOnly: ['settings.ipAccess:write'],
})
```

### 3-3. admin-server — PR 2g

```ts
export interface AdminServerMessages {
  auth?: Partial<Record<keyof typeof AUTH_MESSAGES, string>>
  accounts?: Partial<Record<keyof typeof ACCOUNT_MESSAGES, string>>
  sessions?: Partial<Record<keyof typeof SESSION_MESSAGES, string>>
  audit?: Partial<Record<keyof typeof AUDIT_MESSAGES, string>>
  teams?: Partial<Record<keyof typeof TEAM_MESSAGES, string>>
  legal?: Partial<Record<keyof typeof LEGAL_MESSAGES, string>>
  ipAccess?: Partial<Record<keyof typeof IP_ACCESS_MESSAGES, string>>
  ipAccessSchema?: Partial<Record<keyof typeof IP_ACCESS_SCHEMA_MESSAGES, string>>
}

export interface AdminServerOptions {
  // …그대로
  /** 서버 오류 문구를 키별로 덮는다. 같은 기본 글자는 함께 바뀐다. 오타 · 충돌은 기동에서 멈춘다 */
  messages?: AdminServerMessages
}

/** 묶음 → 기본 표(얼림 — 각 값은 서버가 쓰는 그 표 객체). 키를 보고 테스트에서 비교한다 */
export const ADMIN_SERVER_DEFAULT_MESSAGES: {
  readonly [G in keyof AdminServerMessages]-?: Readonly<
    Record<keyof NonNullable<AdminServerMessages[G]>, string>
  >
}
```

```ts
AdminServerModule.forRoot({
  // …
  permissionCatalog: catalog,
  messages: {
    accounts: {
      noUser: '운영자를 찾을 수 없습니다.',
      alreadyResigned: '이미 퇴사 처리된 운영자입니다.',
      notResigned: '재직 중인 운영자는 퇴사일을 정정할 수 없습니다.',
      notResignedForRehire: '재직 중인 운영자는 재입사 처리할 수 없습니다.',
    },
    sessions: { noUser: '운영자를 찾을 수 없습니다.' },
    ipAccess: { noScopeUser: '대상 운영자를 찾을 수 없습니다.' },
    ipAccessSchema: { scopeRefRequired: '팀 · 운영자 규칙은 대상을 골라야 합니다.' },
  },
})
```

`index.ts` 더함: `ADMIN_SERVER_DEFAULT_MESSAGES` · `type AdminServerMessages`. 개별 표 상수는 내보내지 않는다(묶음 객체 하나로).

### 3-4. admin-ui — PR 2g

```ts
export interface RoleEditorOptions<P extends string = string, R extends AdminRole = AdminRole> {
  // …그대로
  /** 보통 catalog.fullAccessOnly. 그 칸은 꺼져 있으면 켤 수 없다(켜져 있으면 끌 수 있다) */
  fullAccessOnly?: readonly P[]
}
```

## 4. 의존성

- 새 의존 없음.
- admin-server peer `@ssworks/admin-shared`: `workspace:>=0.4.0 <1.0.0` → `workspace:>=0.9.0 <1.0.0`(F7). admin-ui peer 는 그대로(F9).

## 5. 파일

### 5-1. PR #3i (admin-ui)

| 파일                                                                                                                                                                      | 변경                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `packages/admin-ui/src/composables/useIpAccessRules.ts`                                                                                                                   | `scopes` · computed `scopeItems` · 새 폼 기본 층 · `updateForm` 가드                |
| `packages/admin-ui/src/components/ip-access/ip-access.ts`                                                                                                                 | `scopeTypeItems(messages, scopes, current)` · `emptyIpRuleForm(scopeType)`          |
| `components/session/session-table.ts` · `components/team/team-tree.ts` · `components/team/team-user-list.ts` · `components/legal/legal-document.ts`(admin-ui `src/` 아래) | 기본 문구 `Object.freeze` · `Readonly<…>`(E3 — IP · 감사는 이미 얼림)               |
| `packages/admin-ui/src/composables/useTeamTree.ts`                                                                                                                        | `DEFAULT_TEAM_MESSAGES`(이름 · export · freeze)                                     |
| `packages/admin-ui/src/components/audit/audit-log.ts`                                                                                                                     | `CORE_AUDIT_ACTION_GROUPS` 항목까지 freeze                                          |
| `packages/admin-ui/src/components/common/ReauthDialog.vue`                                                                                                                | `prompt` · 두 문단                                                                  |
| `packages/admin-ui/src/composables/useServerTable.ts`                                                                                                                     | 정렬 보정 O2                                                                        |
| `packages/admin-ui/src/index.ts`                                                                                                                                          | export 아홉                                                                         |
| 테스트                                                                                                                                                                    | §6-1 · 새 파일 `src/default-messages.test.ts`                                       |
| `packages/admin-ui/README.md`                                                                                                                                             | 「IP 접근 제어」 · 「Vuetify 프리셋」 · 「목록」 정렬 · export 표 · 「용어 바꾸기」 |
| `.changeset/*.md`                                                                                                                                                         | admin-ui minor                                                                      |

### 5-2. PR 2g (shared · server · ui)

| 파일                                                                   | 변경                                                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `packages/admin-shared/src/permissions.ts`                             | `fullAccessOnly` 옵션 · 검사(F2) · 카탈로그 필드                                           |
| `packages/admin-server/src/http/messages.ts`                           | 새 파일 — `AdminServerMessages` · `ADMIN_SERVER_DEFAULT_MESSAGES` · `resolveAdminMessages` |
| `packages/admin-server/src/http/exception.filter.ts`                   | 덮기 적용(M6 · M7)                                                                         |
| `packages/admin-server/src/admin-server.module.ts` · `tokens.ts`       | `ADMIN_MESSAGE_OVERRIDES` provider                                                         |
| `packages/admin-server/src/options.ts`                                 | `messages` · `AdminPermissionCatalog.fullAccessOnly`                                       |
| `packages/admin-server/src/{auth,sessions,audit}/errors.ts`            | 표 `Object.freeze`(M2)                                                                     |
| `packages/admin-server/src/accounts/errors.ts` · `accounts/options.ts` | `fullAccessOnly` 문구 · 모양 검사(F7)                                                      |
| `packages/admin-server/src/roles/roles.service.ts` · `roles.module.ts` | F3 · F4 · F6                                                                               |
| `packages/admin-server/src/index.ts` · `package.json`                  | export 둘 · peer 하한                                                                      |
| `packages/admin-ui/src/composables/useRoleEditor.ts`                   | `fullAccessOnly` · `canPick`(F8)                                                           |
| 테스트                                                                 | §6-2                                                                                       |
| `packages/admin-server/README.md` · `packages/admin-ui/README.md`      | F10 · 「문구 바꾸기」                                                                      |
| `.changeset/*.md`                                                      | 세 패키지 minor                                                                            |

공통: `CLAUDE.md` · `docs/01-phase0.md` · `docs/HANDOFF.md`(§7-3), 검증 기록 `docs/verification/2026-10-20-admin-kit-ringside-feedback-2.md`(§8).

## 6. 테스트 계약

### 6-1. PR #3i

- **R1** `useIpAccessRules.render.test.ts`: 기본은 층 셋 · `scopes: ['global', 'user']` 는 사용자 → 전체 순서 · 빈 배열 · 모르는 값은 던진다 · 새 규칙 폼의 기본 층(`global` 있음 → `global`, `['user', 'team']` → `user`) · 연 순간 고친 값 없음 · 목록 밖 층의 기존 규칙을 열면 그 층이 선택지에 있고 다른 층으로 바꾸면 사라진다 · `onUpdate:form` 으로 목록 밖 층이 와도 층이 바뀌지 않는다. `ip-access-manager.render.test.ts`: 층 선택 상자에 "팀" 이 없다.
- **R4** 새 파일 `src/default-messages.test.ts`: 아홉이 index 에서 나오고 `Object.isFrozen` 이 참 · `CORE_AUDIT_ACTION_GROUPS` 의 항목도 얼어 있다 · 기본값 대입이 던진다(strict) — 컴포넌트 테스트는 고치지 않고 초록(기본 문구가 그대로라는 증거).
- **R6** `reauth-dialog.render.test.ts`: 설명과 안내가 다른 `<p>` · 설명이 비면 안내 문단 하나 · `prompt` 로 안내가 바뀐다. 안내 문구를 재는 테스트는 이 파일뿐이다(2026-10-20 grep) — 그 단언을 문단별로 고친다.
- **R7** `useServerTable.test.ts`: 기존 "빈 정렬 → 기본" 테스트를 나눈다 — 기본 열(내림)에서 `[]` → 오름 · 기본 열(오름)에서 `[]` → 내림 · 다른 열에서 `[]` → 기본 · 목록 밖 키 → 기본 · 되돌리기 동안 조회는 한 번. `useServerTable.url.test.ts`: 기본 열 오름이 `sort=<기본>:asc` 로 쓰이고 복원된다. `useServerTable.table.render.test.ts`: 🔴 기본 열 헤더를 두 번 누르면 내림 → 오름 → 내림(실제 `VDataTableServer` 순환).

### 6-2. PR 2g

- **R3** admin-shared `permissions.test.ts`: 기본 `[]` · 얼림 · 카탈로그 순서 · 중복 제거 · 밖 키 · `'*'` · 표시 없는 키의 닫힘에 표시된 키(직접 · 연쇄) → 던짐 · 표시된 키가 일반 키를 함의 → 됨.
- **R3** admin-server: `accounts/options` 단위(배열 없는 카탈로그 → 문구) · `roles.module` 기동(IP 표시 토큰 있음 + 표시 없음 → 던짐 · 표시 있음 → 됨 · 토큰 없음 → 됨 · 슬롯 키 `'*'` → 됨) · `roles.body`/HTTP(프로브): 만들기 400 `issues[0].path = ['permissions']` · 수정 400 · 이름만 수정 → 됨 · `['*', 키]` → `['*']` 로 됨 · 실 DB `roles.service.db.test.ts`: 400 뒤 행이 그대로(트랜잭션 앞) · 기존 역할(시드로 키를 넣음)의 이름 수정 · 키 빼기 수정이 된다.
- **R3** admin-ui `useRoleEditor` 테스트: 표시된 칸은 꺼져 있으면 `canPick` 거짓 · 켜진 기존 역할은 참 → 끄면 거짓 · 끈 뒤 다시 켜기 무시 · 옵션 없음 → 지금과 같다.
- **R2** `http/messages.test.ts`: 빈 옵션 → 빈 표 · 키별 덮기 · 같은 글자 같은 값 → 됨 · 다른 값 → 던짐 · 모르는 묶음 · 키 · 빈 값 · 문자열 아님 → 던짐 · 기본값과 같은 덮기는 표에 없음 · `ADMIN_SERVER_DEFAULT_MESSAGES` 와 묶음 표가 같은 객체 · 얼림. 🔴 정적 테스트(M10). `http-contract.test.ts`(프로브): 덮인 404 문구 · 400 `message` 와 `issues[].message` · 덮지 않은 문구 그대로 · 5xx 는 고정 문구 · 바꾸기가 던지는 표(가짜)면 원문 4xx(M7). `admin-server.module.test.ts`: `forRoot` · `forRootAsync` 의 오타가 기동에서 멈춘다.

## 7. 릴리스 · 문서

### 7-1. changeset

- PR #3i — `@ssworks/admin-ui` minor: `useIpAccessRules` `scopes` · 기본 문구 export 여덟 + `CORE_AUDIT_ACTION_GROUPS`(얼림 — 대입하던 코드는 던진다) · `ReauthDialog` `prompt` · 두 문단(🔴 문구를 한 문단으로 재는 앱 테스트는 고친다) · `useServerTable` 기본 열 순환(🔴 동작 변경 — `sortBy.value = []` 로 되돌리던 앱은 `[{ ...기본 }]`).
- PR 2g — `@ssworks/admin-shared` minor(`fullAccessOnly`) · `@ssworks/admin-server` minor(`messages` · 역할 쓰기 400 · 🔴 IP 모듈을 켠 앱은 카탈로그에 `fullAccessOnly: [<ipAccess.manage 키>]` 를 더해야 기동한다 · peer 하한 0.9.0) · `@ssworks/admin-ui` minor(`useRoleEditor` `fullAccessOnly`).
- `fixed` 라 세 패키지 0.9.0 예상. Version Packages PR 은 두 PR 이 모두 `main` 에 들어간 뒤 머지한다.

### 7-2. README

- admin-ui: 「IP 접근 제어」(S6) · 「Vuetify 프리셋」(§2-8) · 목록 절의 정렬 순환(O3 · O4) · export 표 · `useRoleEditor` 옵션(F8) · 새 절 「용어 바꾸기」 — "사용자"를 다른 말로 쓰는 앱의 체크리스트: 화면 `messages`(세션 · IP) · 감사 라벨(`defineAuditCatalog({ labels, targetLabels })`) · 동작 묶음(`org.user` 라벨 — 같은 prefix 로 덮기) · 서버 `messages`(admin-server README) · 기본 문구를 import 해 남은 글자를 재는 테스트 예.
- admin-server: 새 절 「문구 바꾸기」(§3-3 예시 · M4 같은 글자 · M9 범위 밖 · 오타 기동 실패) · IP 절 · 역할 절(F10).

### 7-3. 진행 문서

- `CLAUDE.md` 진행표에 3i · 2g 행(완료 시) · `docs/01-phase0.md` §8 · admin-server 규약 절에 한 줄(전권 전용 키는 카탈로그 `fullAccessOnly`, 문구 덮기는 필터 한 곳).
- `docs/HANDOFF.md` 「PR #3i · 2g 가 넘긴 것」:
  - **ringside 적용법**(0.9.0 공개 하루 뒤 설치 — 최소 공개 기간): ① 카탈로그에 `fullAccessOnly: ['settings.ipAccess:write']`(없으면 기동 실패) ② `useRoleEditor({ fullAccessOnly: catalog.fullAccessOnly })` — 매트릭스 `canPick` 을 감싼 바인딩은 지운다 ③ `useIpAccessRules({ scopes: ['user', 'global'] })` ④ 서버 `messages`(§3-3 예시) ⑤ 덮을 키를 고르는 테스트는 `DEFAULT_*_MESSAGES` import 로 ⑥ 회원 목록 기본 정렬 결함 메모(CLAUDE.md "알려진 킷 결함")를 지운다 ⑦ 세로 폼에 `gap: 12px`.
  - **템플릿 세션 입력**(`preset/admin` — push 는 사람): 킷 핀 0.9.0 · 카탈로그 `fullAccessOnly`(IP 모듈을 켜는 절 「IP 접근 제어 켜기」에 함께) · 역할 페이지 `useRoleEditor({ fullAccessOnly })` · 템플릿이 팀 모듈을 켜므로 `scopes` 는 두지 않는다.

## 8. 검증

- `pnpm check` 초록(lint → typecheck → test → build → check:dts) · `pnpm format:check` — PR 마다.
- PR 2g: `pnpm test:db` 를 11.4(33306)와 12.3(33307) 둘 다(겹쳐 돌리지 않는다).
- `/smoke` — 짧은 `%TEMP%` 경로. PR #3i 뒤: 새 export 아홉 · `scopes` · `prompt` 를 쓰는 앱 `vue-tsc` · `vite build`. PR 2g 뒤: admin-server tarball 로 `skipLibCheck: false` tsc · 기동(카탈로그 표시 없음 + IP 모듈 → 기동 실패 문구 · 표시 있음 → 기동) · `messages` 덮인 404 응답 한 번.
- 실브라우저(PR #3i): ① R5 — 프리셋 대화상자에 칸 넷을 간격 없이 / `gap: 12px` 로 두고 제출 검증 오류를 띄워 오류 문구 아래쪽과 다음 칸 라벨 위쪽의 겹침을 잰다 ② R6 — 재인증 창의 두 문단 ③ R7 — 기본 열 헤더 클릭 순환과 URL. 도구는 3h 와 같다(이 세션 브라우저 도구, 없으면 임시 앱의 `playwright-core` + 설치된 Chrome — 저장소에 의존을 더하지 않는다).
- 결과는 `docs/verification/2026-10-20-admin-kit-ringside-feedback-2.md` 에 남긴다.

## 9. 리뷰 중점 (테스트가 못 잡는 것)

- M4 — 같은 글자 공유가 실제로 바라지 않는 동시 변경을 만드는 곳이 없는지(지금 공유: `accounts.noUser` = `sessions.noUser` · `accounts.noTeam` = `teams.noTeam`).
- F2 · F8 — 함의 표가 깊은 카탈로그에서 표시된 키를 끄면 같이 꺼지는 키가 화면 기대와 맞는지.
- F6 — `forRootAsync` 로 옵션을 늦게 받는 앱에서도 기동 검사가 IP 모듈 등록 여부를 바르게 보는지(전역 표시 토큰).
- R7 — `sortDescFirst` 헤더 · 다중 정렬을 쓰지 않는 전제(한 열만 본다 — hangang)가 소비자에서도 참인지.

## 10. 비범위

- "용어 하나 바꾸기" 옵션(§2-1 버린 안) · 판정에서 전권 전용 키 빼기(결정 ④) · IP 모듈이 팀 층을 서버에서 거부하기(S5).
- 문구 표 밖 글자(M9) · `useSessions` 대화상자 · `useRoleEditor` 대화상자 기본값 export(E5) · admin-shared `describeUserAgent` 문구.
- 템플릿 · ringside 저장소(읽기만) · Node 26 · 3g 후속 셋 · `useServerTable` dispose 가드 · 조회 실패 직후 빈 상태(실서버 확인이 넘긴 결함 ②).
