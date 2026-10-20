# admin-kit 0.8.0 보고 — ringside 감사 · IP 화면 조립과 회원 화면 확인에서 나온 것 (2026-10-20)

> **상태: 전달 전.** 사람이 이 파일을 admin-kit 프로젝트에 전달한다. 반영되면 이 줄을 고친다(첫 보고 `2026-10-18-admin-kit-report.md`와 같은 방식).

ringside(링사이드) 관리자 레인이 킷 0.8.0으로 감사 로그 · IP 접근 제어 화면을 README대로 조립하고(2026-10-19), 회원 · 상점 화면을 브라우저로 확인하다(2026-10-18) 나온 것이다. 첫 보고(0.5.0, 네 항목)는 0.8.0에 모두 반영됐다 — 고맙다. ringside는 `node_modules`를 고치거나 킷 코드를 복사하지 않았다. 아래는 모두 설치된 0.8.0의 타입 · 빌드 결과 · README로 다시 확인했다(2026-10-20).

대부분 결함이라기보다 빈틈이다. 2번과 4번은 같은 바람("킷의 '사용자'를 앱 용어로 바꾸기")이라 함께 보면 좋다.

| # | 무엇 | 종류 | 고칠 곳 | 급한 정도 |
| --- | --- | --- | --- | --- |
| 1 | 팀 모듈을 켜지 않은 앱의 IP 화면에 층 "팀"이 남고, 고르면 저장이 늘 400이다 | 빠진 기능 | admin-ui `useIpAccessRules` · `IpAccessManager` | 중간 |
| 2 | 서버 오류 문구를 앱 용어로 바꿀 수 없다("사용자를 찾을 수 없습니다." 등) | 빠진 기능 | admin-server 문구 표 · 오류 코드 | 낮음 |
| 3 | "`ipAccess.manage`는 전체 권한 관리자에게만"을 서버가 강제하지 못한다 | 빠진 기능(보안 규칙) | admin-server 역할 저장 · 슬롯 옵션 | 중간 |
| 4 | admin-ui 화면 기본 문구와 `CORE_AUDIT_ACTION_GROUPS`가 공개 엔트리에 없다 | 빠진 기능(공개 API) | admin-ui `index` | 낮음 |
| 5 | 프리셋(`density: compact` · `hideDetails: auto`)에서 세로 폼 대화상자의 칸 오류 문구가 아래 칸 라벨과 겹친다 | 보기 · 안내 | admin-ui 프리셋 또는 README | 낮음 |
| 6 | 재인증 창이 설명 뒤에 "현재 비밀번호를 입력하세요."를 구분 없이 붙인다 | 보기 | admin-ui `ReauthDialog` | 낮음 |
| 7 | `useServerTable`의 기본 정렬 열은 헤더로 오름차순을 고를 수 없다(0.5.0부터) | 결함 | admin-ui `useServerTable` | 낮음 |

환경(모두 같다): `@ssworks/admin-ui` · `admin-shared` · `admin-server` 0.8.0, Vuetify 4.2.4, Vue 3.5.44, Vite 8.3.4, Windows. `createAdminVuetify()`는 옵션 없이 부르고 `vite.config`에 `vuetifyLayerOrder()`를 둔다. 켠 모듈: 인증 · 감사 · 세션 · 역할 · 사용자 · IP 접근 제어. 끈 모듈: 팀 · 약관(import 하지 않음). 전역 `reauth`는 끔(기본값). ringside는 킷의 "사용자"(코어 `users`)를 화면에서 "운영자"라 부른다 — 서비스 회원(`members`)과 헷갈리지 않게.

## 1. 팀 모듈을 켜지 않은 앱의 IP 화면에 층 "팀"이 남는다

### 재현

1. `AdminTeamsModule` 없이 `AdminIpAccessModule`을 켠다. IP 화면은 admin-ui README "IP 접근 제어" 예시대로 `useIpAccessRules({ list, preview, create, update, remove, searchUsers, canManage, canSearchUsers, onDone, messages, reauth: false })` + `<IpAccessManager v-bind="ip.manager.value" />`. 팀 모듈이 없으니 `loadTeams` · `canLoadTeams`는 주지 않는다.
2. 규칙 추가 → 층 선택에 "사용자(ringside는 `messages.scopeUser`로 '운영자') · 팀 · 전체" 셋이 나온다 → "팀"을 고른다 → 팀을 불러올 수 없으니 번호 칸이 나온다 → 아무 번호나 넣고 미리보기 · 저장.

### 기대 · 실제

- 기대: 팀 없이 쓰는 앱이 층 목록을 정할 수 있다. 또는 `loadTeams`를 주지 않으면 "팀" 층을 숨긴다.
- 실제: `UseIpAccessRulesOptions`에 층 목록 옵션이 없고, 층 선택지(`scopeItems`)는 `scopeUser` · `scopeTeam` · `scopeGlobal` 셋으로 정해져 있다. "팀"으로 저장하면 서버가 400 `ERR_COMMON_VALIDATION` + `issues[{ path: ['scopeRefNo'] }]` "대상 팀을 찾을 수 없습니다."를 돌려준다(`IP_ACCESS_MESSAGES.noScopeTeam`). 데이터는 바뀌지 않는다.

### ringside 지금

막을 방법이 없어 그대로 둔다. 운영자가 고르면 칸 오류만 본다.

### 킷에 바라는 것

1. `useIpAccessRules`에 층 목록 옵션(예: `scopes: ['user', 'global']`).
2. 또는 `loadTeams`가 없으면 "팀" 층을 숨긴다(지금은 번호 칸으로 바뀐다 — 팀 모듈이 있는데 팀 목록 권한만 없는 앱과 구분해야 하므로 1이 더 분명하다).

## 2. 서버 오류 문구를 앱 용어로 바꿀 수 없다

### 재현

화면 문구는 `messages`로 "운영자"로 바꿨다(`useSessions({ messages })` 2곳, `useIpAccessRules({ messages })` 11곳). 그 상태에서 서버가 오류를 돌려주면 서버 문구가 그대로 칸 오류 · 토스트에 나온다.

### 기대 · 실제

- 기대: 서버 문구도 앱이 덮을 수 있다. 또는 문구마다 고유한 오류 코드가 있어 화면이 코드로 문구를 고른다.
- 실제: 문구는 admin-server 안의 고정 표다 — `ACCOUNT_MESSAGES`(`dist/accounts/errors.js`) · `IP_ACCESS_MESSAGES`(`dist/ip-access/errors.js`). 둘 다 공개 엔트리에 없고 옵션도 없다. 코드는 공용(`ERR_COMMON_NOT_FOUND` · `ERR_COMMON_VALIDATION` 등)이라 화면이 코드만 보고 문구를 고를 수도 없다. "사용자"가 든 문구:
  - `noUser` "사용자를 찾을 수 없습니다."
  - `alreadyResigned` "이미 퇴사 처리된 사용자입니다."
  - `notResigned` "재직 중인 사용자는 퇴사일을 정정할 수 없습니다."
  - `notResignedForRehire` "재직 중인 사용자는 재입사 처리할 수 없습니다."
  - `noScopeUser` "대상 사용자를 찾을 수 없습니다."(IP 칸 오류)

### ringside 지금

화면 문구만 바꿨다. 서버 문구가 나오면 한 화면에서 "운영자"와 "사용자"가 섞인다. 기능에는 영향이 없다.

### 킷에 바라는 것

1. `AdminServerModule` 옵션으로 문구 표를 부분 덮기(예: `messages: { accounts: { noUser: '운영자를 찾을 수 없습니다.' } }`).
2. 또는 문구마다 고유한 오류 코드(`details.reason` 같은 하위 코드도 된다) — 화면이 코드로 문구를 고른다.
3. 4번과 묶어 "용어 하나 바꾸기"(예: `terms: { user: '운영자' }`)로 화면 · 서버 문구를 함께 바꿀 수 있으면 가장 쉽다.

## 3. "`ipAccess.manage`는 전체 권한 관리자에게만"을 서버가 강제하지 못한다

### 재현

- admin-server README(IP 접근 제어 절 주의): "`ipAccess.manage`는 사실상 전권급 슬롯이다 — 좁은 보유자도 마지막 도달 가능 전권자를 뺀 전권자를 가두고 일반 관리자를 모두 잠글 수 있다. 전체 권한 관리자에게만 준다."
- 전체 권한 관리자가 역할 API(`POST` · `PATCH /admin/roles`)로 일반 역할에 그 키(ringside 키 `settings.ipAccess:write`)를 넣는다 → 저장된다.

### 기대 · 실제

- 기대: 슬롯을 "전체 권한(`*`) 역할만"으로 표시할 수 있고, 역할 저장이 다른 역할에 그 키를 넣으면 거부한다.
- 실제: 서버는 권한 상승만 막는다(`higherRoleToGrant` · `higherRoleToEdit` — 내가 가진 것보다 넓은 역할을 만들거나 줄 수 없다). 전체 권한 관리자는 무엇이든 가졌으니 그 키를 일반 역할에 넣을 수 있다. 규칙은 README 문장으로만 있다.

### ringside 지금

역할 화면 격자에서 그 칸을 비활성으로 만들었다(`useRoleEditor`의 `matrix.canPick`과 AND로 묶은 바인딩). 그 키는 "전체 권한" 스위치로만 얻는다. 화면을 거치지 않는 API 호출은 막지 못한다.

### 킷에 바라는 것

1. 슬롯 연결 옵션에 "전체 권한만" 표시(예: `permissions: { 'ipAccess.manage': { key: '…', fullAccessOnly: true } }`, 또는 따로 `fullAccessOnlySlots: ['ipAccess.manage']`).
2. 역할 저장(만들기 · 수정)이 `*`가 아닌 역할에 그 키를 넣으면 400.
3. `useRoleEditor`가 같은 표시로 그 칸을 막는다 — 앱이 바인딩을 감싸지 않아도 되게.

## 4. 화면 기본 문구와 코어 동작 묶음을 가져다 쓸 수 없다

### 재현

"사용자"를 앱 용어로 바꾸려면 어떤 문구 키에 "사용자"가 들어 있는지 알아야 한다. admin-ui 0.8.0 `dist/index.d.ts`에서 찾는다.

### 기대 · 실제

- 기대: 세션 표 · IP · 감사 로그의 기본 문구 묶음과 `CORE_AUDIT_ACTION_GROUPS`를 export한다. 앱은 그 값을 보고 덮을 키를 고르고, 테스트에서 비교한다.
- 실제: 공개 엔트리에 없다. `CORE_AUDIT_ACTION_GROUPS`는 `dist/components/audit/audit-log.d.ts`에만 있다. ringside는 설치된 `dist/index.js`를 직접 읽어 "사용자"가 든 문구 13개(세션 표 `userColumn` · `revokeUserButton`, IP `scopeUser` · `userLabel` · `userNumberLabel` · `userNoPermissionHint` · `summaryEvaluated` · `summaryNoImpact` · `summaryRuleSetChanged` · `previewFailed` · `hintLayerShadow` · `gateImpactNone` · `conflictWithoutMessage`)와 코어 묶음 `org.user`의 라벨 "사용자"를 찾았다. 감사 라벨(`CORE_AUDIT_ACTION_LABELS` · `CORE_AUDIT_TARGET_LABELS`)은 admin-shared가 이미 export한다.

### ringside 지금

덮는 문구를 앱에 적고, composable · 컴포넌트를 렌더해 킷이 합친 최종 문구에 "사용자"가 남지 않았는지 단위 테스트로 잰다. 킷을 올려 문구가 늘면 그 테스트가 잡는다.

### 킷에 바라는 것

1. 기본 문구 export(예: `DEFAULT_SESSION_TABLE_MESSAGES` · `DEFAULT_IP_ACCESS_MESSAGES` · `DEFAULT_AUDIT_LOG_MESSAGES`)와 `CORE_AUDIT_ACTION_GROUPS` export.
2. 2번 3과 같이 "용어 하나 바꾸기" 옵션이 있으면 1은 덜 급하다.

## 5. 세로 폼 대화상자에서 칸 오류 문구가 아래 칸 라벨과 겹친다

### 재현

`VDialog`(`max-width="480"`) 안 `VCard`에 `VSelect` · `VSelect` · `VTextField` · `VTextarea`를 간격 없이 세로로 둔다(ringside 회원 제재 부과 대화상자). 제출 시점 검증으로 위 칸에 오류를 띄운다.

### 기대 · 실제

- 기대: 오류 문구가 나와도 칸끼리 겹치지 않는다.
- 실제: 프리셋 전역 기본값이 `density: 'compact'` · `hideDetails: 'auto'`다. 오류가 없을 때는 칸 아래 자리가 없어 칸이 붙어 있고, 오류 문구가 나오면 아래 칸의 라벨과 겹쳐 보였다.

### ringside 지금

고치지 않았다. 앱 쪽 배치(칸 사이 `gap`)로 풀리는지는 아직 확인하지 않았다 — 앱으로 풀리면 이 항목은 안내 요청으로 줄어든다.

### 킷에 바라는 것

1. README "Vuetify 프리셋"에 `hideDetails: 'auto'`일 때 세로 폼은 칸 사이 간격을 앱이 준다는 안내와 예(대화상자 폼).
2. 또는 킷 대화상자 · 폼 부품이 그 간격을 기본으로 갖는다.

## 6. 재인증 창이 설명과 안내를 구분 없이 붙인다

### 재현

`useWriteFlow().run`에 `gate: 'reauth'`와 설명(`message`)을 넘긴다. ringside 제재 부과의 설명은 "「글쓰기 금지」 <기간> — 사유: <운영자가 쓴 사유>" 모양이다.

### 기대 · 실제

- 기대: 설명과 "현재 비밀번호를 입력하세요."가 줄로 나뉘거나, 안내 문구를 `messages`로 바꿀 수 있다.
- 실제: `ReauthDialog`가 `message + " 현재 비밀번호를 입력하세요."`를 한 문단으로 그린다. 화면에는 "「글쓰기 금지」 … — 사유: X 현재 비밀번호를 입력하세요."로 보인다 — 설명이 마침표 없이 끝나면(운영자가 쓴 사유로 끝나면 대개 그렇다) 문장 경계가 사라진다.

### ringside 지금

그대로 둔다.

### 킷에 바라는 것

안내를 따로 줄(또는 따로 `<p>`)로 그리고, 안내 문구를 바꿀 수 있게 한다.

## 7. `useServerTable`의 기본 정렬 열은 헤더로 오름차순을 고를 수 없다 (0.5.0부터)

### 재현

`useServerTable({ sort: { keys: ['createdAt', 'balance'], default: { key: 'createdAt', order: 'desc' } } })` 목록(ringside 회원 목록). "가입" 헤더를 누른다.

### 기대 · 실제

- 기대: 기본 정렬 열도 다른 열처럼 오름차순 · 내림차순을 고를 수 있다.
- 실제: 헤더 순환이 내림차순 다음 "정렬 없음"으로 가면, `normalizeSort`가 "정렬 없음"을 기본 정렬(내림차순)로 되돌린다. 기본 정렬 열은 오름차순에 닿지 못한다. 0.5.0부터 같고 0.8.0에도 그대로다.

### ringside 지금

그대로 둔다(CLAUDE.md "알려진 킷 결함"에 적어 두었다).

### 킷에 바라는 것

"정렬 없음"을 기본 정렬로 되돌릴 때 기본 정렬 열이면 반대 방향(오름차순)으로 넘기거나, 기본 정렬 열의 순환을 "내림 ↔ 오름"으로 둔다(`mustSort`와 같은 동작).

## 결함 아님으로 정리한 것(참고)

- 조회가 실패한 직후 `items`가 빈 배열이라 빈 상태가 "0건" 문구로 나오는 것 — admin-ui README가 앱 몫으로 정했다(목록 `#no-data`에서 `error`를 먼저 본다). 보고하지 않는다.
- 감사 로그 기본 문구(`AuditLogMessages`)에는 "사용자"가 없다 — 4번은 세션 표 · IP 화면과 코어 묶음 라벨만이다.
