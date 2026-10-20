# 검증 — ringside 둘째 보고 반영 (PR #3i · 2g, 2026-10-20)

스펙 `docs/superpowers/specs/2026-10-20-admin-kit-ringside-feedback-2-design.md` §8.

## 1. 저장소(PR #3i)

- 브랜치 `feat/admin-ui-ringside-feedback-2` · 끝 커밋 `c4b49d5`(이 기록 커밋 직전)
- `pnpm check` 초록 — admin-ui 1168 테스트 · 워크스페이스 2031
- `pnpm format:check` 통과

## 2. 스모크(`$LOCALAPPDATA/Temp/aksi`)

- tarball: admin-shared 0.8.0 · admin-ui 0.8.0
- `vue-tsc --noEmit` 통과 · `vite build` 통과(진입점 둘: index · measure) — 새 export 아홉 · `scopes` 타입 사용
- `ReauthDialog` 의 `prompt?: string` 이 발행 d.ts 에 있다(최종 리뷰 확인 — 스모크 App.vue 는 쓰지 않았다).

## 3. 실브라우저(Google Chrome 155.0.8059.82, 1600×1000)

| 항목                                   | 기대                              | 실제                                                       |
| -------------------------------------- | --------------------------------- | ---------------------------------------------------------- |
| R5 간격 없음 — 쌍 0 · 1 · 2 겹침(px)   | 하나 이상 > 0                     | 7 · 7 · 7 (라벨 모두 visible)                              |
| R5 `gap: 12px` — 쌍 0 · 1 · 2 겹침(px) | 모두 ≤ 0                          | -5 · -5 · -5 (라벨 모두 visible)                           |
| R6 문단                                | 설명 · 안내 둘, 나뉨              | 「글쓰기 금지」 7일 — 사유: 도배 / 현재 비밀번호를 입력하세요. · separated true |
| R7 처음                                | park · lee · kim, sort 없음       | park · lee · kim, `#/table`                                |
| R7 가입 클릭 1                         | kim · lee · park, sort=joinAt:asc | kim · lee · park, `#/table?sort=joinAt:asc`                |
| R7 가입 클릭 2                         | park · lee · kim, sort 없음       | park · lee · kim, `#/table`                                |

## 4. 남은 것

- 측정 스크립트에서 같은 페이지의 해시 이동(`#/reauth` → `#/table`) 뒤에는 표 헤더를 찾지 못했다 — 원인 미확인, 재인증 대화상자가 열린 채 해시 경로를 바꾼 뒤라는 것만 안다(추정). 각 경로 진입 뒤 `page.reload` 를 더했다. 킷 결함인지는 가리지 않았다 — 필요하면 사람이 재인증 대화상자를 연 채 라우트를 옮겨 본다.
- 스모크 App.vue 는 새 공개 이름을 이름으로 import 하고 `import * as kit` 로 export 수를 센다(모든 export 를 하나씩 쓰지는 않았다).
- 2g 가 §5 이후를 더한다.

## 5. 저장소(PR 2g)

- 브랜치 `feat/admin-kit-full-access-messages` · 끝 커밋 `68c4343`(검증 기록 커밋 전)
- `pnpm check` 초록 — 워크스페이스 2066 테스트(170 파일) · admin-server 620 테스트(75 파일)
- `pnpm test:db` — 11.4 471 테스트(48 파일 · 41.13s) · 12.3 471 테스트(48 파일 · 42.98s) 모두 초록, 시간 초과 흔들림 없음
- `changeset status` — minor: admin-shared · admin-server · admin-ui 모두 0.9.0, major 없음. 비치명 경고: admin-server 가 admin-shared 의 현재 버전(0.8.0)에 의존해야 한다(`workspace:>=0.9.0 <1.0.0`) — 2f-2b 와 같은 예상된 경고

## 6. 서버 스모크(`$LOCALAPPDATA/Temp/aksg`)

| 항목 | 기대 | 실제 |
| --- | --- | --- |
| `tsc`(`skipLibCheck: false`) | 0건 | 0건 |
| 표시 없는 카탈로그 + IP 모듈 | 기동 실패(F6 문구) | `unmarked ERR AdminRolesModule — IP 접근 제어를 켰다면 ipAccess.manage 의 키(setting.ipAccess:write)를 전권 전용으로 표시한다: …` |
| `messages` 오타 | 기동 실패(모르는 묶음) | `typo ERR AdminServerModule 옵션 messages 를 해석할 수 없다 — 모르는 묶음: acounts. …` |
| 덮은 401 | 401 · ERR_COMMON_UNAUTHORIZED · 운영자 로그인이 필요합니다. | `me 401 ERR_COMMON_UNAUTHORIZED 운영자 로그인이 필요합니다.` |
| 묶음 키 | 여덟 | `auth,accounts,sessions,audit,teams,legal,ipAccess,ipAccessSchema`(여덟) |

추가: `fullAccessOnly ["setting.ipAccess:write"]` 출력.

## 7. 남은 것

- 설치가 peer 경고를 냈다 — 로컬 tarball 은 0.8.0 이고 admin-server peer 는 `>=0.9.0 <1.0.0`(`pnpm peers check`: unmet peer @ssworks/admin-shared). 발행본은 함께 0.9.0 이라 나지 않는다.
- 스모크 스크립트 보정(임시 앱만, 저장소 코드 무변경): ① `NestFactory.create` 에 `abortOnError: false` — 기본값은 기동 실패 시 `process.exit(1)` 이라(logger false 면 무출력) 두 실패 케이스를 잡지 못한다. ② `TZ=UTC` 로 실행 — `createAdminKysely` 가 UTC 가 아닌 프로세스를 거부한다(Windows 기본 KST 에서 세 기동 모두 이 오류). 소비 앱 안내로 알릴 만하다.
- pnpm 12 `allowBuilds` 보정은 필요 없었다.
