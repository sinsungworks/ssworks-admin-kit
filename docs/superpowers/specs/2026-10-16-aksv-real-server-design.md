# 확인용 앱 실서버 확인 설계 (Phase 2 끝 — admin-server 첫 발행 전 관문)

작성일: 2026-10-16 · 상태: 확정(구현 전) · 선행: 2a 스펙 `docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md` §1 · 결정 ⑥ V1, 2f-2b 플랜 `docs/superpowers/plans/2026-10-15-admin-server-publish-prep.md` Task 6 Step 6(akss 레시피 사슬), `docs/HANDOFF.md` "검증" · "다음 플랜"

2a 스펙 §1 은 "모든 PR 이 끝나면 확인용 앱 `%TEMP%\aksv` 를 가짜 서버 대신 실제 서버 + Docker MariaDB 에 붙여 체크리스트 1 · 2장 중 서버가 관여하는 항목을 다시 본다(범위는 그때 정한다)" 고 적었다. 이 문서가 그 범위와 방법을 정한다. 코드를 바꾸는 PR 이 아니라 확인 작업이다 — 저장소에 남는 것은 결과 기록 · 확인 중 고친 코드 · HANDOFF 뿐이다.

## 1. 목표

admin-server 첫 발행(`private` 해제) 전 마지막 관문. 브랜치 `chore/aksv-real-server`. 끝 상태:

- **확인용 앱(aksv)이 실서버(akss)에 붙어 돈다** — 가짜 axios 어댑터 없이 admin-ui 0.4.0(npm) 클라이언트가 Vite 프록시를 지나 admin-server 0.4.0(로컬 pack) + MariaDB 에 닿는다.
- **범위 안 62 항목이 판정된다** — 통과 · 실패 · 해당 없음과 근거가 체크리스트 3장(실서버) HTML 에 구워져 저장소에 커밋된다(§9).
- **결함이 처리된다** — 작은 것은 이 브랜치에서 고치고(§9-3), 큰 것은 기록해 별도로 넘긴다. B층(앱 페이지) 마찰은 템플릿 메모로 따로 남긴다.
- **HANDOFF "검증" 행이 첫 발행을 막는 것이 없음(또는 무엇이 막는지)을 말한다.**

검증되는 계약은 **admin-ui 클라이언트 · 컴포저블과 admin-shared 스키마 ↔ admin-server 실응답**이다. admin-ui 는 엔드포인트를 하드코딩하지 않으므로(`refreshPath` 기본값 `/auth/refresh` · `noRetryPaths` 뿐) 경로는 앱(B) 몫이고, 패키지가 책임지는 것은 쿠키 · 401 → 갱신 → 재시도 · 봉투 해석 · bigint 코덱 · 쿼리 직렬화 · 오류 코드 → 화면 처리다.

## 2. 결정

### 2-1. 경계 결정 (2026-10-16, 브레인스토밍 — 모두 권장안)

| #           | 확정                                                                                                                                                                                                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① 범위      | **S+F+R** — 1 · 2장의 서버 관여 항목(S) + 가짜 스위치 항목(F)의 실서버판 + admin-ui 화면이 있는 실서버 전용 항목(세션 끊김 · 잠김 · 임시 비밀번호 → 강제 변경 · IpBlockedDialog · 약관 발행 · 쿠키 · 회전) + 1장 재확인 P6 · P9 · G4. admin-ui 화면이 없는 것(IP 규칙 관리 · 감사 화면 · 재입사 이력)은 akss 스모크가 API 로 이미 봤으니 화면을 만들지 않는다 |
| ② 연결      | **Vite dev proxy** — aksv `baseURL '/api/admin'`, Vite 가 `/api` → `127.0.0.1:4100`. 같은 출처라 쿠키가 그대로이고 운영(리버스 프록시 뒤 같은 출처) 모양과 같다. akss 는 `clientIp: 'x-real-ip'`, 프록시가 X-Real-IP 를 붙인다(nginx 역할)                                                                                                                    |
| ③ 패키지    | **npm 0.4.0 + 로컬 pack admin-server** — admin-shared · admin-ui 는 npm 0.4.0(2026-10-16 공개, provenance), admin-server 는 main `8673f53` 에서 pack 한 0.4.0 tarball. 첫 발행 뒤 쓰는 쪽이 설치할 조합 그대로                                                                                                                                                |
| ④ 확인 방식 | **Claude 먼저, 사람은 눈으로만** — 기계가 판정할 수 있는 것(응답 · 상태 코드 · URL · 문구 · 쿠키 · 요청 수 · 감사 행)은 Claude 가 claude-in-chrome + 보조 스크립트로 보고 기록한다. '다른 관리자'는 브라우저 쿠키를 나눠 쓰지 않도록 Node 쪽이 따로 로그인한다(§7). 한글 조합 · 클립보드 · 드래그 감각 · 키보드 포커스는 사람이 본다                          |
| ⑤ 결함      | **크기별** — 작은 결함(한두 파일 · 설계 판단 없음)은 이 브랜치에서 TDD 로 고친다(§9-3). 설계 판단이 필요한 결함은 기록만 하고 별도 브랜치 · superpowers 흐름으로                                                                                                                                                                                              |
| ⑥ 접근      | **A — 생성기를 실서버판으로** — 지난 `make-app.mjs` 의 가짜 어댑터 · `fake-server.ts` · `fake-data.ts` 를 걷어내고 페이지를 실서버 모양에 맞춘다. 화면 · 항목 ID 가 이어지고 B층 페이지가 실제 계약대로 짜여 템플릿 `preset/admin` 의 예행연습이 된다. 변환 어댑터(B)는 B층 계약 차이를 가려 버렸고, 새 앱(C)은 체크리스트와 끊긴다                           |

### 2-2. 공통 결정 (이의 없음)

1. **앱 · 서버는 저장소 밖.** `%TEMP%\aksv` · `%TEMP%\akss`(짧은 경로 — Windows 긴 경로 os error 3)에 포그라운드 명령으로 만든다. 생성기는 세션 스크래치패드에 둔다. 저장소에는 결과 기록 · 고친 코드 · HANDOFF 만.
2. **DB 는 새로 만들고 지운다.** `admin-kit-test-db`(33306)에 DB `aksv` 를 만들고 끝나면 `DROP DATABASE`. `pnpm test:db` 와 겹쳐 돌리지 않는다. `DB_SSL=true` 로 붙는다(2f-2b 가 잰 경로).
3. **가짜를 남기지 않는다.** 실험 패널의 스위치는 모두 실서버에서 실제로 일어나는 일(다른 관리자의 쓰기 · 프록시 헤더 · 서버 인터셉터)로 바꾼다. 실서버로 일으킬 수 없는 갈래는 '해당 없음' 으로 적는다.
4. **push · 발행은 사람.** 서브에이전트는 model 을 명시한다.

## 3. 구성

```
브라우저(사람 · claude-in-chrome)
  │  http://localhost:5199
  ▼
Vite dev 서버 (%TEMP%\aksv)
  ├─ 앱: admin-ui 0.4.0 · admin-shared 0.4.0 (npm) · baseURL '/api/admin'
  ├─ proxy  /api/*  → http://127.0.0.1:4100   (+ X-Real-IP: <실험 주소>, 기본 127.0.0.1)
  └─ 실험 미들웨어 /__lab/*  (Node — 브라우저 쿠키와 따로 노는 '다른 관리자' · 프록시 상태)
  ▼
akss (%TEMP%\akss, Nest 12, :4100, global prefix /api → 패키지 라우트 /api/admin/*)
  ├─ admin-server 0.4.0(로컬 pack) — 모듈 여덟 전부
  └─ LabModule — @Public /api/lab/next · 전역 인터셉터, @SelfOnly /api/lab/reauth
  ▼
MariaDB admin-kit-test-db :33306 — DB aksv, DB_SSL=true
```

- 포트: aksv 5199(지난 확인과 같음), akss 4100(akss 스모크와 같음). 쓰이고 있으면 둘 다 한 곳에서 바꾼다.
- 생성기: `make-app.mjs`(실서버판) · `make-server.mjs`(새로) · 시드 스크립트는 세션 스크래치패드에. 지난 재료 원본은 `scratchpad/prev/` 에 복사해 두었다(이전 세션 스크래치패드가 %TEMP% 정리로 사라질 수 있다).

## 4. akss

2f-2b 의 akss 레시피(스텁 12 · kysely-ctl · `TZ=UTC` · `skipLibCheck: false` · `@types/express`)를 따른다. 달라지는 것:

| 항목          | 내용                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 의존성        | `@ssworks/admin-shared` 는 npm `0.4.0`, `@ssworks/admin-server` 는 `file:./ssworks-admin-server-0.4.0.tgz`                                                                                                                                                                                                                                                                                                                    |
| 모듈          | `AdminServerModule.forRootAsync` + Auth · Audit · Sessions · Roles · Users · Teams · Legal · IpAccess 여덟 전부 + `LabModule`(쓰는 쪽 B)                                                                                                                                                                                                                                                                                      |
| 권한 카탈로그 | aksv 와 **같은 파일**(§5-3) — 생성기가 양쪽에 쓴다. 슬롯 맵은 §5-3                                                                                                                                                                                                                                                                                                                                                            |
| 옵션          | `clientIp: 'x-real-ip'` · `legal: { kinds: ['TERMS', 'PRIVACY'] }` · `timeZone` 기본(Asia/Seoul) · `reauth: env AKSS_REAUTH === 'true'`(기본 끔) · `auth.accessTtlMs: env AKSS_ACCESS_TTL_MS`(없으면 패키지 기본 15분, 있으면 `refreshGraceMs` 5초 함께)                                                                                                                                                                      |
| LabModule     | `POST /api/lab/next {status?: 500 \| 403, delayMs?, shuffle?: boolean, count?}` — @Public. 전역 인터셉터가 다음 `/api/admin/*` 요청(들)에 지연 · 예외를 건다. 예외는 Nest `HttpException` 이라 패키지 예외 필터를 지나 실제 봉투가 된다. `POST /api/lab/reauth {currentPassword}` — `@SelfOnly`, `getAdminPrincipal(req)` + `AdminReauthService.verify` 로 검증(1-P6 시연용, 쓰는 쪽이 재인증 서비스를 쓰는 모양도 함께 확인) |
| DB            | `.env` `DB_NAME=aksv` · `DB_SSL=true`, 나머지는 akss 스모크와 같다                                                                                                                                                                                                                                                                                                                                                            |

재기동이 필요한 두 단계: **재인증 단계**(`AKSS_REAUTH=true` — 1-L10 · 2-R13)와 **진짜 만료 단계**(`AKSS_ACCESS_TTL_MS=20000` — X10). 세션은 DB 에 있으니 재기동해도 로그인이 남는다.

## 5. 시드

### 5-1. 원칙

앞문(API)으로 만들 수 있는 것은 API 로 만든다 — closure · 재직 이력 · 팀 소속 · revision 이 실서버가 쓰는 그대로 맞고 감사 행도 쌓인다. 순서 값의 빈 번호 · 2^53 을 넘는 번호처럼 API 가 못 만드는 모양만 DB 에 직접 넣는다. 데이터 모양은 가짜 시드(`fake-data.ts`)와 같게 해서 체크리스트 기대값(팀 인원 수 · user013 · 검색어 "김")이 대부분 살아남게 한다. 다른 값은 실서버 값으로 기대를 다시 적는다.

### 5-2. 내용

| 대상        | 방법                                                                                                           | 모양                                                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 역할 5      | DB 직접 — 순서 값 0 · 5 · 9 · 12 · 20                                                                          | 최고 관리자 `*` · 운영 관리자 · 조회 전용(기본) · 권한 없음 · 고객 지원. 권한은 가짜 시드와 같다                                     |
| 팀 20       | DB 직접 — teams + closure(+ 장이 요구하는 가드 행), 순서 값 빈 번호 · 넣는 순서 뒤섞기                         | 본사 → 본부 → 팀 3단 · 해외법인(일본 · 미국) · 보안팀 · 외부 협력사 — 가짜 시드의 `TEAM` 번호 그대로                                 |
| `admin`     | DB 직접(`hashPassword`) · `userNo = 9007199254740993`(2^53+1) → 그 뒤 `users` 의 `AUTO_INCREMENT` 를 그 위로   | 김관리 · 최고 관리자 · 경영지원본부 · 입사 2019-01-02. 브라우저 주 계정. 이후 번호가 모두 2^53 을 넘는다                             |
| `other`     | DB 직접                                                                                                        | 두 번째 `*` 관리자 — 실험 미들웨어의 '다른 관리자'. 전권자 잔존 판정이 admin 을 붙잡지 않게 한다                                     |
| user001~200 | **API** `POST /admin/users`(팀 · 역할 · 입사일) → 17의 배수는 `POST /admin/users/:no/resign`(과거 날짜)        | 이름 · 팀 배분 · 역할(9의 배수 운영 관리자, 나머지 조회 전용) · 입사일이 가짜 시드와 같다. 임시 비밀번호는 세션 시드에만 쓰고 버린다 |
| 세션 ~47    | **API** 로그인 — User-Agent · X-Real-IP 헤더를 바꿔 가며. admin 4(iPhone · Samsung · Whale · 없음) + 사용자 42 | 기기 · IP 가 다양한 실제 세션. 시각을 흩어야 하면 `lastAccessAt` 만 DB 로                                                            |
| IP 규칙     | 장 0012 의 global 허용 둘 그대로                                                                               | —                                                                                                                                    |
| 약관        | 없음                                                                                                           | 첫 발행부터 확인 항목(X5)                                                                                                            |

시드는 쓰는 쪽(B) 스크립트다. DB 직접 쓰기는 위 표의 것만 하고, 넣은 뒤 API 로 읽어 모양을 확인한다(트리 · 역할 목록 · `/auth/me`).

### 5-3. 권한 카탈로그와 슬롯

지난 aksv 카탈로그 12개를 그대로 두고 서버 슬롯에 필요한 다섯을 더한다 — `settings.legal:read` · `settings.legal:publish` · `settings.ipAccess:read` · `settings.ipAccess:write` · `settings.auditLog:read`. `implies` 는 write → read(사용자 · 역할 · 팀 · 세션 · 사이트 · IP), publish → read(약관).

| 슬롯                                | 키                                                   |
| ----------------------------------- | ---------------------------------------------------- |
| `users.read` · `users.manage`       | `org.users:read` · `org.users:write`                 |
| `roles.read` · `roles.manage`       | `org.roles:read` · `org.roles:write`                 |
| `teams.read` · `teams.manage`       | `org.teams:read` · `org.teams:write`                 |
| `sessions.read` · `sessions.manage` | `sessions:read` · `sessions:write`                   |
| `legal.read` · `legal.publish`      | `settings.legal:read` · `settings.legal:publish`     |
| `ipAccess.read` · `ipAccess.manage` | `settings.ipAccess:read` · `settings.ipAccess:write` |
| `auditLogs.read`                    | `settings.auditLog:read`                             |

`org.users:delete` · `settings.site:*` · `settings.security:read` 는 서버 라우트가 없는 앱 전용 키로 남는다.

## 6. aksv 바꾸기

### 6-1. 클라이언트 · 요청 기록

`src/api/client.ts` 에서 `client.axios.defaults.adapter = fakeAdapter` 를 지우고 `baseURL: '/api/admin'`. `refreshPath` · `noRetryPaths` 는 킷 기본값. 요청 기록은 `client.axios` 인터셉터로 남긴다 — 방법 · 경로(쿼리 포함) · 상태 · ms · `code`, 갱신 요청과 재시도 요청을 표시한다. 실험 패널의 요청 기록 표가 이것을 보여 준다. `/__lab/*` 호출은 킷 클라이언트를 거치지 않으니 기록에 섞이지 않는다.

### 6-2. 페이지

| 페이지                           | 바꾸는 것                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 사용자 목록                      | 행 = `AdminUser`(roleName · teamName 포함). 상태는 `resignAt` 에서 셈한다(재직 · 퇴사 예정 · 퇴사). 서버 필터 `keyword` · `teamNo` · `recursive` · `status`, 정렬 열 `userId` · `userName` · `joinAt` · `resignAt` · `createAt` · `updateAt`(서버 기본 `createAt` — 화면 기본 정렬은 페이지가 정한다). URL 키(`q` 등)는 페이지 코덱이 서버 필터로 옮긴다. 퇴사는 `resignDate` 를 묻는 확인 대화상자 |
| 사용자 편집                      | 단건 `{item}`. 만들기에 역할 선택(`roleNo` 필수) · 입사일, 성공하면 `TemporaryPasswordDialog` 로 임시 비밀번호. 수정 본문 `revision` · `userName` · `roleNo` · `teamNo` · `joinDate`. 아이디 중복 409 `ERR_DUPLICATE_USER_ID` 를 아이디 칸 오류로 보이게 한다(`useWriteFlow` `fields`)                                                                                                              |
| 팀                               | 인원 목록 `/teams/members` → `/users?filter[teamNo]&filter[recursive]&filter[keyword]`. `fake-data` 의 `TEAM` import 를 지운다                                                                                                                                                                                                                                                                      |
| 역할 · 세션 · 내 계정 · 비밀번호 | 경로가 이미 같다. 응답 래퍼(`{item}`) · 반환값만 맞춘다. 역할 화면 재인증 토글은 akss `AKSS_REAUTH` 와 한 벌                                                                                                                                                                                                                                                                                        |
| 홈(P6 시연)                      | `/demo/reauth` → akss `POST /api/lab/reauth`. 킷 클라이언트로 부른다 — `baseURL` 밖 경로라 요청별 지정이 필요하다(방법은 플랜, §11)                                                                                                                                                                                                                                                                 |
| **새 페이지: 설정 → 약관**       | `LegalDocumentEditor` + `useLegalDocuments`(`loadCurrent` · `loadHistory` · `loadOne` · `publish`, 종류 TERMS · PRIVACY). 메뉴 · 라우트 · 권한(`settings.legal:read` · `:publish`)                                                                                                                                                                                                                  |
| 지울 것                          | `fake-server.ts` · `fake-data.ts` · `/demo/ping`(동시 요청은 실제 `/auth/me` ×3) · 실험 상태의 가짜 스위치                                                                                                                                                                                                                                                                                          |

B층 마찰(페이지를 실서버 모양으로 옮기며 걸린 것 — 예: 상태를 `resignAt` 에서 셈해야 함, 인원 목록이 사용자 목록 필터로 바뀜)은 "템플릿 메모" 로 모은다(§9-2).

### 6-3. 실험 패널 (실서버판)

| 묶음        | 컨트롤                                                                                                                                          | 실제로 일어나는 일                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 보기        | 테마 · 메뉴 그룹 · 요청 기록 표                                                                                                                 | (그대로)                                                                                                                   |
| 권한        | 프리셋 전권 · 제한 · 읽기 · 없음                                                                                                                | other 가 admin 의 역할을 바꾸고(최고 관리자 · 운영 관리자 · 조회 전용 · 권한 없음), 패널이 앱 스토어 `refresh()` 를 부른다 |
| 다음 요청   | 지연 0 · 0.7초 · 3초 · 뒤섞기, 실패 500 · 403                                                                                                   | akss LabModule                                                                                                             |
| 인증        | 액세스 토큰 만료                                                                                                                                | 프록시가 다음 `/auth/refresh` 응답까지 요청의 `admin_at` 쿠키를 뺀다(쿠키가 만료된 브라우저와 같다)                        |
|             | 내 세션 끊기 · 옛 refresh 재사용 · 쿠키 보기                                                                                                    | other 의 `DELETE /sessions/user/{admin}` · 미들웨어가 붙잡아 둔 직전 `admin_rt` 로 갱신 · 프록시가 본 마지막 Set-Cookie    |
|             | 동시 요청 3개                                                                                                                                   | 킷 클라이언트로 `GET /auth/me` ×3                                                                                          |
| IP          | 내 주소 127.0.0.1 ↔ 203.0.113.9 · 막는 규칙 켜기 · 끄기                                                                                         | 프록시 X-Real-IP · other 가 admin 사용자 규칙(127.0.0.0/8 만 허용)을 만들거나 지운다                                       |
| 다른 관리자 | 사용자 수정 · 역할 수정(revision 올리기) · 사용자 비밀번호 초기화(임시 비밀번호 표시) · 잠금 해제 · 약관 발행 · 팀 IP 규칙 · 시드 역할 되돌리기 | other 가 실서버 API 로                                                                                                     |

## 7. 실험 미들웨어 `/__lab/*`

Vite 플러그인(`configureServer`)이 단다. 상태(실험 주소 · 토큰 빼기 플래그 · 마지막 Set-Cookie · 직전 `admin_rt`)는 Vite 프로세스 메모리에 둔다. other 의 쿠키는 미들웨어가 따로 들고(로그인 · 회전), 401 이면 다시 로그인한다. 모든 응답은 `{ ok, status, body }` 로 패널에 그대로 보여 준다 — 실패를 숨기지 않는다.

| 경로                         | 하는 일                                                                                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /__lab/state`           | 실험 주소 · 토큰 빼기 플래그 · 마지막 Set-Cookie(속성 포함) · 직전 refresh 보유 여부                                                                                               |
| `POST /__lab/ip`             | 프록시가 붙일 X-Real-IP                                                                                                                                                            |
| `POST /__lab/expire-access`  | 다음 갱신까지 `admin_at` 빼기                                                                                                                                                      |
| `POST /__lab/replay-refresh` | 직전 `admin_rt` 로 `POST /api/admin/auth/refresh`(재사용 탐지)                                                                                                                     |
| `POST /__lab/next`           | akss `/api/lab/next` 로 넘김                                                                                                                                                       |
| `POST /__lab/other/:action`  | other 로 실서버 API — `role-preset` · `bump-user` · `bump-role` · `reset-password` · `unlock` · `revoke-sessions` · `ip-rule` · `team-ip-rule` · `publish-legal` · `restore-roles` |
| `GET /__lab/audit?…`         | other 로 `/api/admin/audit-logs` 를 읽어 보여 준다(X11 판정용)                                                                                                                     |

## 8. 체크리스트 3장 — 범위 안 62 항목

1 · 2장에서 47(1장 21 · 2장 26) + 1장 재확인 3 + 새 항목 12. ID 는 원래 장 · ID 를 잇고(`1-L12`), 새 항목은 `X`. 누가: C = Claude, H = 사람, C+H = 함께. 원래 항목의 방법 · 기대는 `items.mjs` 가 정본이고, 아래 "일으키는 법 · 기대 바뀜" 만 다르다. 플랜이 항목마다 방법 · 기대를 실서버 값으로 다시 쓴다.

| ID    | 항목                          | 실서버에서 일으키는 법                                                 | 기대 바뀜 · 보탬                                                          | 누가 |
| ----- | ----------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---- |
| 1-S3  | 메뉴 권한 필터                | 프리셋(other 가 역할 변경) + 스토어 refresh()                          | "새로고침 없이" 는 refresh() 뒤. 서버는 다음 요청부터 새 권한             | C    |
| 1-S4  | 앱바 사용자 메뉴 · 로그아웃   | 실제 `/auth/me`                                                        |                                                                           | C    |
| 1-S5  | 미인증 → 로그인 → 원래 주소   | 그대로                                                                 |                                                                           | C    |
| 1-S6  | 권한 없음 → /403              | 프리셋 읽기                                                            |                                                                           | C    |
| 1-S9  | 401 → 갱신 한 번 → 재시도     | 액세스 토큰 만료(프록시) · 동시 요청 3개                               |                                                                           | C    |
| 1-S10 | 갱신도 실패 → 로그인          | 내 세션 끊기(other)                                                    |                                                                           | C    |
| 1-S11 | 전역 토스트와 처리됨          | 다음 요청 500 · 403(akss) · 재인증 틀림                                | 500 문구는 서버가 가린 문구                                               | C    |
| 1-S12 | IpBlockedDialog               | 막는 규칙 켜기 + 내 주소 203.0.113.9                                   | 막힌 주소의 로그인은 대화상자가 아니라 같은 401 문구(2f-2a 결정)          | C    |
| X1    | 쿠키 속성                     | 쿠키 보기                                                              | `admin_at` · `admin_rt` httpOnly · SameSite · Path, http 라 Secure 없음   | C    |
| X2    | 회전 · 재사용 탐지            | 유예 30초 뒤 옛 refresh 재사용                                         | 세션이 끊기고 브라우저의 다음 갱신이 실패해 로그인으로                    | C    |
| X3    | 로그인 잠김                   | user001 틀린 비밀번호 5회 → 맞는 비밀번호 → 잠금 해제(other) → 로그인  | 잠긴 동안 맞는 비밀번호도 같은 401 문구(2b R7)                            | C    |
| X10   | 진짜 만료                     | `AKSS_ACCESS_TTL_MS=20000` 재기동 → S9 한 번 더                        |                                                                           | C    |
| 1-P8  | 표 바닥글 · 정렬 라벨         | 실제 데이터                                                            | 기본 정렬 열은 서버 허용 목록 안에서                                      | C    |
| 1-L1  | URL ↔ 목록 상태               | 요청 기록에서 `page` · `itemsPerPage` · `sortBy[]` · `filter[keyword]` |                                                                           | C    |
| 1-L2  | 새로고침 복원                 | 그대로                                                                 |                                                                           | C    |
| 1-L3  | 다녀와 복원 · 초기화          | 그대로                                                                 |                                                                           | C    |
| 1-L4  | 한글 검색어                   | 서버 검색은 C, 조합 중 Enter 는 H                                      |                                                                           | C+H  |
| 1-L5  | 늦은 응답을 버림              | 지연 뒤섞기(akss)                                                      |                                                                           | C    |
| 1-L6  | 정렬 세 번째 클릭             | 그대로                                                                 |                                                                           | C    |
| 1-L7  | 조회 실패에도 쪽 유지         | 다음 요청 500                                                          |                                                                           | C    |
| 1-L8  | EmptyState                    | 검색 0건                                                               | "데이터 0건" 갈래는 해당 없음                                             | C    |
| 1-L9  | 확인 관문 · 이중 클릭         | 지연 3초 + 퇴사(퇴사일 대화상자)                                       | 퇴사가 날짜를 묻는다                                                      | C    |
| 1-L10 | 재인증 관문                   | 재인증 단계에서 비밀번호 초기화                                        |                                                                           | C    |
| 1-L11 | 필드 오류                     | 아이디 user001 → 409 `ERR_DUPLICATE_USER_ID`                           | 아이디 칸 오류인지가 핵심. "폼 밖 키" 갈래는 일으킬 길이 없으면 해당 없음 | C    |
| 1-L12 | revision 충돌                 | 다른 관리자 사용자 수정                                                |                                                                           | C    |
| X8    | bigint 실물                   | admin userNo 2^53+1 — 표 · 주소 · 편집 저장                            |                                                                           | C    |
| 2-R3  | 권한별 설정 메뉴              | 프리셋 넷                                                              |                                                                           | C    |
| 2-R8  | 권한 상승 방지                | 프리셋 제한 → 넓은 역할의 이름만 고쳐 저장도                           | 화면은 허용 — 서버가 같은 판정인지 처음 본다(어긋나면 결함 후보)          | C    |
| 2-R9  | 순서 이동                     | 그대로                                                                 |                                                                           | C    |
| 2-R10 | 역할 revision 충돌            | 다른 관리자 역할 수정                                                  |                                                                           | C    |
| 2-R11 | 저장 버튼 상태                | 지연 3초                                                               |                                                                           | C    |
| 2-R12 | 내 역할 저장 → 권한 즉시      | 프리셋 제한 → 운영 관리자 역할 읽기 끄기 → 끝나면 시드 역할 되돌리기   |                                                                           | C    |
| 2-R13 | 재인증 옵션                   | 재인증 단계 + 화면 토글                                                |                                                                           | C    |
| 2-R14 | 역할 삭제                     | 고객 지원 · 조회 전용(쓰는 계정 있음)                                  |                                                                           | C    |
| 2-C1  | 기기 문구                     | 시드 로그인의 User-Agent                                               |                                                                           | C    |
| 2-C2  | 지금 세션은 끝내기 없음       | 그대로                                                                 |                                                                           | C    |
| 2-C3  | 다른 세션 모두 끝내기         | 그대로                                                                 |                                                                           | C    |
| 2-C4  | 전체 세션 목록                | 그대로                                                                 |                                                                           | C    |
| 2-C5  | 내 계정 전체 끊기             | 그대로                                                                 |                                                                           | C    |
| 2-C7  | 임시 비밀번호 실제 복사       | 값은 실서버, 붙여 넣기는 H                                             | 16자(`TEMPORARY_PASSWORD_LENGTH`)                                         | C+H  |
| 2-C12 | 틀린 현재 비밀번호            | 실서버 400 details → 현재 칸                                           |                                                                           | C    |
| 2-C13 | 이중 제출                     | 지연 3초                                                               |                                                                           | C    |
| 2-C14 | 강제 변경 흐름                | other 가 user001 초기화 → 임시 비밀번호로 로그인                       | 스위치 대신 진짜 임시 비밀번호 로그인                                     | C    |
| 2-T1  | 드래그 · 같은 상위 팀         | C 가 끌어 보고 안 되면 H                                               |                                                                           | C+H  |
| 2-T2  | 드래그 · 다른 상위 팀         | 같음                                                                   |                                                                           | C+H  |
| 2-T3  | 드래그 실패 원위치            | 다음 요청 500 + 끌어 놓기                                              |                                                                           | C+H  |
| 2-T5  | ↑↓ 버튼과 포커스              | 그대로                                                                 |                                                                           | C    |
| 2-T9  | 입력칸 오류                   | "인사팀" → 409                                                         |                                                                           | C    |
| 2-T13 | 팀 삭제                       | 해외법인(하위 둘) · 영업1팀(인원 있음 409)                             |                                                                           | C    |
| 2-T14 | 인원 저절로 다음 쪽           | `/users` 필터로                                                        | 인원 수 · 쪽 경계는 실서버 값                                             | C    |
| 2-T15 | ID 검색 · 하위 팀 포함        | "user13" · 하위 팀 포함                                                | 수는 서버 keyword 규칙(아이디 · 이름 부분일치)으로                        | C    |
| 2-T16 | 다음 쪽 실패 · 403 팀         | 다음 요청 500 · 403                                                    | 가짜의 "보안팀" 대신 다음 요청 403                                        | C    |
| X4    | 팀 삭제와 IP 규칙             | 팀 IP 규칙(other) → 그 팀 삭제                                         | 409 `ERR_TEAM_HAS_IP_RULES` 서버 문구 토스트                              | C    |
| X5    | 약관 첫 발행                  | TERMS 현재본 없음 → 발행 → 시행본 · 이력 · 단건                        | 편집기 겉모습은 H 가 한 번                                                | C+H  |
| X6    | 같은 본문 409                 | 그대로 다시 발행                                                       |                                                                           | C    |
| X7    | 기준 판 충돌                  | 편집 중 다른 관리자 약관 발행 → 내 발행                                |                                                                           | C    |
| X9    | 오류 봉투                     | 요청 기록의 모든 비 2xx                                                | 모두 `{success:false, code, message}`, 500 은 문구를 가린다               | C    |
| X11   | 감사 행                       | 쓰기마다 `/__lab/audit`                                                | 한 쓰기에 한 행 · 행위자 admin/other · 임시 비밀번호 · 약관 본문 없음     | C    |
| X12   | 콘솔                          | 실행 내내(1 · 2장 G5 대신)                                             | Vue 경고 · 예외 0, 네트워크 오류 줄은 의도한 4xx · 5xx 뿐                 | C    |
| 1-P6  | ReauthDialog 오류 · 입력      | `/api/lab/reauth`                                                      |                                                                           | C    |
| 1-P9  | 토스트 표시 시간              | 스크립트로 잰다                                                        |                                                                           | C    |
| 1-G4  | 오버레이 포커스 가두기 · 복귀 | 키보드는 H, `activeElement` 측정은 C                                   |                                                                           | C+H  |

범위 밖 47(클라이언트만 — 가짜 서버로 이미 확인): 1장 G1–G3 · G5 · G6 · P1–P5 · P7 · P10 · S1 · S2 · S7 · S8 · S13–S15 · L13, 2장 G1–G6 · R1 · R2 · R4–R7 · C6 · C8–C11 · C15 · T4 · T6–T8 · T10–T12 · T17 · T18.

## 9. 결과 기록 · 결함 처리

### 9-1. 체크리스트 3장

- 지난 생성기(`items.mjs` · `gen.mjs`)로 "3장 · 실서버" 한 장을 만든다. 각 항목에 누가(C · H · C+H) · 판정 · 메모 · 근거(요청 기록 줄 · 감사 행 · 스크린샷 이름)를 둔다.
- Claude 의 판정은 `results.json` 에 쌓고 생성기가 HTML 에 구워 넣는다. 사람 판정은 페이지의 판정 버튼으로 하고 "기록 복사" 글을 Claude 가 `results.json` 에 합친다.
- 결과를 구워 넣은 정적 HTML 을 `docs/verification/2026-10-16-real-server-check.html` 로 커밋한다. 앱 소스는 싣지 않는다. 맨 앞에 환경(패키지 버전 · 커밋 · DB · 브라우저)과 요약 수치를 둔다.

### 9-2. 템플릿 메모

페이지를 실서버 모양으로 옮기며 걸린 B층 마찰은 같은 HTML 의 "템플릿 메모" 절과 HANDOFF 에 적는다 — 템플릿 `preset/admin` 작업의 입력이다. 패키지 결함과 따로 센다.

### 9-3. 결함

- **판정**: 실패 항목마다 원인이 어느 층인지 적는다 — 패키지(admin-shared · admin-ui · admin-server) · 앱(B) · 확인 장치(생성기 · 미들웨어). 앱 · 장치 문제는 고치고 다시 본다(결함으로 세지 않는다).
- **작은 패키지 결함**: superpowers:systematic-debugging → TDD 로 이 브랜치에서 고친다. `pnpm check`(+ admin-server 면 `pnpm test:db`) 초록.
  - admin-server 만 바뀌면 changeset 없이 첫 발행 0.4.0 에 싣고 `packages/admin-server/CHANGELOG.md` 0.4.0 항목에 한 줄 보탠다(미발행이라 0.4.0 을 다시 정의해도 소비자가 없다).
  - admin-shared · admin-ui 가 바뀌면 changeset patch — `fixed` 라 세 패키지가 0.4.1 이 되고 admin-server 첫 발행도 0.4.1 이 된다.
  - 고친 뒤 tarball 을 다시 pack 해 바꿔 끼우고 해당 항목을 다시 본다(admin-shared · admin-ui 수정은 로컬 tarball 로 확인).
- **큰 결함**(설계 판단 · 여러 모듈): 재현 · 근거만 기록하고 HANDOFF 에 넘긴다. 첫 발행을 막는지 함께 적는다.

## 10. 실행 순서

1. 준비 — admin-server pack(main `8673f53`) · akss 생성 · 설치 · `tsc` · DB `aksv` · migrate · 시드 · 기동 · aksv 생성 · 설치 · `vue-tsc` · Vite 기동 · 실험 미들웨어 동작 확인.
2. 체크리스트 3장 생성(항목 방법 · 기대를 실서버 값으로).
3. Claude 판정 — 묶음 순서: 셸 · 인증 → 목록 · 쓰기 → 역할 · 세션 · 팀 → 약관 → 재인증 단계(재기동) → 진짜 만료 단계(재기동) → 횡단(X9 · X11 · X12) · 재확인.
4. 결함 처리(§9-3) — 고친 것은 다시 판정.
5. 사람 판정 — C+H · H 항목과 마지막 동선(로그인 → 사용자 편집 → 역할 저장 → 약관 발행)을 눈으로.
6. 결과 HTML · HANDOFF "검증" 행 · 진행표(CLAUDE.md · `docs/01-phase0.md` §8) 커밋. akss · Vite 종료, `DROP DATABASE aksv`.

## 11. 플랜에서 먼저 확인할 위험

- **재인증 본문 파이프** — `reauth` 가 꺼졌을 때 `UserReauthBodyPipe` 가 `currentPassword` 를 무시하는지 거부하는지. 거부면 aksv 의 비밀번호 초기화 · 잠금 해제가 단계에 따라 본문을 바꿔야 한다.
- **`AdminReauthService` 주입** — 쓰는 쪽 모듈(LabModule)에서 주입되는지(`AdminAuthModule` 이 전역 export 하는지). 안 되면 P6 시연 라우트를 다른 실제 재인증 라우트로 바꾼다.
- **P6 경로** — 킷 클라이언트(`baseURL '/api/admin'`) 밖의 `/api/lab/reauth` 를 같은 클라이언트로 부를지(axios `baseURL` 덮어쓰기), 그러면 401 갱신 · 봉투 해석도 그대로 탄다.
- **프록시와 쿠키** — Vite 프록시가 Set-Cookie 를 그대로 넘기는지(도메인 · 경로 재작성 없음), refresh 쿠키 `Path` 가 `/api/admin/auth` 류일 때 같은 출처에서 맞는지, 미들웨어가 응답 Set-Cookie 를 읽을 수 있는지(`proxyRes`).
- **IP 규칙 의미** — 사용자 층 규칙이 그 사용자의 허용 목록으로 global 을 덮는지(akss 스모크가 staff 를 이렇게 막았다), 자기 잠금 409 가 other 에게만 걸리는지.
- **역할 · 팀 직접 쓰기** — 역할 `permissions` 저장 형식(정규화 · JSON), teams 의 closure · 장 0010 가드 행, users `AUTO_INCREMENT` 를 2^53 위로 올려도 kysely 가 bigint 로 읽는지.
- **2-R8** — 이름만 바꾸는 쓰기의 서버 판정(`judgeAccountCommand`)이 화면 안내와 같은지.
- **claude-in-chrome** — 연결 여부, he-tree 드래그를 `left_click_drag` 로 낼 수 있는지(안 되면 T1–T3 은 H), 콘솔 · 네트워크 읽기 범위.
- **시드 시간** — API 로 사용자 200 · 로그인 47(argon2)이 몇 분 안에 끝나는지.

## 12. 비범위

- IP 규칙 관리 · 감사 · 재입사 이력 · 잠금 해제 화면(① — admin-ui 컴포넌트 없음).
- 클라이언트만 보는 47 항목(§8 끝).
- admin-server 첫 발행 자체(`private` 해제 · 로컬 2FA · Trusted Publisher 등록) — 이 확인 뒤 사람이 한다.
- `scripts/stage-release.mjs` 가 409 "이미 스테이징됨" 을 건너뜀으로 다루기(0.4.0 Release 재실행에서 드러남) — 별도.
- 다른 브라우저(G6)는 이번에 보지 않는다.

## 13. 선행 문서 정정

- 2a 스펙 §1 "범위는 그때 정한다" — 이 문서 §2-1 ① 이 정했다. 2a 스펙 본문은 그대로 둔다(이 문서가 이어받음).

## 14. 구현 중 정정

1. 앱 경로 규약: §6-1 의 `baseURL '/api/admin'` 대신 README 「Phase 2 서버」 예제를 따라 `baseURL '/api'` · 경로 `'/admin/…'` · `refreshPath '/admin/auth/refresh'` · `noRetryPaths ['/admin/auth/login']` 로 했다. 이 과정에서 README 최소 배선과 Phase 2 예제의 어긋남이 드러나 2391d33 에서 고쳤다(발견 문서 1).
2. 생성기: `make-app.mjs` · `make-server.mjs` 는 `%TEMP%\aksv` · `akss` 작업 폴더의 스냅숏(`snapshot.mjs`)이고, 3장 생성기는 새 `gen-real.mjs`(1 · 2장 CSS 재사용)다. 판정 기록은 `record.mjs` · `results.json` · `findings.json`. 지난 생성기에 빠져 있던 `src/plugins/confirm.ts` 를 README 배선대로 채웠다.
3. 재기동 단계: 재인증(`AKSS_REAUTH=true`) · 진짜 만료(`AKSS_ACCESS_TTL_MS=20000`, 유예 5초)를 env 로 켠다.
4. 쿼리의 bigint 는 평문 숫자다. 플랜의 "쿼리에도 `BigInt(n)`" 가정이 틀렸다 — 킷 `serializeParams` 가 `String(bigint)` 로 보내고 서버 `queryBigIntSchema` 가 받는다. 시드 확인 스크립트를 그에 맞춰 고쳤다.
5. 킷 결함 하나를 이 브랜치에서 고쳤다(6a034e2 — 쿼리 boolean 을 'true' · 'false' 로, 계약 테스트, changeset patch → 0.4.1). 플랜에 없던 Task 4b 로 끼워 넣었다. README 세 곳은 Task 13a(2391d33).
6. 1-L11: 실서버는 아이디 중복을 409 가 아니라 400 검증 오류(userId 칸 details)로 낸다 — 통과(플랜의 409 전제가 틀렸다).
7. Task 8 은 판정자 컨텍스트 한도 때문에 8a(역할 · 세션 · 비밀번호 16) · 8b(팀 10)로 나눴다.
8. 도구: claude-in-chrome 이 쿼리 문자열 든 URL 꼴의 출력을 막아 요청 기록은 `?` · `&` · `=` 를 바꿔 읽었다. 자동 입력(`form_input` · type)이 Vue v-model 에 닿지 않아 네이티브 value setter + input 이벤트로 넣었다. file:// 은 열 수 없었다.
9. X9 · X12 는 묶음마다 cross.txt 근거 + 마지막 확인으로 판정했다(항목마다 기록을 지우고 새로고침이 기록을 리셋해 전 구간 일괄 필터가 불가).
10. 2-T15 의 기대 숫자(2 · 11)는 작성 오류 — 서버 부분일치대로 1 · 10. X6 은 킷이 같은 본문 발행을 미리 막아(버튼 꺼짐 + 편집기 안 안내) 서버 409 는 직접 요청으로 확인했다. 둘 다 판정 메모로 정정했다.
11. X2(재사용 탐지)가 그 사용자의 세션을 모두 끊는 것은 설계다 — 2-C1 전에 시드 세션 넷을 실제 로그인 API 로 다시 만들었다.
12. 자동 드래그는 he-tree 에 불안정하게 먹혀(2-T1 한 번 성공) 2-T2 · 2-T3 은 사람이 판정했다. 자동 드래그 때 he-tree 내부 예외('setting hidden') 8건이 콘솔에 났고, 사람 드래그에서는 재현되지 않아 X12 에 세지 않았다.
13. 결과: 62 항목 통과 62 · 실패 0 · 해당 없음 0. 다음 Version Packages PR 은 세 패키지(fixed) 모두 0.4.1 이고 admin-server 첫 발행도 0.4.1 이다. 넘긴 결함 둘은 첫 발행을 막지 않는다(HANDOFF "알려진 미확인 · 보류").
