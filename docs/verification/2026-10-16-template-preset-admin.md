# 템플릿 preset/admin 검증 기록

- 날짜: 2026-10-16
- 대상: `kim5257-project-template` `preset/admin` `9355035`(로컬 커밋 22 — push 전)
- 환경: Windows 11 · Node 24.21 · pnpm 10.33(전역 12 가 자동 전환) · Docker MariaDB 11.4(`admin-kit-test-db` 33306) · `@ssworks/admin-shared` · `admin-ui` · `admin-server` 0.4.1(npm, 정확한 핀)
- 스펙 `docs/superpowers/specs/2026-10-16-template-preset-admin-design.md` · 플랜 `docs/superpowers/plans/2026-10-16-template-preset-admin.md`

생성 앱은 짧은 `%TEMP%` 경로(`akt` · 마지막 확인 `akf`)에 포그라운드로 만들었고, 끝나고 DB(`akt` · `tpl_dev`) · 이미지(`akt-backend:verify` · `akt-nginx:verify` · `tpl-backend:dev`) · 폴더를 지웠다.

## 1. 템플릿 커밋

`git log --oneline origin/preset/db..preset/admin`(아래가 먼저):

| 커밋      | 내용                                                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `c0bbba5` | (master `bcfe24a` cherry-pick) frontend 패키지명 오류 수정 및 init 스크립트 개선                                              |
| `44c640f` | (master `c3945e7` cherry-pick) Windows 에서 init 스크립트 자기 삭제 EPERM 오류 수정                                           |
| `70d4758` | preset/admin 시작 — 루트 prepare · test 스크립트 · nestjs-zod patch 제거 · CI 테스트 단계                                     |
| `42ffcd4` | shared 관리자 카탈로그 — 권한 · 함의 · 감사 · 오류 · 약관 종류 · 비밀번호 정책 · 재인증                                       |
| `028d8e3` | backend 를 admin-server 0.4.1 로 — Nest 12 · 킷 모듈 일곱 · 코어 스텁 12 · 러너 · 헬스                                        |
| `1ea4559` | shared 를 템플릿 prettier 로 정리                                                                                             |
| `9dc16b3` | 첫 관리자 시드(seed:admin — 임시 비밀번호 · 강제 변경) · Docker 런타임을 킷에 맞춤                                            |
| `b21f7d1` | frontend 를 admin-ui 0.4.1 로 — 셸 · 가드 · 스토어 · 경로 규약 (가) · 인증 · 본인 페이지 · 라우트 테스트                      |
| `4d4a04d` | 조직 페이지 — 사용자 목록 · 추가 · 편집 · 팀 트리 · 전체 세션                                                                 |
| `996ad7f` | 설정 페이지 — 설정 셸 · 역할(권한 매트릭스) · 약관                                                                            |
| `7d37677` | admin-scaffold 스킬                                                                                                           |
| `721e8e1` | preset/admin 안내 — CLAUDE.md · README                                                                                        |
| `743941f` | fix: 개발 서버가 페이지 첫 방문마다 새로 고치던 것 — vuetify 사전 번들 제외 · 늦게 드러나는 의존 미리 묶기(검증 ① 에서 찾음) |
| `fbc06c0` | fix: shared 스키마의 zod 를 미리 묶는다 — 콜드 스타트 첫 로드 새로 고침(검증 ② 에서 찾음)                                     |
| `41e767c` | fix: admin-scaffold — 검사 순서 · 마이그레이션 통째로 · 되돌릴 수 없음 문구(검증 ② 에서 찾음)                                 |
| `eef5fab` | fix: 카탈로그 테스트 제목에서 키 개수를 뺀다(검증 ② 에서 찾음)                                                                |
| `dd58183` | fix: 예시 env 의 JWT 비밀키를 비우고 `.env.backend` 를 git 에서 뺀다(최종 리뷰)                                               |
| `5b2a999` | fix: 검색 칸 ✕ 뒤 적용이 TypeError 이던 것 — `filterText`(최종 리뷰)                                                          |
| `6f5600a` | fix: admin-scaffold — 검색 칸은 `filterText` · 재인증이 켜진 프로젝트는 서버도 확인(최종 리뷰)                                |
| `cad339e` | docs: 새 코어 장 스텁은 타임스탬프 이름 · 엣지 뒤 nginx realip · IP 켜기 import(최종 리뷰)                                    |
| `bb37000` | fix: `.gitattributes` 로 체크아웃 개행을 LF 로 — Windows autocrlf 에서 `run.sh` 가 CRLF 로 이미지에 들던 것(최종 리뷰)        |
| `9355035` | fix: 템플릿 nginx 가 게이트웨이의 `X-Forwarded-For` 마지막 값을 클라이언트 IP 로 — realip(사설 대역 출처, 사용자 결정)        |

## 2. 검증 ① — 생성 앱 `%TEMP%\akt`

`721e8e1` 을 clone → `node scripts/init.mjs akt`. 브라우저 확인 중 찾은 결함을 `743941f` 로 고치고 같은 두 파일을 A 에 넣었다.

| #   | 항목                                      | 판정 | 근거                                                                                                                                                                             |
| --- | ----------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | clone · init.mjs                          | 통과 | `초기화 완료! scope: @akt`, 커밋 하나, `scripts/` 삭제됨                                                                                                                         |
| S2  | init 결과                                 | 통과 | `git grep @project/` 0, CLAUDE.md 가 `# Project Guide` 다음 `## 구조`, 스킬 안 `@akt/` 9곳                                                                                       |
| S3  | lint · typecheck · test · build(빌드 전)  | 통과 | 넷 모두 0, 테스트 shared 6 + frontend 5, `@ssworks+admin-shared@` 한 벌                                                                                                          |
| S4  | DB · migrate · seed:admin                 | 통과 | 코어 12장, 임시 비밀번호 16자                                                                                                                                                    |
| S5  | 스모크 anon(4000 직접 · 3000 vite 프록시) | 통과 | health 200 · me 401 · users 401 · `/api/auth/me` 404                                                                                                                             |
| B1  | 미인증 `/`                                | 통과 | `/login?redirect=/`, 제목 "로그인 \| 관리자"                                                                                                                                     |
| B2  | 임시 비밀번호 로그인 → 강제 변경          | 통과 | `/password?redirect=/` 안내 → 변경 토스트 → 홈                                                                                                                                   |
| B3  | 드로어 · 앱바                             | 통과 | 홈 · 조직(사용자 · 팀 · 전체 세션) · 설정, 설정 하위는 드로어에 없음                                                                                                             |
| B4  | 설정 → 역할                               | 통과 | 설정 클릭 → `/settings/roles`, 매트릭스 6행, "조회 전용" 저장                                                                                                                    |
| B5  | 사용자 추가                               | 통과 | 임시 비밀번호 창(복사 · 한 번만 안내) → 토스트 → 목록                                                                                                                            |
| B6  | 편집 · 이탈 확인                          | 통과 | 킷 확인 창 "화면 떠나기" → 머물기(값 유지) → 저장                                                                                                                                |
| B7  | 팀                                        | 통과 | 최상위 · 하위 팀 만들기, 인원 "인원이 없습니다."                                                                                                                                 |
| B8  | 약관                                      | 통과 | 미발행 안내 → 본문 · 미리보기 → 발행 확인 → 이력 1(시행 중)                                                                                                                      |
| B9  | 내 계정 · 다른 세션 끝내기                | 통과 | 토스트 "다른 세션 1개를 끝냈습니다."                                                                                                                                             |
| B10 | 전체 세션                                 | 통과 | 검색 nobody → 빈 결과, adm → 1행                                                                                                                                                 |
| B11 | 없는 경로                                 | 통과 | `/nope` → "페이지를 찾을 수 없습니다"                                                                                                                                            |
| B12 | 좁은 역할 계정                            | 통과 | staff1 드로어 홈 · 조직(사용자 · 팀), 쓰기 버튼 꺼짐, `/settings/roles` · `/sessions` → `/403`                                                                                   |
| B13 | 토큰 갱신(JWT 비밀키 교체 뒤)             | 통과 | 401 둘 → `POST /auth/refresh` 200 한 번 → 둘 다 200                                                                                                                              |
| B14 | 콘솔                                      | 통과 | 오류 0 · 경고 0(`743941f` 뒤)                                                                                                                                                    |
| S7  | 스모크 admin · 감사 행                    | 통과 | login.success · password.change · org.role.create · org.user.create · org.user.update · org.team.create · setting.legal.publish · session.revoke.others · logout · token.refresh |
| S9  | Docker                                    | 통과 | backend · nginx 이미지 빌드, 컨테이너(4100) 스모크 anon · admin, nginx 에 `/api` 블록 1 · `/docs` 0                                                                              |

## 3. 검증 ② — admin-scaffold 스킬 시험

서브에이전트(sonnet)에게 스킬만 주고 "공지 관리 페이지(목록 · 제목 검색 · 작성 · 수정 · 삭제, 제목 · 본문 · 상단 고정, 조직 그룹 끝)" 를 시켰다. 두 바퀴.

| #     | 확인                                                                                                                                  | 1 바퀴                         | 2 바퀴 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------ |
| K1    | `permissions.ts` 키 둘 · IMPLIES · `EXPECTED_KEYS`                                                                                    | 통과                           | 통과   |
| K2    | `audit.ts` 액션 셋 · 대상 · 라벨                                                                                                      | 통과                           | 통과   |
| K3    | `notices.schema.ts` + index export, 수정 · 삭제에 revision                                                                            | 통과                           | 통과   |
| K4    | 테이블 타입 · `Database` · 장(`Kysely<unknown>` · camelCase → DB snake_case)                                                          | 통과                           | 통과   |
| K5    | `@Controller('admin/notices')` · 핸들러 다섯 `Require` · 쓰기 셋 `@Audit` · 검증 파이프 · FOR UPDATE 뒤 revision · `app.module` 등록 | 통과                           | 통과   |
| K6    | 어댑터 경로에 `/admin` 없음                                                                                                           | 통과                           | 통과   |
| K7    | 점 표기 페이지 셋 · 폼 컴포넌트 · 페이지 setup 의 `useDirtyGuard` · `#no-data` 오류 먼저                                              | 통과                           | 통과   |
| K8    | `EXPECTED_MENU` 에 `/notices` · 매트릭스 `board` 행                                                                                   | 통과                           | 통과   |
| K9    | 검사 재측정(lint · typecheck · test · build · migrate)                                                                                | 통과(서브에이전트는 한 번 막힘) | 통과   |
| N1    | admin 드로어                                                                                                                          | 통과                           | 통과   |
| N2    | 작성 → 목록 한 줄                                                                                                                     | 통과                           | 통과   |
| N3    | 제목 검색 / 빈 결과 문구                                                                                                              | 통과                           | 통과   |
| N4    | 편집 저장 · 이탈 확인                                                                                                                 | 통과                           | 통과   |
| N5    | 삭제 확인 → 사라짐                                                                                                                    | 통과(문구 중복)                | 통과   |
| N6    | staff1 — 드로어에 없음 · `/notices` → `/403` · API 403                                                                                | 통과                           | 통과   |
| N7    | 콘솔 오류 0                                                                                                                           | 통과(새로 고침 1 — 아래)       | 통과   |
| 감사  | `board.notice.create` · `update` · `delete`, 대상 `notice`, meta 는 title · isPinned 만                                               | 통과                           | 통과   |

1 바퀴에서 찾은 것과 고침:

1. **스킬 검사 순서**(서브에이전트가 막힘): `typecheck` 가 `test` 앞이면 새 `[param]` 페이지의 `useRoute('/notices.[noticeNo]')` 가 TS2345 — `typed-router.d.ts` 가 낡았다. 낡은 d.ts 로 되돌려 재 보니 `vitest run` 이 확정적으로 다시 만들고, frontend `build` 는 type-check 와 vite build 를 병렬(`run-p`)로 돌려 경합이다 → 스킬 검사를 `test` → `typecheck` 순서로(`41e767c`).
2. **스킬 장 파일**: `migrate:make` 틀(탭 · `Kysely<any>`)을 "통째로 바꿔 쓴다" 로 분명히(`41e767c`).
3. **문구 중복**: 삭제 확인 창에 "되돌릴 수 없습니다" 가 두 번(message + 킷 `reversible: false` 경고) → 스킬에 되풀이 금지(`41e767c`).
4. **템플릿 결함 — zod 늦은 발견**: shared 스키마가 zod 를 import 하면 콜드 스타트 첫 로드에 vite 가 zod 를 늦게 찾아 다시 묶고 새로 고친다(캐시 지우고 재현). `optimizeDeps.include` 에 `'<scope>/shared > zod'` → 콜드 방문 넷에 reloading 0(`fbc06c0`).

2 바퀴(위 고침 반영)에서 서브에이전트는 막힘 없이 끝냈다. 남긴 말 하나 — catalog 테스트 제목의 키 개수("열한 개")를 매번 고쳐야 한다 → 제목에서 개수를 뺐다(`eef5fab`). isPinned(tinyint) 걱정은 감사 meta 의 after(DB 에서 읽은 행)가 `true` 라 해소.

그 뒤 `eef5fab` 을 새로 clone(`%TEMP%\akf`) → init → lint · typecheck · test(6 · 5) · build 0, `@project/` 잔존 0, admin-shared 한 벌.

## 4. 최종 리뷰(opus) 와 고침

whole-branch 리뷰(템플릿 `44c640f..eef5fab` · 킷 문서 한 커밋)가 "고친 뒤 머지" 로 판정했다. 고친 것(각각 실패를 먼저 보고 고쳤다):

| 등급             | 무엇                                                                                                                                                                                     | 고침 · 확인                                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Critical         | 예시 env 의 `ADMIN_JWT_SECRET` 예시 값(54자)이 킷의 32자 검사를 통과 — DB 값만 채운 배포가 공개된 키로 뜬다(토큰 위조)                                                                   | 두 예시 모두 빈 값 + 윗줄에 만드는 명령(`dd58183`). 실제 `adminServerOptions()` 에 예시를 넣어 재 보니 전: 둘 다 기동 → 후: 둘 다 "필수 환경변수가 없다: ADMIN_JWT_SECRET"     |
| Important        | `.env.backend`(운영 비밀값, deploy.sh 가 읽음)가 `.gitignore` 밖                                                                                                                         | `.env.backend` 무시(`dd58183`) — `git check-ignore` 전 1 → 후 0, 예시 둘은 추적 유지                                                                                           |
| Important        | 검색 칸 `clearable` 의 ✕ 는 v-model 에 `null` — users · sessions 의 `.trim()` 이 ✕ 뒤 적용에서 TypeError(스킬 본보기라 생성 화면에도 번진다)                                             | `filterText` + 테스트(Vuetify ✕ → null 도 잰다, 모듈 없음 RED → 2/2), 두 화면과 스킬(`5b2a999` · `6f5600a`). frontend 테스트 5 → 7                                              |
| Important        | 킷 올리기의 "다음 번호로 스텁" — 프로젝트 장(타임스탬프)이 적용된 DB 에서 `013_…` 이 그 앞에 정렬돼 Kysely 가 "corrupted migrations" 로 멈춘다                                           | 새 코어 장 스텁은 `migrate:make admin_<장>`(템플릿 CLAUDE.md · migrations.md `cad339e`, 킷 admin-server README 한 문장). Kysely `#ensureMigrationsInOrder` · 킷 스텁 검사 소스로 확인 |
| Important        | nginx 앞에 엣지(게이트웨이 망)가 있으면 `$remote_addr` 이 엣지 주소 — 세션 · 감사 IP 가 모두 같고 IP 접근 제어 규칙이 안 맞는다                                                         | 사용자 결정으로 게이트웨이의 `X-Forwarded-For` 마지막 값을 믿는 realip 를 켰다(사설 대역 셋 · recursive 끔 — `cad339e` · `9355035`). 아래 컨테이너 시험                          |
| Important(올림)  | `ADMIN_REAUTH` 를 켜면 스킬 화면은 재인증을 묻지만 서버는 `currentPassword` 를 보지 않는다                                                                                               | 스킬에 서버 확인(`AdminReauthService.verify` 를 트랜잭션 밖에서)을 적었다(`6f5600a`)                                                                                           |
| Important(올림)  | `.gitattributes` 가 없어 Git for Windows 기본(`core.autocrlf=true`) 체크아웃에서 `run.sh` 가 CRLF — backend 컨테이너가 뜨지 않고 init 의 절 삭제가 어긋난다(리뷰는 브랜치 전부터라 뺐다) | `* text=auto eol=lf`(`bb37000`) — autocrlf=true clone 에서 CR 전 run.sh 11 · CLAUDE.md 187 → 후 0                                                                             |

`bb37000` 을 다시 새로 clone → init → lint · typecheck · test(6 · 7) · build 0, `@project/` 잔존 0.

클라이언트 IP(`9355035`) — 템플릿 nginx 를 컨테이너로 띄우고, 받은 `X-Real-IP` 를 돌려주는 가짜 backend 를 뒤에 두어 쟀다. 클라이언트는 게이트웨이 자리(사설망)와 사설이 아닌 망(`198.51.100.0/24`)에서 보냈다:

| #   | 보낸 것                                                | 고치기 전                  | 고친 뒤                                 |
| --- | ------------------------------------------------------ | -------------------------- | --------------------------------------- |
| A   | 사설망에서 `X-Forwarded-For: 203.0.113.9`(덮어쓴 꼴)   | 게이트웨이 자리 주소(사설) | `203.0.113.9`                           |
| B   | 사설망에서 `6.6.6.6, 203.0.113.9`(앞쪽 오염 + 덧붙임)  | 게이트웨이 자리 주소       | `203.0.113.9`(앞쪽 무시)                |
| C   | 사설망에서 헤더 없음                                   | 게이트웨이 자리 주소       | 게이트웨이 자리 주소                    |
| D   | 사설 밖 출처에서 `6.6.6.6`                             | 그 출처 주소               | 그 출처 주소(믿지 않는다)               |

`nginx -t` 통과. 운영(게이트웨이 → nginx → backend)에서 세션 화면의 IP 를 보는 확인은 배포 뒤에 남는다.

넘긴 Minor(후속): 스킬 목록 정렬의 동률 기준(`noticeNo` desc), 다른 자원 읽기에 기댄 화면(사용자 편집의 역할 · 팀 선택, 팀 인원 — 좁은 역할에서 빈 칸 · 403), frontend `components/README` 의 "자동 import" 문구, 템플릿 CLAUDE.md 보완(`pnpm format` 범위 · shared 재빌드 · `[param]` 페이지 뒤 `typed-router.d.ts`), `users.vue` 의 한국 시간 셈이 backend `TIME_ZONE` 과 따로, 스킬 기동 확인 뒤 서버 끄기, README 빠른 시작의 `CREATE DATABASE`.

## 5. 발견 · 넘긴 것

- **킷 결함**: 없음. 킷 문서 둘 — `admin-ui` README 「파일 기반 라우팅이면 `depth: 'all'`」 에 설정 셸 자식의 `meta.menu` 가 드로어에 올라가는 점과 점 표기 갈래, `admin-server` README 코어 장 절에 새 스텁 이름이 마지막 적용 장보다 뒤여야 한다는 문장.
- **템플릿 결함(고침)**: 개발 서버 사전 번들 두 번(`743941f` · `fbc06c0`), `.dockerignore` 루트 패턴만(`packages/*/node_modules` 가 이미지 설치를 덮고 `packages/backend/.env` 가 이미지에 들 수 있었다 — `**/` 패턴), backend `incremental: false`(tsbuildinfo 가 dist 밖에 남아 dist 를 지운 뒤 빌드가 아무것도 안 냈다), frontend 를 prettier 에서 뺌(eslint-config-vuetify 와 충돌).
- **도구 우회(검증만)**: 브라우저 확장의 `form_input` 대신 네이티브 value setter + input 이벤트로 아이디 · 비밀번호 칸을 채웠다(한글 · 일반 칸은 실제 타이핑). 백그라운드 vite 는 `pnpm dev` 대신 `node node_modules/vite/bin/vite.js --port 3000 --strictPort`(pnpm 래퍼를 멈추면 자식 vite 가 남아 다음 vite 가 3001 로 갔다).
- **TLS**: backend 컨테이너는 `DB_SSL=true` 로 `host.docker.internal` 의 테스트 DB 에 붙었다 — 우회 없이 통과.
- **넘긴 것**: IP 접근 제어 화면 · 감사 로그 화면은 템플릿에 없다(킷 모듈은 있다 — 후속 admin-ui PR 후보). 템플릿 `preset/auth` 와의 관계는 사람이 정한다. 게이트웨이의 헤더 오염 보완(`X-Forwarded-For` 덮어쓰기)은 게이트웨이 저장소 몫이다 — 템플릿은 마지막 값만 써서 보완 전에도 맞다.
