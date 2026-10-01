# 관리자 페이지 공용화 방안 검토

작성일: 2026-10-01
대상 프로젝트: kim5257-crm-v5, ssworks-axion-admin(요청의 "atlas-admin"에 해당하는 폴더), ssworks-gise-home, hangang-home
참고: kim5257-project-template (기존 템플릿 저장소, 브랜치 master / preset/db / preset/auth)

## 1. 현황 분석 (실제 코드 기준)

### 1-1. 기술 스택은 4개 프로젝트가 사실상 동일

| 계층          | 공통 스택                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| 저장소 구조   | pnpm monorepo (`apps/*` 또는 `packages/*`, `packages/shared`)                                                     |
| 관리자 프론트 | Vue 3 + Vuetify + Pinia + vue-router + Vite (unplugin-vue-router / vite-plugin-vue-layouts-next 사용 여부만 차이) |
| API           | NestJS + Kysely + `@kim5257/kysely-mariadb-dialect`, `@nestjs/jwt`, zod (nestjs-zod / @anatine/zod-nestjs)        |
| shared        | zod 스키마, 권한 상수(PERMISSIONS), 타입, 유틸                                                                    |

스택이 갈라진 곳이 없으므로 "문서로 재구현" 없이 **코드를 그대로 재사용**할 수 있는 조건이 이미 갖춰져 있다.

### 1-2. 반복되는 단위 (4개 중 3개 이상에서 동일 역할로 등장)

프론트

- `layouts/default.vue`, `layouts/auth.vue`
- `components/layout/{AppBar, MainMenu, MainMenuItem}.vue`
- `components/ui/{CardLayout, PanelLayout, ColumnLayout, ColumnPane}.vue`
- `components/common/{BaseDialog, ConfirmDialog, PasswordField}.vue`
- `composables/usePermission.ts`, `stores/app.ts`, `router/guards`, `api/client.ts`
- `data/main_menu.ts`, `data/permission_matrix|permission-catalog.ts`
- `pages/{login, 403, index, users|accounts, roles, teams, settings, me|account}.vue`
- `plugins/vuetify.ts` — 테마 색상만 브랜드별로 다르고 `defaults`(compact density, outlined variant, 한국어 locale)는 동일

백엔드

- `core/{database, guards, decorators, filters, audit}`
- `modules/{auth, users, roles, teams, sessions, ip-access}`

### 1-3. 현재 방식 = 복사 후 수정, 그리고 드리프트

- hangang-home의 `usePermission.ts` 주석: `ported from kim5257-crm-v5@99eb3797 ... (수정 둘: getScope() 제거, import 경로 명시)` → 실제로 수동 포팅이 관행이다.
- 같은 역할의 `usePermission.ts`가 4개 프로젝트에서 24~44줄, md5 전부 다름. `CardLayout.vue`도 3종.
- crm-v5는 저장소 **안에서는** 이미 이 문제를 풀었다: `packages/frontend-core`·`backend-core`를 `apps/base`, `apps/ssenstock`, `apps/global`이 1벌 공유. 이 구조를 저장소 **밖으로** 꺼내는 것이 과제의 본질이다.
- `kim5257-project-template`은 스캐폴드(init.mjs, preset 브랜치)는 갖췄지만 관리자 기능(로그인·권한·조직)은 없다. `preset/auth` 브랜치가 그 시작점.

## 2. 세 가지 방안 평가

평가 기준: ① 신규 프로젝트 시작 속도(Day 0) ② 시작 후 개선사항이 다른 프로젝트로 흐르는가(Day 1+) ③ 유지 비용 ④ 드리프트 억제력

### 방안 1. Claude Code Skill

- 강점: "어떻게 붙이는가"(페이지 추가 시 메뉴·가드·권한 카탈로그·백엔드 모듈을 한 세트로 만드는 절차, 명명·폴더 규약, 이 워크스페이스 특유의 주의점)를 Claude가 매번 동일하게 수행하게 만든다. 사용자의 작업 방식(Claude 주도 개발)과 궁합이 좋다.
- 한계: 스킬은 **코드의 출처가 될 수 없다.** 스킬에 담긴 코드는 매 프로젝트마다 재생성되므로 테스트가 따라오지 않고, 버전이 없고, 수정이 역류하지 않는다. 지금의 복사-수정 관행을 자동화할 뿐 드리프트는 그대로다. 200개 파일 규모의 관리자 앱을 스킬 본문에 담는 것도 비현실적.
- 결론: 필요하지만 단독으로는 부족. 역할은 "절차와 규약", 코드는 다른 곳에.

### 방안 2. GitHub 템플릿 저장소

- 강점: Day 0 최강. 이미 `kim5257-project-template` + `init.mjs`가 있어 확장 비용이 낮다. 로그인·조직·권한·설정 페이지가 든 상태로 `pnpm dev`가 바로 뜨는 것이 목표라면 이것이 답이다.
- 한계: GitHub 템플릿은 **시점 스냅샷 복사**다. 만든 순간부터 템플릿과 프로젝트는 남남이 되고, hangang에서 고친 버그가 gise에는 안 간다. 즉 Day 1+ 문제(드리프트)는 전혀 못 푼다. 지금 4개 프로젝트가 정확히 이 상태다.
- 결론: 채택하되, 템플릿 안의 공통 코드를 "복사되는 파일"이 아니라 "의존하는 패키지"로 바꿔야 한다.

### 방안 3. 코드 조각 포함 상세 설계 문서

- 강점: 스택이 바뀌어도 살아남는 유일한 자산(권한 모델, 세션 정책, 라우트·메뉴·가드 일관성 규칙 같은 "왜").
- 한계: 세 방안 중 유지비가 가장 높고 가장 빨리 썩는다. 코드 조각은 실제 코드와 반드시 어긋난다. 재구현을 전제로 하므로 드리프트를 억제하기는커녕 조장한다. 스택이 이미 통일된 상황에서 "재구현 가능하게 기술"할 이유가 약하다.
- 결론: 독립 문서로 만들지 말 것. 패키지 저장소의 README·ADR(코드 옆에 두는 설계 기록)로 축소.

### 검토 과정에서 추가된 방안 4. 버전 관리되는 npm 패키지 (admin kit)

- crm-v5의 `frontend-core`/`backend-core`에서 도메인 무관 부분만 추려 `@ssworks/admin-ui`, `@ssworks/admin-server`, `@ssworks/admin-shared`로 발행. 이미 `@kim5257/kysely-mariadb-dialect`를 npm에 발행해 쓰고 있으므로 발행 파이프라인 경험이 있다.
- 이것이 Day 1+ 문제를 푸는 유일한 방안이다. 버그 수정 → 버전 올림 → 각 프로젝트는 `pnpm up` 으로 받는다. 테스트(hangang의 render.test 다수)가 패키지와 함께 이동한다.
- 비용: 4개 사본 중 정본을 정하고 확장점(slot/props/inject, Nest 모듈 옵션)을 설계하는 초기 추상화 작업. 잘못 추상화하면 프로젝트별 요구(crm의 scope 축, axion의 라이선스 등)를 막는 병목이 된다. 따라서 **범용성이 확실한 것만** 패키지로, 나머지는 템플릿(복사 후 소유)으로.

## 3. 권장안: 3층 조합 (패키지 + 템플릿 + 스킬), 문서는 코드 옆에

| 층            | 형태                                                               | 담는 것                                                                                                                                                                                                                                                                                                                                                                     | 변경 흐름                                                                       |
| ------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A. 라이브러리 | npm 패키지 `@ssworks/admin-{shared,ui,server}`                     | 레이아웃(default/auth, AppBar, MainMenu), ui(Card/Panel/Column), common(BaseDialog/ConfirmDialog/PasswordField), usePermission, app store, 라우터 가드, api client, Vuetify defaults 프리셋 / Nest: database·guards·decorators·audit·filters core, auth·users·roles·teams·sessions·ip-access 모듈(옵션으로 확장), 마이그레이션 제공자 / shared: 권한 유틸, 응답·에러 스키마 | 패키지 버전업 → 전 프로젝트 반영                                                |
| B. 템플릿     | `kim5257-project-template`의 `preset/admin` 브랜치 (GitHub 템플릿) | A를 의존성으로 쓰는 얇은 앱 골격: `vuetify.ts` 테마 색상, `main_menu.ts`, 권한 카탈로그, users/roles/teams/settings/login/403 **페이지**(A의 컴포넌트를 조립하는 얇은 파일), Docker·deploy 스크립트, init.mjs                                                                                                                                                               | 복사 후 프로젝트가 소유 (브랜드·메뉴·도메인은 원래 프로젝트마다 달라야 하는 것) |
| C. 스킬       | 템플릿 저장소 안 `.claude/skills/admin-*` (프로젝트 스킬)          | "페이지 1개 추가 = 라우트 + 메뉴 항목 + 권한 키 + 가드 + 백엔드 컨트롤러 데코레이터"를 한 세트로 만드는 절차, 폴더·명명 규약, A 패키지의 확장점 사용법, 워크스페이스 특유 주의점(Windows `/dev/null` 등)                                                                                                                                                                    | 템플릿과 같은 커밋에 살아서 코드와 함께 버전됨. 새 프로젝트에 복사되어 따라감   |
| (3의 잔여)    | A 패키지 저장소의 `docs/adr/*.md`, README                          | 권한 모델·세션 정책·메뉴/가드 일관성 규칙의 "왜"                                                                                                                                                                                                                                                                                                                            | 코드 변경 PR에 함께 갱신                                                        |

핵심 판단 두 가지

1. 스킬을 개인 전역(`~/.claude/skills`)이 아니라 **템플릿 저장소 안**에 둔다. 그래야 스킬이 설명하는 코드와 스킬이 항상 같은 버전이다.
2. A와 B의 경계는 "프로젝트마다 달라야 마땅한가"로 긋는다. 테마 색·메뉴·권한 카탈로그·페이지 구성은 달라야 하므로 B(복사), 다이얼로그·레이아웃·가드·auth 모듈은 같아야 하므로 A(의존).

## 4. 단계별 진행안

Phase 0 — 정본 확정 (반나절~1일)

- 프론트 정본: crm-v5 `frontend-core` (가장 성숙) + hangang admin의 테스트 자산. 백엔드 정본: crm-v5 `backend-core`의 core/auth/users/roles/teams/sessions.
- 4개 사본의 차이를 파일별로 대조해 확장점 목록 도출 (예: usePermission의 scope 축은 옵션으로).

Phase 1 — `@ssworks/admin-shared` + `@ssworks/admin-ui` 발행

- peerDependencies로 vue/vuetify/pinia/vue-router 고정 범위 명시(Vuetify 메이저 정렬 필수).
- 기존 4개 프로젝트는 건드리지 않고 **다음 신규 프로젝트에서만** 사용. 검증 후 기존 프로젝트는 여유 있을 때 개별 전환.

Phase 2 — `@ssworks/admin-server` 발행

- Nest 모듈을 `AdminServerModule.forRoot({...})` 형태로, 사용자 테이블 확장·권한 카탈로그 주입을 옵션화. Kysely 마이그레이션은 패키지에서 export해 프로젝트 마이그레이션 디렉터리에서 호출.

Phase 3 — 템플릿 `preset/admin` + 프로젝트 스킬

- `preset/auth` 브랜치 위에 A 패키지를 붙인 얇은 앱 골격 구성. `.claude/skills/admin-scaffold` 작성. init.mjs가 scope 치환 시 스킬 내부 참조도 함께 치환.

Phase 4 — 첫 신규 프로젝트로 실전 검증 후 A 패키지 1.0 태깅.

## 5. 리스크

- 과추상화: 4개 프로젝트 요구를 모두 옵션으로 흡수하려 들면 패키지가 비대해진다. 의심되면 B(템플릿 복사)로 내린다.
- 버전 파편화: 기존 프로젝트 전환을 강제하지 않으면 한동안 "패키지 사용 프로젝트"와 "사본 프로젝트"가 공존한다. 허용하되 신규는 예외 없이 패키지 사용.
- 발행 인프라: private 패키지면 GitHub Packages 또는 npm private 스코프 필요. 공개 가능하면 `@kim5257/*`처럼 npm 공개 발행이 가장 단순.
