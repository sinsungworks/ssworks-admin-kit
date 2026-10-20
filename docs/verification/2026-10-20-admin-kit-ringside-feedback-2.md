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
