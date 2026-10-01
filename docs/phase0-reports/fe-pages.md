# Phase 0 — 프론트엔드 관리 기능 페이지·도메인 컴포넌트 대조

대상 4개 프로젝트(오프라인 추출본 `/home/claude/phase0`, `node_modules` 없음):

| 약칭 | src 루트 |
|---|---|
| **K** (kim5257) | `kim5257-crm-v5/packages/frontend-core/src`(공용 lib) + `kim5257-crm-v5/apps/base/frontend/src`(앱) |
| **A** (axion) | `ssworks-axion-admin/packages/frontend/src` |
| **G** (gise) | `ssworks-gise-home/apps/admin/src` |
| **H** (hangang) | `hangang-home/apps/admin/src` |

이 보고서는 위 경로 아래 **in-scope 파일을 전부 읽고** 작성했다(줄 수는 `wc -l` 실측). 아래 표의 "없음"은 추출본에 파일이 없다는 뜻이며, 해당 프로젝트 원본에 존재하는지는 확인하지 않았다.

### 0-1. 참조되지만 추출본에 없는 파일(추측 금지 — 아래 분석에서 "미확인"으로 표기)

| 프로젝트 | 참조하는 파일 | 없는 파일 |
|---|---|---|
| K | `apps/base/frontend/src/pages/org/user.vue` | `components/user/UserFormDialog.vue`, `ResignDialog.vue`, `RehireDialog.vue` |
| K | `apps/base/frontend/src/pages/org/team.vue` | `components/user/UserList.vue`, `UserInfoCard.vue` |
| A | `pages/settings/roles.vue` | `utils/role-scopes.ts`(`effectiveScope`, `normalizeScopesForSave`) |
| G | `pages/accounts/users/index.vue` | `components/AccountSessionsDialog.vue` |
| H | `pages/settings/ip-access.vue`, `storage.vue` | `api/ip-access.api.ts`, `api/storage.api.ts` (API 계약은 `apps/api/src/modules/ip-access/ip-access.controller.ts` 로 대신 확인) |

---

## 1. 기능별 대조표

### 1-A. 인증·자기 계정 (login / 403 / index / me·account·password)

| 기능 | K | A | G | H |
|---|---|---|---|---|
| login | `pages/login.vue` **125** — `appStore.login(userId,password)`, `PasswordField`, ErrorCodes 4종 분기(`ERR_IP_NOT_ALLOWED/ERR_NO_USER/ERR_WRONG_PASSWORD/ERR_RESIGNED_USER`), 안전 redirect 정규식 `/^\/(?!\/|\\)/` | `pages/login.vue` **330** — K 와 같은 골격 + OAuth 제공자 버튼(`authApi.socialProviders()`), 중첩 query 오류 처리 | `pages/login.vue` **46** — 폼 + `useToast` 오류 | `pages/login.vue` **109** — K 와 같은 골격, 오류 문구는 `login-messages.ts` 로 분리, `isPasswordChangeRequired` 면 `/account` 로 |
| 403 | `pages/403.vue` 38 | (없음 — 라우터 가드에서 처리, 추출본에 파일 없음) | `pages/403.vue` 16 | `pages/403.vue` 34 (`definePage` 대신 `routes.ts` meta) |
| index(대시보드) | `pages/index.vue` 175 — 통계 위젯(CRM 전용) | `pages/index.vue` 253 — 대시보드(프로젝트 전용) | `pages/index.vue` 143 — 위젯(프로젝트 전용) | `pages/index.vue` 57 — 메뉴 leaf 카드 목록(`router/menu.ts` 파생) |
| 내 계정 | (없음 — 세션은 `MySessionsPanel`) | (없음) | `pages/me.vue` **292** — `displayName` 수정 + 내 세션 목록(`SessionTable`) + 다른 세션 종료 | `pages/account.vue` **185** — 내 정보 표시(`VList`) + 비밀번호 변경 폼(`authApi.changePassword`) |
| 비밀번호 변경 | — | — | `pages/password.vue` **172** — current/new/confirm, `appStore.changePassword`, `layout: auth`(강제 변경 화면) | `account.vue` 안에 포함 |

**공통 골격**: 4곳 모두 `appStore.login()` → `/auth/me` 재조회 → redirect. 오류 코드 분기와 redirect 안전 검사는 K/H 가 동일 정규식.

### 1-B. 사용자(직원/계정) 관리

| 항목 | K | A | G | H |
|---|---|---|---|---|
| 페이지 | `pages/org/user.vue` **330** | `pages/org/user.vue` **532** | `pages/accounts/users/index.vue` **638** | `pages/org/users.vue` **1424** + `users-messages.ts` **676** |
| 레이아웃 | 탭(재직/퇴직) + `DataTable`(frontend-core, 559줄 자체 테이블) | 탭 + `VDataTableServer` + 인라인 `BaseDialog` 4종 | `VCard` + 필터바(검색/status) + `VDataTableServer`, `useRouteQuerySync` | `PanelLayout #top`(제목·3탭·검색·팀필터·recursive) + `DataTableBody`(VDataTableServer 래퍼) + 행 `VMenu` 5동작 |
| 폼 | `UserFormDialog`(**미확인**) | 페이지 내부 `BaseDialog`(팀 `VSelect` via `flattenTeams`, 직책 필터 `!isPartner`, 근무이력 표) | `components/AccountUserFormDialog.vue` 228 (loginId/displayName/roleNo) | `components/org/UserForm.vue` 185 (userId/password/userName/roleNo/teamNo/joinAt, `defineExpose({values,validate})`) |
| 동작 | 등록·수정·퇴사·재입사·퇴사일·비밀번호 초기화(`ResetPasswordField`) | 등록·수정·퇴사·재입사·퇴사일·비밀번호 초기화(확인+결과복사 다이얼로그)·파트너 전환 | 등록(임시비밀번호 발급)·수정·비활성/재활성·잠금해제·비밀번호 재설정·세션 다이얼로그 | 등록·수정·퇴사·퇴사일 정정·재입사·비밀번호 초기화·세션 종료 |
| 재인증 | 없음 | 없음 | 없음 | **쓰기 6종 전부 `ReauthDialog`**(세션 종료만 제외) |
| 자기계정 보호 | 없음 | 없음 | `coversPermissions` 기반 self/상위 가드 + `aria-describedby` 사유 | `isSelf(userId)` → 비밀번호초기화·퇴사·퇴사일 **차단**, 세션종료 경고, 수정 시 배너 + `/me` 재조회 |
| 테스트 | 없음 | 없음 | 없음 | `users.render.test.ts` 2477줄 / it 97 |

**사용자 데이터 모델 차이**

| 필드 | K (`packages/shared/src/schemas/user.schema.ts`) | A (shared user schema) | G (`packages/shared/src/account/schema.ts`) | H (`api/users.api.ts` 인터페이스) |
|---|---|---|---|---|
| PK | `userNo` bigint | `userNo` bigint | `userNo` bigint | `userNo` bigint |
| 로그인 ID | `userId` | `userId`(`@` 금지) | `loginId` | `userId` |
| 이름 | `userName` | `userName` | `displayName` | `userName` |
| 연락처 | `userPhone` | `userPhone` | — | — |
| 소속 | `teamNo`,`teamName` / `roleNo`,`roleName` | 동일 + `isPartner`, `memberCount` | `roleNo\|null`, `roleName\|null` (팀 없음) | `teamNo`,`teamName`,`roleNo`,`roleName` (본문 전송 시 **string**) |
| 재직 | `joinAt`, `resignAt`, employmentPeriods | 동일 | `isActive`, `lockedUntil`, `lastLoginAt` | `joinAt`,`resignAt` (`'YYYY-MM-DD'`), employmentPeriods |
| 비밀번호 상태 | — | — | `isPasswordChangeRequired` | `isPasswordChangeRequired`(단건만) |
| 목록 질의 | `page/itemsPerPage/sortBy/sortOrder/filter{userId}/teamNo/recursive/resigned` | + `keyword`, `excludePartner` | `page,size,q,status(all\|active\|inactive)` | `page/itemsPerPage/sortBy/sortOrder/userId/teamNo/recursive/resigned`(bool→`'true'/'false'` 문자열, `toQueryBool`) |
| 응답 봉투 | `{success,data}` + zod parse | `{success,data}` raw | 봉투 없음 | 목록 봉투 없음(`{items,total(bigint),page,itemsPerPage}`), 단건 `{item}` |

### 1-C. 직책(역할)·권한

| 항목 | K | A | G | H |
|---|---|---|---|---|
| 페이지 | `pages/settings/roles.vue` **76** | `pages/settings/roles.vue` **739** | `pages/accounts/roles/index.vue` **285** | `pages/settings/roles.vue` **748** + `roles-messages.ts` 417 |
| 레이아웃 | `ColumnPane 320px`(`RoleList` + `RoleDropbox`) / `ColumnPane 800px`(`PermissionList :role-no`) | `ColumnPane 280px` 목록(vue-draggable-next, 인라인 rename, 기본직책, 파트너 토글, 휴지통) / 매트릭스 pane | `VDataTable`(무페이징) roleName/permissions요약/userCount/displayOrder/actions + `RoleFormDialog` | `ColumnPane 320px`(`VList`, ↑↓ 버튼) / flex pane(직책명·기본직책·전체권한 스위치 + `PermissionMatrix`) |
| 권한 편집 UI | `components/role/PermissionList.vue` 498 — `data/permission_list.ts` 그룹×actionSet(8종) + scope `VSelect` + `RoleEditItemRow`(CRM `db.edit.*`) + `RoleDbFilterSettings` | `data/permission_matrix.ts` 카테고리→rows→columns(CRUD/LICENSE/SETTINGS), scope 셀렉트(`isScopeResource`), `assignableRoleNos` | `components/RoleFormDialog.vue` 281 — 전체 스위치 + `data/permission-catalog.ts` 그룹별 체크박스, `canPick`(granted 부분집합) | `components/org/PermissionMatrix.vue` 104 — `PERMISSION_RESOURCES × [read,write,delete]`, 카탈로그에 없는 칸 disabled; 함의(write→read)는 페이지의 `togglePermission()` |
| 정렬/이동 | `PATCH /roles/:no/move` drag | drag | `displayOrder` 폼 입력 | ↑↓ 버튼, 목표값 = 이웃 `displayOrder`, 재인증 없음 |
| 재인증 | 없음 | 없음 | 없음 | 생성·수정·삭제 필수, 삭제도 본문 필수 |
| 동시성 | 없음 | 없음 | `revision` 낙관적 잠금(update 본문, delete `?revision=`) | 없음 |
| 테스트 | 없음 | `settings-screen-guards.spec.ts`(텍스트 스캔 일부) | 없음 | `roles.render.test.ts` 1712줄/it 76, `permission-matrix.render.test.ts` it 12 |

**역할→권한 매핑 모델 차이**

| 축 | K | A | G | H |
|---|---|---|---|---|
| 키 형식 | `resource:action` + `'*'` | 동일 | `domain.sub:action` + `'*'` | `domain.sub:action` + `'*'` |
| 액션 어휘 | actionSet 별 가변(crud/readonly/attendance/manage/schedule/readwrite/readmanage/system) | 카테고리별 columns(CRUD/LICENSE/SETTINGS) | 자원별 가변(read/update/moderate/feature/…) | **read/write/delete 셋 고정** |
| scope 축 | `scopes{resource: own\|team\|all}` + `hiddenDbFilters`, `scheduleMaskScope` | `scopes{}` + `assignableRoleNos`, `isPartner` | 없음 | 없음 |
| 역할 필드 | `roleNo,roleName,permissions[],scopes,isDefault,displayOrder` | + `isPartner,assignableRoleNos,partnerCount` | `roleNo,roleName,permissions[],displayOrder,isDefault,revision,userCount` | `roleNo,roleName,permissions[],displayOrder,isDefault,createAt,updateAt`(서버 정규화: `'*'`단독, write⇒read, 카탈로그 순) |
| 카탈로그 위치 | 앱 `data/permission_list.ts` | 앱 `data/permission_matrix.ts` | 앱 `data/permission-catalog.ts`(shared `ALL_PERMISSION_VALUES` 에서 파생) | shared `permissions.const.ts`(`PERMISSION_RESOURCES`,`PERMISSION_VALUES`) |

### 1-D. 팀

| 항목 | K | A | G | H |
|---|---|---|---|---|
| 페이지 | `pages/org/team.vue` **116** | `pages/org/team.vue` **179** | **없음(팀 개념 없음)** | `pages/org/teams.vue` **847** + `teams-messages.ts` 451 |
| 레이아웃 | `ColumnLayout` 3 pane: `TeamTree`(400px)+`TeamDropbox` / `UserList`(300px, **미확인**) / `UserInfoCard`(**미확인**) | 동일 3 pane: `TeamTree`/`TeamMemberList`(137)/`UserInfoCard`(298) + 삭제 확인 `BaseDialog` | — | `ColumnLayout` 3 pane: `TeamTree`(400px)/`TeamUserList`(300px)/`UserForm`(min 460px) + 만들기·개명 `VDialog`, 삭제 `ConfirmDialog` |
| 트리 | `components/team/TeamTree.vue` 220 — `@he-tree/vue` Draggable, 필터, 인라인 add/rename, `defineExpose({removeTeam})` | `TeamTree.vue` 431 — he-tree + 이동 확인 다이얼로그(실패시 `getTree` 복원) + suspend/resume 다이얼로그(파트너 영향수) | — | `components/org/TeamTree.vue` 272 — **드래그 없음**, `VList` 평탄화 + 들여쓰기, ↑↓/추가/개명/삭제 버튼 emit, 부모 포함 검색 |
| 노드 | `TeamTreeNode.vue` 153 | `TeamTreeNode.vue` 206 (칩 정지/전용/시스템) | — | 없음(평탄화) |
| 부모 재배치 | drag → `move {parentTeamNo, displayOrder}` | 동일 + 확인 | — | **봉인**(`parentTeamNo` 생략, 형제 순서만) |
| 3열 사용자 저장 | `UserInfoCard`(미확인) | `UserInfoCard` 인라인 create/edit | — | 검증만, 저장 미배선(`USER_SAVE_NOT_WIRED`) — 재인증 부재 계약 때문 |
| 테스트 | 없음 | 없음 | — | `teams.render.test.ts` 2049/it 79, `team-tree.render.test.ts` it 26, `team-user-list.render.test.ts` it 20 |

**팀 계층 모델 차이**

| 축 | K | A | H |
|---|---|---|---|
| 트리 노드 | `TeamNode{teamNo,teamName,displayOrder,children[]}` | + `suspendedAt,isManaged,isDedicated` | `TeamTreeNode{teamNo,teamName,displayOrder,children[]}` (`parentTeamNo`·`depth` 없음) |
| 평면 목록 | `teamItem{teamNo,teamName}` (`GET teams/:no/single`) | `flattenTeams()` 헬퍼 | `TeamListItem{teamNo,teamName,displayOrder,parentTeamNo\|null}` (`GET /admin/teams`, 페이지네이션 없음) / `TeamDetail`+`depth` |
| 이동 | `PATCH teams/:no/move {parentTeamNo, displayOrder}` | 동일 | `PATCH /admin/teams/:no/move {parentTeamNo?: string, displayOrder}` (`null` 금지) |
| 개명 | `PATCH teams/:no/name` | `/name` | `PATCH /admin/teams/:no {teamName}` |
| 삭제 | `DELETE teams/:no` | 동일 + `/suspend`,`/resume` | `DELETE /admin/teams/:no` 본문 없음, 서브트리 통째 |

### 1-E. 세션

| 항목 | K | A | G | H |
|---|---|---|---|---|
| 관리자 전체 세션 | `frontend-core/components/sessions/SessionsAdminPanel.vue` 235 (`VDataTableServer`, 필터 search/source, revoke/revokeByUser 확인) + `pages/settings/sessions.vue` 14 | `pages/settings/sessions.vue` 214 (동일 구조, keyword debounce) | 없음(계정별 다이얼로그 `AccountSessionsDialog` **미확인**) | 없음 — `users.vue` 행 메뉴 "세션 종료"(`DELETE /admin/sessions/user/:userNo`) 만 |
| 내 세션 | `MySessionsPanel.vue` 111 | 없음 | `pages/me.vue` + `components/SessionTable.vue` 114 (props `sessions/showIp/busy/testPrefix/emptyText`, emit `revoke`) | 없음 |
| 모델 | `sessionNo,userNo,userId,userName,ipAddress,source(web\|api),apiKeyName,device{browser,os,deviceType},deviceInfoRaw,loginAt,lastAccessAt,expireAt,isCurrent` | `deviceInfo` 문자열, 필터 `keyword` | `{sessionNo,isCurrent?,userAgent,ipAddress?,lastActiveAt,expireAt}` (`types/session.ts`) | (화면 없음) |

### 1-F. 시스템 설정

| 항목 | K | A | G | H |
|---|---|---|---|---|
| 설정 셸 index | `pages/settings/index.vue` 29 — `data/settings_menu.ts`(131) 첫 허용 항목으로 redirect(자식 라우트) | `settings/index.vue` 18 — 동일 + `settings_menu.ts` 153 | `settings/index.vue` **899** — 사이트/SEO 설정 폼(revision 충돌 UI), **프로젝트 전용** | `settings/index.vue` 100 — `/settings` 부모 라우트 셸: `ColumnLayout`(240px `VList` 메뉴 + `RouterView`), 메뉴는 `routes.ts` children 에서 파생, `watch(route.path)` 로 첫 허용 자식 redirect |
| IP 접근 | `settings/ip_access_control.vue` 357 — scope 토글 global/role/team/user/apiKey → 대상 `VSelect` → `VDataTable` + 추가 폼(`cidrSchema`,`normalizeIpPattern`) | (없음) | (없음) | `settings/ip-access.vue` **1107** + messages 816 — 규칙 표(`DataTableBody`, 클라 페이징) + 인라인 편집 `VCard` + **잠금 미리보기**(`GET /admin/ip-access/lockout-preview`) + 세션 종료 제안 + 재인증 3종 |
| 스토리지 | (없음) | (없음) | (없음) | `settings/storage.vue` 429 + messages 137 — S3 설정 폼, 키 write-only(마스킹 힌트), 연결 테스트, 버킷 생성, 재인증 2종 |
| 법적 문서 | (없음) | `settings/legal.vue` 445 + `legal.util.ts` 26 + `legal.spec.ts` — kinds 탭, current/history/publish, CodeMirror + `MarkdownView` | `settings/legal.vue` 524 — PRIVACY/TERMS 탭, 동일 구조(A 모델링 명시), 탭 전환 dirty 가드 | (없음) |
| OAuth | (없음) | `settings/oauth.vue` 757 — google/kakao/naver, `redirectBaseUrl`, provider별 `{enabled,clientId,clientSecret\|clearClientSecret}` | `settings/oauth.vue` 458 — Google 단일, `{revision,isEnabled,clientId,clientSecret?}` + 연결 확인 | (없음) |
| 시스템 일반 | `settings/system.vue` 459 + `frontend-core/stores/system-settings.ts` 135 — timezone/lateThreshold/memo*/appTitle/companyName/logo/favicon/ID 규칙(`systemGeneralSettingsApi`, `idGenerationApi`) | `settings/general.vue` 137 — `reportingTzOffset` 만 | (settings/index 에 통합) | (없음) |
| 기타(프로젝트 전용) | api_keys, audit_logs, webhooks, chat_rooms, offices, products… | account-policy, company, download, email, paddle, portone, partner-products | — | — |

---

## 2. "얇은 페이지 + 패키지 컴포넌트/composable" 분리 가능성

### 2-1. 판단 기준

읽은 결과, 4곳 모두 페이지 파일이 **①상태·API 호출·오류 문구 ②레이아웃 ③도메인 폼/표** 세 겹을 한 파일에 담고 있다. 프로젝트 무관 부분은 ②와 ③의 **골격**이고, 프로젝트 전용 부분은 (a) 필드 집합(예: `userPhone` vs `displayName`), (b) 쓰기 프로토콜(재인증 유무·revision·봉투), (c) 권한 카탈로그, (d) 오류 문구다. 따라서 **UI 골격은 slot/props 로, 데이터 프로토콜은 headless composable 의 어댑터로** 분리하면 페이지는 "어댑터 주입 + 슬롯 채우기" 로 얇아진다.

### 2-2. 기능별 분리안

| 기능 | 프로젝트 무관(패키지) | 프로젝트 전용(템플릿/앱) | 제안 패키지 API |
|---|---|---|---|
| **로그인** | 폼 골격, 오류코드→문구 매핑 훅, 안전 redirect(`/^\/(?!\/|\\)/`), `PasswordField` | 소셜 로그인 버튼(A), `isPasswordChangeRequired` 후속 경로(H `/account`, G `/password`), 브랜드 문구 | `<LoginForm :submit :messages>` slots `#brand`, `#extra`(OAuth) + `useSafeRedirect()` |
| **403 / 설정 셸** | 403 카드; 설정 셸(`ColumnLayout` 240px 메뉴 + `RouterView`, 첫 허용 자식 redirect `watch`) | 메뉴 원천(H: routes children / K·A: `settings_menu.ts`) | `<SettingsShell :items>` (`{to,title,permissions}[]`), `useFirstPermittedRedirect(items)` |
| **사용자 목록** | 서버 페이징 표 골격, 정렬키 폐집합 보정 `watch(sortBy)`(H), 요청 seq 가드, "필터 0건 vs 아직 없음" `EmptyState`, 행 액션 메뉴, 자기계정 판정 | 컬럼·필터 집합, 상태 모델(재직/퇴사 vs active/locked), 액션 집합, 재인증 유무 | `useServerTable<TRow,TQuery>({ fetch, sortKeys, defaultSort })` → `{items,total,page,itemsPerPage,sortBy,loading,reload}`; `<UserTable :headers :actions>` 는 헤더·슬롯을 앱이 주입 |
| **사용자 폼** | `UserForm` 골격(mode create/edit, `defineExpose({values,validate})` 패턴 H), 옵션 주입(`roleItems/teamItems`), diff-only update body 빌더(H `buildUpdateBody`) | 필드 목록(K/A `userPhone`, G `displayName/loginId`, H `joinAt`), 검증 규칙(`validateUserForm`) | headless `useEntityForm<T>({ initial, validate })` + `<UserFormFields>` 슬롯형; 필드 스키마를 prop 으로 |
| **재인증/확인** | `ReauthDialog`(H, 비밀번호 내부 보관·확인시 1회 emit), `ConfirmDialog`(`reversible` 필수, H/G), `TemporaryPasswordDialog`(G) ≈ H 임시비밀번호 다이얼로그 ≈ K `ResetPasswordField` 복사 UI | 어느 동작에 재인증을 붙일지(H 만 필수) | `<ReauthDialog v-model :message :error :submitting @confirm(pw)>`; `useWriteFlow({ reauth?: boolean, action })` 가 `currentPassword` 주입을 어댑터에서 처리 |
| **역할 목록+편집** | 2-pane 골격(목록 + 편집), 이웃 `displayOrder` 로 이동, `isDefault` 스위치, 전체권한(`'*'`) 독립 스위치 + 매트릭스 잠금(H·A 공통), 자기직책 배너, `/me` 재조회 | 카탈로그(자원×액션 vs 그룹×키), scope 축(K/A), `assignableRoleNos`(A), `revision`(G), 재인증(H), 드래그(K/A) | `<PermissionMatrix v-model :catalog :disabled>` (catalog = `{rows:{resource,label}[], columns:{action,label}[]}[]`) + `useRoleEditor({ api, catalog, implied? })`; scope 열은 optional slot `#cell-extra` |
| **팀 트리** | 트리 렌더(평탄화 or he-tree), 선택 v-model, 검색(부모 포함), add/rename/remove/move emit, `flattenTeamTree()`(prev/nextSiblingOrder, descendantCount) | 드래그 채택 여부(K/A vs H), suspend/resume(A), 3열 사용자 카드 | `<TeamTree v-model:selected :nodes :can-write :busy @create @rename @remove @move>` + `useTeamTree(api)`; 드래그는 `:draggable` prop 으로 옵트인 |
| **팀 3-pane 화면** | `ColumnLayout` 400/300/flex 배치 | 3열 내용(A `UserInfoCard` 저장, H 폼만) | `<OrgTeamsPage>` 는 페이지 템플릿(B), 3열은 slot |
| **세션** | 세션 표(K `SessionsAdminPanel`, G `SessionTable` 의 device/ip/lastActive/expire/actions 열), revoke 확인, `isCurrent` 행 비활성 | 필드명(`lastAccessAt` vs `lastActiveAt`, `device{}` vs `userAgent`), 라우트(`/sessions` vs `/admin/users/:no/sessions` vs `/auth/me/sessions`) | `<SessionTable :rows :show-ip :busy @revoke>` + `useSessions({ list, revoke, revokeOthers? })`; 행 어댑터 `toSessionRow()` 를 앱이 제공 |
| **내 계정/비밀번호** | 비밀번호 변경 폼(current/new/confirm, min 8, 불일치 검사 — G/H 동일), 표시이름 수정(G) | 표시 필드 집합, 변경 후 동작(G 는 강제변경 라우트 가드) | `<PasswordChangeForm :submit :min-length>` , `<MyProfileCard>` slot |
| **IP 접근** | 규칙 표 + CIDR 검증 + 편집 폼 + 삭제 확인 | scope 종류(K 5종 with apiKey vs H global/…), 잠금 미리보기(H 전용 서버), 재인증 | `<IpRuleTable>` + `useIpRules(api)`; 미리보기는 optional slot |
| **스토리지/legal/oauth/system** | legal: kinds 탭 + 에디터/미리보기/이력/발행 골격(A↔G 거의 동일) ; oauth: provider 카드 골격 | 스토리지(H만), legal 종류 집합, provider 집합(A 3종/G 1종), system 항목 전부 | `<LegalDocumentEditor :kinds :api>`(CodeMirror 의존은 peer), `<OauthProviderCard :provider>`; storage/system 은 B |

### 2-3. 결론

- **컴포넌트 층**(`PermissionMatrix`, `TeamTree`, `SessionTable`, `ReauthDialog`, `ConfirmDialog`, `EmptyState`, `PasswordField`, `TemporaryPasswordDialog`)은 4곳에서 props/emit 형태가 이미 수렴하고 있어 **패키지화 가능**.
- **페이지 층**은 쓰기 프로토콜(재인증·revision·봉투·bigint 문자열화)이 갈려 그대로 패키지화하면 어댑터가 프로젝트마다 갈린다 → **headless composable(어댑터 주입) + 템플릿 복사(B)** 조합이 현실적. 페이지는 "어댑터 + 헤더 배열 + 슬롯" 만 남기는 것을 목표로 한다.
- 데이터 모델 통일 없이는 `UserForm` 필드 자체를 패키지에 고정할 수 없다 → 필드 스키마를 prop 으로 받는 구조 또는 템플릿 복사.

---

## 3. 정본(canonical) 후보와 근거

| 기능 | 정본 후보 | 근거(읽은 사실) | 보완 출처 |
|---|---|---|---|
| 로그인 | **H** `pages/login.vue` + `login-messages.ts` | 문구 분리, K 와 같은 redirect 검사, 가장 짧음 | A 의 OAuth 슬롯 |
| 설정 셸 | **H** `settings/index.vue` | 메뉴를 라우트 children 에서 파생(정본 하나), remount 안 되는 재진입을 `watch` 로 처리, `settings.render.test.ts` it 11 | K/A `settings_menu.ts` 방식은 대체 옵션 |
| 사용자 목록/폼 | **H** `org/users.vue` + `UserForm.vue` + `users-messages.ts` | 정렬키 폐집합 보정, seq 가드, 자기계정 보호, diff-only update, `EmptyState` 구분, 렌더 테스트 97건 | G 의 `useRouteQuerySync`·`coversPermissions`·`toFieldErrors`(필드 오류 매핑), A 의 근무이력 표·비밀번호 결과 복사 UI |
| 임시 비밀번호 표시 | **G** `TemporaryPasswordDialog.vue` | 독립 컴포넌트(78줄), H 는 페이지 인라인 | H 의 `COPY_UNAVAILABLE` 3갈래 복사 처리 |
| 재인증/확인 다이얼로그 | **H** `ReauthDialog.vue`(141) / `ConfirmDialog.vue`(80) | 테스트 it 11/7, `reversible` 필수 규약 | — |
| 권한 매트릭스 | **H** `PermissionMatrix.vue` (골격) + **A** `data/permission_matrix.ts` (카탈로그 형태) | H 는 104줄·테스트 12건·`'*'` 구조적 배제; A 의 카테고리→rows→columns 구조가 액션 가변(CRUD/LICENSE)·scope 를 수용 | G 의 `canPick`(부여자 부분집합) 가드 |
| 역할 편집 페이지 | **H** `settings/roles.vue` + `roles-messages.ts` | 전체권한 독립 스위치, 함의 토글(`togglePermission`), 이웃 order 이동, 잘림 안내, 테스트 76건 | A 의 인라인 rename·`assignableRoleNos` 는 옵션 |
| 팀 트리 | **H** `TeamTree.vue`(무드래그) 를 기본, **A** `TeamTree.vue` 를 드래그 변형 | H: 서버 미호출·emit 전용·테스트 26건; A: he-tree 이동 확인/복원 로직 완성도 | K `TeamTreeNode` 는 A 의 축소판 |
| 팀 평탄화 유틸 | **H** `teams-messages.ts#flattenTeamTree` | prev/nextSiblingOrder·descendantCount 계산, 이웃 order 근거 문서화 | A `flattenTeams()` |
| 세션 표 | **G** `SessionTable.vue` | props 로만 동작, `/me` 와 계정별 다이얼로그 공용, `testPrefix` | K `SessionsAdminPanel`(서버 페이징·source 필터)·`MySessionsPanel` |
| 내 계정 | **G** `me.vue`(세션 포함) + **H** `account.vue`(비밀번호) | G 는 세션 UX, H 는 `CardLayout` 배치 | G `password.vue` 강제변경 흐름 |
| legal / oauth | **A** `legal.vue`, `oauth.vue` | G 가 A 를 모델링했다고 명시; A 는 provider 3종·spec 존재 | G 의 dirty 가드·revision |
| IP 접근 | **H** `ip-access.vue` | 안전장치(현재 IP 상시·통과 판정·잠금 미리보기) + 테스트 88건 | K 의 scope 5종(`apiKey` 포함) 선택 UI |
| 시스템 일반 설정 | **K** `system.vue` + `stores/system-settings.ts` | 유일한 완성 구현(브랜딩 자산 업로드 포함) | — |

---

## 4. A/B/X 배정

A = 패키지(공용 컴포넌트/composable), B = 템플릿 복사(프로젝트가 소유·수정), X = 제외(프로젝트 전용)

| 파일(정본 기준 경로) | 배정 | 사유 |
|---|---|---|
| `hangang-home/.../components/common/ReauthDialog.vue`, `ConfirmDialog.vue`, `EmptyState.vue`, `PasswordField.vue`, `DataTableBody.vue`, `data-table-panel.ts`(`formatSortLabel`) | **A** | props/emit 안정, 테스트 있음, 도메인 무관 |
| `ssworks-gise-home/.../components/SessionTable.vue`, `TemporaryPasswordDialog.vue`, `types/session.ts` | **A** | 순수 표시 컴포넌트 |
| `hangang-home/.../components/org/PermissionMatrix.vue` (+ A 의 카탈로그 타입) | **A** | 카탈로그를 prop 으로 받게 일반화하면 4곳 수용 |
| `hangang-home/.../components/org/TeamTree.vue`, `TeamUserList.vue`(옵션 주입 필요), `teams-messages.ts#flattenTeamTree/indentTeamName` | **A** | emit 전용, 서버 미호출 |
| `ssworks-axion-admin/.../components/team/TeamTree.vue`, `TeamTreeNode.vue`, `TeamDropbox.vue` | **A(변형)** | 드래그 옵션 구현으로 편입(`@he-tree/vue` peer) |
| `kim5257-crm-v5/.../frontend-core/components/sessions/SessionsAdminPanel.vue`, `MySessionsPanel.vue` | **A** | 이미 lib 에 있음; 필드 어댑터 추가 필요 |
| `kim5257-crm-v5/.../frontend-core/components/role/RoleEditItemRow.vue`, `apps/.../role/RoleDbFilterSettings.vue` | **X** | CRM `db.edit.*`/DB 필터 전용 |
| `hangang-home/.../components/org/UserForm.vue` | **B** | 필드 집합이 프로젝트마다 다름(§1-B) |
| `hangang-home/.../pages/login.vue` + `login-messages.ts`, `pages/403.vue` | **B** | 얇음, 브랜드/후속 경로만 수정 |
| `hangang-home/.../pages/settings/index.vue` | **A(셸 컴포넌트)** + B(라우트 등록) | 메뉴 파생·redirect 로직은 공용 |
| `hangang-home/.../pages/org/users.vue` + `users-messages.ts` | **B** | 재인증·자기계정 정책이 프로젝트 결정; composable(A) 로 표·seq·정렬보정 추출 후 복사 |
| `hangang-home/.../pages/settings/roles.vue` + `roles-messages.ts` | **B** | 카탈로그·재인증·이동 정책 의존 |
| `hangang-home/.../pages/org/teams.vue` + `teams-messages.ts`(메시지 부분) | **B** | 3열 정책·재인증 정책 의존 |
| `ssworks-gise-home/.../pages/me.vue`, `password.vue`, `hangang-home/.../pages/account.vue` | **B** | 얇음; `PasswordChangeForm` 만 A 로 추출 |
| `ssworks-gise-home/.../pages/accounts/*`, `components/AccountUserFormDialog.vue`, `RoleFormDialog.vue` | **B(대안 템플릿)** | 팀 없는 프로젝트용 사용자/역할 변형으로 보존 |
| `ssworks-axion-admin/.../pages/settings/legal.vue`, `legal.util.ts`, `components/common/MarkdownView.vue` | **A(에디터 컴포넌트)** + B(페이지) | A↔G 거의 동일 → 컴포넌트화 가치 높음 |
| `ssworks-axion-admin/.../pages/settings/oauth.vue` | **B** | provider 집합 프로젝트별 |
| `hangang-home/.../pages/settings/ip-access.vue` + messages | **B** | 미리보기 서버 의존; 규칙 표/CIDR 검증만 A 후보 |
| `kim5257-crm-v5/.../pages/settings/ip_access_control.vue` | **X** | H 에 흡수(scope 선택 UI 만 참고) |
| `hangang-home/.../pages/settings/storage.vue` + messages | **B** | 서버 모듈 동반 필요 |
| `kim5257-crm-v5/.../pages/settings/system.vue`, `frontend-core/stores/system-settings.ts` | **B** | 항목 집합 프로젝트별; 브랜딩 자산 부분은 A 후보 |
| `*/pages/index.vue`(대시보드 4종) | **X**(H `index.vue` 메뉴 카드만 B) | 프로젝트 전용 위젯 |
| `ssworks-gise-home/.../pages/settings/index.vue`(사이트/SEO) | **X** | 프로젝트 전용 |
| `kim5257-crm-v5/.../pages/org/user.vue`, `team.vue`, `settings/roles.vue`, `components/role/PermissionList.vue`, `RoleList*.vue`, `useDragContext.ts` | **X** | H/A 정본에 흡수; `useDragContext`·`RoleList` 드래그는 A 변형 참고용 |
| `ssworks-axion-admin/.../pages/org/user.vue`, `team.vue`, `settings/roles.vue`, `components/team/TeamMemberList.vue`, `UserInfoCard.vue` | **X**(참고) | `isPartner`/suspend 등 프로젝트 전용 축 다수 |
| `hangang-home/.../*.render.test.ts` | **A/B 와 함께 이동** | 정본 채택 시 계약으로 유지 |

---

## 5. 백엔드 계약 의존(페이지별)

### 5-1. 공통 프로토콜 차이(패키지 어댑터가 흡수해야 할 축)

| 축 | K | A | G | H |
|---|---|---|---|---|
| 응답 봉투 | `{success,data}` + zod | `{success,data}` | 없음(strictObject) | 라우트마다 다름: 목록 봉투 없음 / 단건 `{item}` / 생성 `{roleNo}`·`{teamNo}`·`{item}` / 수정·삭제 `{}` |
| bigint | `"BigInt(3)"` wire + 리바이버 | 동일 | bigint 직렬화 | 응답은 리바이버로 bigint, **요청 본문은 문자열**(`roleNo/teamNo/parentTeamNo`) |
| 날짜 | Date | Date | ISO 문자열 | ISO 문자열(`new Date` 금지, `'YYYY-MM-DD'` 입력) |
| 쓰기 인증 | 없음 | 없음 | `revision` 낙관적 잠금(roles/settings) | `currentPassword` 재인증(users 6·roles 3·ip-access 3·storage 2; teams·sessions·move 없음) |
| 오류 | `ErrorCodes` | `ErrorCodes` | `ERROR_CODES` + `describeApiError/hasCode/toFieldErrors` | `ErrorCode` + 화면별 `*_ERROR_MESSAGES` 표, `ERR_COMMON_CONFLICT` 는 서버 message 그대로 |

### 5-2. 페이지별 라우트·응답 모양

| 페이지 | K | A | G | H |
|---|---|---|---|---|
| login/me | `POST /auth/login`, `GET /auth/me`, `POST /auth/refresh`, `/logout` | 동일 + `GET /auth/social-providers` | `POST /auth/login`, `GET /auth/me`, `PATCH /auth/me {displayName}`, `POST /auth/password {currentPassword,newPassword}` | `POST /auth/login`→`{isPasswordChangeRequired}`, `GET /auth/me`→`MeResp`(userId, roleName; **userNo/roleNo/teamNo 없음**), `PATCH /auth/password` |
| 사용자 | `GET/POST /users`, `GET/PATCH /users/:no`, `POST /users/:no/resign`, `PATCH .../resign-date`, `POST .../rehire`, `GET .../employment-periods`, `PATCH .../password`→`{newPassword}` | 동일, 단 `POST /users/:no/reset-password` | `GET/POST /admin/users`→create `{user,temporaryPassword}`, `PATCH /admin/users/:no`, `POST .../deactivate|reactivate|unlock|password-reset` | `GET /admin/users`→`{items,total:bigint,page,itemsPerPage}`, `POST`→`{item}`, `GET/PATCH /admin/users/:no`→`{item}`, `PATCH .../password`→`{newPassword}`, `POST .../resign`, `PATCH .../resign-date`, `POST .../rehire`, `GET .../employment-periods`→`{items}`; 쓰기 6종 `currentPassword` 필수 |
| 직책 | `GET/POST /roles`, `GET/PATCH/DELETE /roles/:no`, `PATCH /roles/:no/move {displayOrder}` | 동일 | `GET/POST /admin/roles`, `PATCH /admin/roles/:no {…,revision}`, `DELETE /admin/roles/:no?revision=` | `GET /admin/roles`(봉투 없음, total bigint, 상한 100, 기본 `displayOrder asc`), `GET /admin/roles/:no`→`{item}`, `POST`→`{roleNo}`, `PATCH`→`{}`(currentPassword 외 1개 이상), `PATCH .../move {displayOrder}`(재인증 없음), `DELETE`(본문 `{currentPassword}` 필수) |
| 팀 | `GET /teams[/:root]`(트리), `GET /teams/:no/single`, `POST /teams {parentTeamNo,teamName}`, `PATCH /teams/:no/move`, `/name`, `DELETE` | 동일 + `POST .../suspend {reason}`, `/resume` | — | `GET /admin/teams`→`{items}`(페이징 없음), `GET /admin/teams/tree`→`{item\|null}`, `GET /admin/teams/:no`→`{item(depth)}`, `POST`→`{teamNo}` (`parentTeamNo` string 필수), `PATCH /:no {teamName}`, `PATCH /:no/move {parentTeamNo?:string,displayOrder}`, `DELETE`(본문 없음, 서브트리) |
| 세션 | `GET /sessions`, `GET /sessions/me`, `DELETE /sessions/:no`, `DELETE /sessions/by-user/:userNo`→`{revokedCount}`, `DELETE /sessions/me/:no` | 동일 5개 | `GET /admin/users/:no/sessions`, `DELETE .../sessions/:sessionNo`, `POST .../sessions/revoke-all`; `GET /auth/me/sessions`, `DELETE /auth/me/sessions/:no`, `POST /auth/me/sessions/revoke-others`→`{revokedCount}` | `DELETE /admin/sessions/user/:userNo` 만(본문 없음, `org.users:write`) |
| IP 접근 | `ipAccessApi.findAll({scopeType,scopeRefNo})`, `create({scopeType,scopeRefNo,cidr,description})`, `remove(ruleNo)` | — | — | `GET /admin/ip-access`(고정 정렬, 페이징 없음), `GET /admin/ip-access/lockout-preview`(`setting.ipAccess:write`, query `op/ruleNo/scopeType/cidr/scopeRefNo`)→`{actorIp,actorPasses,items[{becomesLocked,…}],summary}`, `POST`, `PATCH /:ruleNo`(4필드+currentPassword 항상), `DELETE /:ruleNo`(본문 currentPassword) |
| 스토리지 | — | — | — | `storageApi.get()`→`StorageConfigView`(`s3AccessKeySet/Masked`, `isCredentialReadable`, `lastTestAt/Result`), `save(body+currentPassword)`, `test()`→`{result,message,lastTestAt}`, `createBucket({currentPassword})`→`{}` (api 파일 미확인) |
| legal | — | `legalApi.getCurrent/listHistory/publish/getOne` | `fetchCurrentLegalDocument/fetchLegalDocumentHistory/fetchLegalDocumentByNo/publishLegalDocument` | — |
| oauth | — | `oauthSettingsApi.get/updateSettings({redirectBaseUrl})/updateCredentials(provider,{enabled,clientId,clientSecret\|clearClientSecret})` | `fetchOauthSettings/updateOauthSettings{revision,isEnabled,clientId,clientSecret?}/checkOauthConnection` | — |
| 시스템 설정 | `systemGeneralSettingsApi.get/update/uploadAsset/deleteAsset/getPublicBranding`, 자산 URL `/api/system-settings/branding/assets/{kind}?v=etag`, `idGenerationApi` | `appSettingsApi`(reportingTzOffset) | 사이트/SEO API(revision) | — |

### 5-3. 패키지 설계에 직접 영향을 주는 계약 결정(백엔드 Phase 와 합의 필요)

1. **봉투/총계 형식 통일** — H 는 라우트마다 봉투가 다르고 `total` 이 bigint; 표 composable 은 `{items,total:number}` 정규화 어댑터를 요구.
2. **쓰기 보호 방식** — 재인증(H) / revision(G) / 없음(K·A) 중 택일 또는 둘 다 옵션화. `useWriteFlow` 는 `{reauth?, revision?}` 를 옵션으로 받아야 한다.
3. **권한 카탈로그 원천** — H 처럼 shared 상수에서 `PERMISSION_RESOURCES×ACTIONS` 를 내면 `PermissionMatrix` 가 카탈로그를 prop 없이도 구성 가능; A 형(카테고리별 액션 가변)을 표준으로 잡으면 카탈로그 객체를 prop 으로 받아야 한다.
4. **`/auth/me` 응답** — H 는 `userNo/roleNo/teamNo` 를 내지 않아 자기계정 판정이 `userId`/`roleName` 문자열 비교에 의존. 패키지의 `isSelf()` 는 판별 키를 옵션으로 받아야 한다.
5. **팀 이동 API** — `parentTeamNo` 생략=순서 이동(H) vs 항상 전달(K/A). `TeamTree` 의 `move` emit 을 `{teamNo, direction}` (H) 와 `{teamNo, parentTeamNo, displayOrder}` (드래그) 둘 다 지원해야 한다.
6. **세션 필드명** — `lastAccessAt`(K/A) vs `lastActiveAt`(G), `device{}` vs `deviceInfo`/`userAgent`. `SessionTable` 행 타입을 `{sessionNo, deviceText, ipAddress?, lastActiveAt, expireAt, isCurrent}` 로 정규화하는 어댑터 필요.
