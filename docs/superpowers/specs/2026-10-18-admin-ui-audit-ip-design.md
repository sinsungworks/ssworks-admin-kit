# admin-ui 감사 로그 · IP 접근 제어 화면 설계 (PR #3f · #3g)

작성일: 2026-10-18 · 상태: 확정(구현 전) · 선행: PR #3a 스펙(`2026-10-03-admin-ui-list-write-design.md` — `useServerTable` · `useWriteFlow` · 코덱), PR #3b 스펙(`2026-10-04-admin-ui-roles-settings-design.md` — `useRoleEditor` 의 `reauth` 관문), PR #3c 스펙(`useSessions` 모양), PR #3e 스펙(`2026-10-07-admin-ui-legal-design.md` — L1 조립 · D17 화면 한 벌), 2c 스펙(감사 계약), 2f-1 스펙(IP 계약), 템플릿 스펙(`2026-10-16-template-preset-admin-design.md` ⑥ — 두 화면을 후속 admin-ui PR 로 넘김)

## 1. 목표

템플릿 `preset/admin` 과 첫 사용 프로젝트 ringside 에 **감사 로그 조회 화면**과 **IP 접근 제어 관리 화면**이 없다. 서버(`AdminAuditModule` 조회 · `AdminIpAccessModule`)와 계약(admin-shared `audit.ts` · `ip-access.ts`)은 0.4.0 부터 있다. 두 화면은 프로젝트마다 같아야 하므로 admin-ui(A)에 넣는다. hangang 의 `audit-logs.vue`(571줄) · `ip-access.vue`(1104줄 + 문구 816줄)를 복사하지 않고 어댑터만 넘기면 화면이 서게 한다.

- 3f — 감사: `useAuditLogs`(흐름) + `AuditLogViewer`(화면 한 벌).
- 3g — IP: `useIpAccessRules`(흐름) + `IpAccessManager`(화면 한 벌).
- hangang 이 🔴 로 지켜 온 안전장치를 킷 테스트로 고정한다. IP 쪽은 현재 IP 상시 표시 · 통과 여부 · 잠기는 사람 목록 · 전체 허용 제거 경고, 감사 쪽은 묶음 prefix / 개별 exact · 가린 값을 풀지 않음이다.
- **admin-shared · admin-server 는 고치지 않는다.** 0.4.0 부터 실린 export 만 쓴다.

ringside 기획서 14절은 두 화면을 모두 P1 관리자에 둔다. "감사 로그 전에 포인트 조정 · 제재 · 정산 승인을 열지 않는다"(14.5)가 있어 감사(3f)를 먼저 한다.

## 2. 결정

### 2-1. 경계 결정 (2026-10-18)

결정 문서(HTML)로 고른 뒤 설계 절마다 승인받았다. 일곱 가지 모두 권장안이다.

| 결정                        | 확정                                                                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR 분할                     | 스펙 하나 · PR 둘 · **감사(3f) 먼저**. 3g 플랜은 3f 머지 뒤에 쓴다                                                                                         |
| ① 조립 단위                 | **L1** — 흐름 composable + 화면 한 벌. 부품 SFC 는 내부(나중에 필요하면 export)                                                                            |
| ② 감사 행위자 고르기        | **A1** — 선택 어댑터 `searchActors(keyword)` 자동완성. 없거나 권한 게터가 거짓이면 번호 칸. 행위자 셀에 "이 사람 기록만"                                   |
| ③ 감사 필터 적용 · URL      | **F1** — 입력값/적용값 분리 + [적용] · [초기화] + 선택 옵션 `urlSync`(다른 화면에서 `?actor=` · `?targetType=&targetRefNo=` 링크)                          |
| ④ IP 대상 고르기            | **T1** — 선택 어댑터 `loadTeams()`(트리 → 경로 select) · `searchUsers(keyword)`(자동완성) + 권한 게터. 없으면 번호 칸                                      |
| ⑤ IP 미리보기 시점          | **P1** — 자동. 게이트는 `ipCidrSchema` 통과, 편집은 300ms 디바운스, 현행 · 삭제는 바로                                                                     |
| ⑥ IP 저장 뒤 세션 끊기 제안 | **S2** — 넣지 않는다. 킷 서버는 매 요청 · 토큰 갱신에서 IP 를 본다(2f-1) — 상시 문장으로 "저장 즉시 모든 요청에 적용 · 세션은 그대로 · 끊으려면 세션 화면" |
| ⑦ IP 편집 자리              | **E1** — 표 위 인라인 편집 패널(대화상자 아님). 재인증 대화상자와 겹치지 않는다(hangang)                                                                   |
| 릴리스                      | PR 마다 changeset minor(admin-ui). admin-ui peer `@ssworks/admin-shared` 하한 `>=0.4.0 <1.0.0`(3f)                                                         |

결정 문서의 "이의 없으면 이대로" 목록은 아래 C · A · I 목록에 녹였다. 설계 절 승인 중 바뀐 것은 둘이다.

- 재인증 옵션은 결정 문서의 `gate: 'confirm'` 이 아니라 `reauth?: boolean`(기본 false)이다. `useRoleEditor` 와 서버 기본값에 맞췄다(§4 검토).
- IP 삭제의 관문은 확인 창 다음 재인증 창이 아니라 **관문 하나**다. 재인증이면 그 창의 문구가 확인을 겸한다(`useRoleEditor` 481행과 같은 규칙, §5 검토).

### 2-2. 공통 설계 결정

| #   | 결정                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | 판정 · 문구는 admin-ui 안의 순수 함수 모듈(`components/audit/audit-log.ts` · `components/ip-access/ip-access.ts` · `utils/local-date.ts`)에 두고 단위 테스트를 붙인다. 공개 API 는 composable 과 화면 한 벌뿐이다. hangang 이 SFC 밖에 문구 파일을 둔 이유(import 할 수 없으면 테스트할 수 없다)와 같다      |
| C2  | 문구는 `messages` 부분 덮어쓰기로 바꾼다(`useSessions` 와 같은 방식). 기본값은 `DEFAULT_AUDIT_LOG_MESSAGES` · `DEFAULT_IP_ACCESS_MESSAGES`(내부)이고, 덮어쓰기 타입 `AuditLogMessages` · `IpAccessMessages` 는 공개한다                                                                                      |
| C3  | 상태는 색과 글자를 함께 쓴다. 테스트도 글자로 찾는다(happy-dom 은 색을 잴 수 없고, 색각 이상에도 안 보인다 — hangang)                                                                                                                                                                                        |
| C4  | admin-ui 가 admin-shared 의 런타임 값(`coreAuditCatalog` · `ipCidrSchema` · `IP_ACCESS_SCHEMA_MESSAGES` · `CommonErrorCodes` 등)을 0.4.0 판으로 처음 쓴다. peer 를 `workspace:^0` 에서 `workspace:>=0.4.0 <1.0.0` 으로 바꾼다. `.changeset/README.md` 의 "같은 규칙이 필요해지면 그때 하한을 둔다" 의 그때다 |
| C5  | 시각 표기 `formatDateTime` 에 `{ seconds: true }` 옵션을 더한다(내부 함수 — 공개 API 아님). 두 화면 모두 `formatDate` prop 으로 바꿀 수 있다(`SessionTable` · `LegalDocumentEditor` 와 같은 이름)                                                                                                            |
| C6  | 화면 한 벌은 페이지 제목과 바깥 카드를 그리지 않는다. 페이지가 `CardLayout` 등으로 감싼다(템플릿 `sessions.vue` 와 같은 방식)                                                                                                                                                                                |
| C7  | 목록 조회 실패는 처리됨으로 표시하지 않는다. 화면 안 알림과 전역 토스트가 둘 다 뜬다(3d · 3e D13). 칸 · 카드가 자기 문구를 보이는 실패(행위자 검색 · 대상 후보 · 미리보기)는 처리됨으로 표시한다                                                                                                             |
| C8  | 자동완성 검색(행위자 · 사용자)은 같은 규칙이다: 빈 검색어는 부르지 않음, 300ms 디바운스, 순번으로 늦은 응답 버림, 스코프 해제 뒤 응답 버림, 해제 때 타이머 정리                                                                                                                                              |
| C9  | 권한 게터가 거짓이면 그 어댑터를 **부르지 않는다**(403 이 나지 않게 · hangang). 칸 아래에 이유를 문장으로 적는다                                                                                                                                                                                             |

### 2-3. 3f 감사 설계 결정

| #   | 결정                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | 🔴 **입력값(`draft`)과 적용값(`applied`)을 나눈다.** 입력 중에 조회하면 번호 칸의 400 과 늦은 응답이 이긴다(hangang). 입력값 → 적용값은 넷뿐이다: `apply()` · `reset()` · `filterByActor()` · URL 복원. 칸 값은 모두 문자열이고 `''` 는 전체다                                                                                                                                                                                                                      |
| A2  | 🔴 **적용값이 그대로인 `apply()` · `reset()` 은 `reload()` 를 직접 부른다.** `useServerTable` 은 같은 필터 키를 다시 조회하지 않는다(hangang 223)                                                                                                                                                                                                                                                                                                                   |
| A3  | `apply()` 는 먼저 `auditFilterProblem(draft)` 로 본다: 행위자 번호 · 대상 번호가 숫자가 아님, 기간 역전(같은 날은 정상). 실패면 적용하지 않고 `filterError` 를 세운다. 입력값은 그대로 둔다                                                                                                                                                                                                                                                                         |
| A4  | 🔴 **동작 필터: 묶음은 prefix, 개별은 exact.** `session.revoke` 는 `session.revoke.user` 의 접두라 개별을 prefix 로 보내면 오류 없이 엉뚱한 행이 섞인다(hangang 85-90). 🔴 묶음 값은 **끝에 점**을 붙인다(`org.role.`). 서버 prefix 는 `LIKE 'x%'` 라 점이 없으면 이웃 코드를 잡을 수 있다. 값이 점으로 끝나면 prefix, 아니면 exact — 칸 값 하나로 둘을 나른다(실제 코드는 점으로 끝나지 않는다)                                                                    |
| A5  | 묶음 목록은 코어 기본 `CORE_AUDIT_ACTION_GROUPS`(인증 `auth` · 로그인 `auth.login` · 세션 `session` · 역할 `org.role` · 사용자 `org.user` · 팀 `org.team` · 설정 `setting`)에 옵션 `actionGroups` 를 더한다. prefix 가 같으면 라벨을 덮어쓴다. 🔴 카탈로그 액션이 **둘 이상** 걸리는 묶음만 항목이 된다(한 줄 묶음은 개별과 같다). 묶음이 먼저, 개별은 `ACTION_VALUES` 순서 그대로. 묶음은 admin-shared 카탈로그에 두지 않는다 — admin-shared 를 고쳐야 한다        |
| A6  | URL(`urlSync: true`): 키는 `actor` · `action` · `targetType` · `targetRefNo` · `from` · `to`(+ 표의 `page` · `size`). 날짜는 ISO 가 아니라 로컬 `YYYY-MM-DD` 다. 코덱이 틀린 값을 버린다(번호는 숫자만, 날짜는 형식, `action` 1~128자, `targetType` 1~64자). 복원은 적용값과 입력값 둘 다에 넣는다                                                                                                                                                                  |
| A7  | 기간은 반열림이다: 시작은 그날 로컬 0시, 끝은 끝 날짜 **다음 날** 로컬 0시를 ISO 로 보낸다(서버가 `<` 로 비교). 한쪽만 넣어도 된다. 기본 기간은 없다. 서버 · DB 는 UTC, 화면은 브라우저 로컬(hangang 2026-10-04 원칙)                                                                                                                                                                                                                                               |
| A8  | 행위자 칸 모드: ① `searchActors` 있음 · `canSearchActors()` 참 → 자동완성(C8, 항목 "이름 (아이디)" · 퇴사자 " · 퇴사"), ② 어댑터 있음 · 게터 거짓 → 번호 칸 + "행위자 목록을 볼 권한이 없어 번호로 찾습니다.", ③ 어댑터 없음 → 번호 칸만. 검색 실패는 목록 자리에 문구(번호 칸으로 바꾸지 않는다)                                                                                                                                                                   |
| A9  | 번호만 아는 행위자(URL · 셀 버튼)의 이름표는 셋 중 먼저 있는 것: 마지막으로 고른 검색 항목 → 목록 첫 행의 행위자 이름 → `#번호`. 번호로 이름을 찾으려고 부르지 않는다                                                                                                                                                                                                                                                                                               |
| A10 | `filterByActor(row)` 는 `actorUserNo` 가 있는 행에서만 동작한다. **적용값의 행위자만** 바꿔 바로 조회하고, 입력값을 새 적용값으로 덮는다(입력 중이던 다른 칸은 적용값으로 돌아간다 — 보이는 필터와 표가 어긋나지 않게)                                                                                                                                                                                                                                              |
| A11 | 정렬은 `createAt` 내림차순 고정이다. `sort: { keys: ['createAt'], default: { key: 'createAt', order: 'desc' } }` 로 늘 실어 보내고, 표 머리는 모두 `sortable: false`, 표 위에 "정렬: 최신순(고정)"                                                                                                                                                                                                                                                                  |
| A12 | 셀: 시각(초까지) · 행위자(이름(아이디) → `#번호 (계정 정보 없음)` → `계정 없음`) + "이 사람 기록만" · 동작(위 `labelOf` · 아래 코드 원문) · 대상(`targetLabelOf #번호`, 종류 없으면 —) · 결과(칩에 "200 · 성공" — 2xx 성공 · 3xx 이동 · 4xx 거부 · 5xx 서버 오류, 실패면 아래 줄 `errorCode`) · IP(없으면 —) · [내역]                                                                                                                                               |
| A13 | 🔴 **펼침 키는 `String(logNo)`** 다. 키가 없으면 한 행을 펼칠 때 전 행이 펼쳐지고, bigint 는 비교가 안 된다(hangang 252 · 414). 펼침 버튼은 글자 "내역" / "접기"다(아이콘만이면 테스트가 못 찾는다). 적용값이 바뀌면 펼친 목록을 비운다                                                                                                                                                                                                                             |
| A14 | 펼친 행(hangang `diffMeta` 그대로): `meta.before` · `meta.after` 중 하나라도 plain object 면 바뀐 항목 표(키 합집합 · 같은 값 제외 · 한쪽 없으면 "(없음)" · 값은 문자열이면 그대로, 아니면 JSON). 🔴 `***` 인 키는 표에서 빼고 이름만 적는다 — 풀거나 추측하지 않는다. 나머지 meta 키는 "기타 기록" JSON. 둘 다 없으면 "기록된 변경 내역이 없습니다". 아래에 요청(METHOD path) · 세션 #번호 · User-Agent. 항목 이름은 `fieldLabels[key]` 가 있으면 "라벨 + 키 원문" |
| A15 | 빈 상태: 적용값에 조건이 없으면 "아직 기록이 없습니다", 있으면 `EmptyState filtered` "조건에 맞는 기록이 없습니다". 🔴 둘을 섞지 않는다. 만들기 버튼은 없다(읽기 전용). 조회 실패면 빈 상태 문구 대신 표 위 오류 알림 + [다시 시도](C7)                                                                                                                                                                                                                             |

### 2-4. 3g IP 설계 결정

| #   | 결정                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | 화면 순서: 알림 → 접속 상태와 변경 영향 카드(늘) → 편집 패널(열렸을 때) → 규칙 목록. 편집 중에는 카드가 편집 값 기준으로 바뀐다. 용어는 킷 README 를 따른다: 사용자 · 팀 · 전체(hangang 계정 · 팀 · 전역)                                                                                                                                                                                                                                                                                                                                                                                     |
| I2  | 카드 ① 현재 IP: 미리보기 응답의 `clientIp`. 🔴 받기 전 · 못 받았으면 빈 칸이 아니라 "현재 접속 IP 를 아직 확인하지 못했습니다". 🔴 한 번 받은 값은 뒤의 실패로 지우지 않는다                                                                                                                                                                                                                                                                                                                                                                                                                  |
| I3  | 카드 ② 통과 여부는 미리보기가 **ready** 일 때만 적는다. 통과하지 못하면 "… 통과하지 못합니다 — 서버가 저장을 거부합니다(409)". 🔴 미리보기가 없으면 통과 여부를 말하지 않는다                                                                                                                                                                                                                                                                                                                                                                                                                 |
| I4  | 카드 기준 줄: 현행 · 만들 때 · 바꿀 때 · 지울 때 넷 중 하나. 🔴 안 적으면 현행 스냅샷을 변경 뒤 예측으로 읽는다                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| I5  | 카드 ③ 요약: 평가 인원 · 새로 잠김 / 이미 잠김 / 판정 불가를 가른다 · 거부 세션 수(잠기는 사람이 0명이어도) · 규칙만 바뀌는 사람 수(hangang `previewSummaryLine`). 목록 둘: 새로 잠기는 사람(`becomesLocked`) · 규칙만 바뀌는 사람(`ruleSetChanged && !becomesLocked`, 판정 불가면 🔴). 🔴 서버 순서를 다시 정렬하지 않는다. 한 줄 = 이름(아이디) — 층 전 → 후 · 세션 줄(세 갈래 — hangang `sessionLine`)                                                                                                                                                                                     |
| I6  | 본인 표시: "🔴 이름(아이디 · 본인)". 판정 기본은 `item.userId === useAdminUi().user()?.userId`, 옵션 `isSelf` 로 바꾼다. 기본값을 쓸 때만 컨텍스트를 찾는다(`useSessions` 와 같음)                                                                                                                                                                                                                                                                                                                                                                                                            |
| I7  | 🔴 **전체 허용 제거 판정은 범위가 아니라 CIDR 이다**(hangang `removesGlobalAllow` — 정정 ㉠ 거짓 경고 · ㉡ 침묵). 바꾸기 전 CIDR 이 `0.0.0.0/0` · `::/0` 이고 바꾼 뒤 그것이 아니면(삭제 포함) 카드와 **관문 창 문구 둘 다**에 경고를 넣는다. 미리보기도 서버 409 도 못 잡는 갈래(다른 주소 계열로 붙는 사람)라 화면 몫이다                                                                                                                                                                                                                                                                   |
| I8  | 상시 문단 넷: 가장 가까운 층 하나 · 기본 거부 / 미리보기는 예고이고 막는 것은 서버 검사(409) · 그 검사도 요청자 본인만 봄 / 저장 즉시 모든 요청에 적용 · 세션은 그대로 · 끊으려면 세션 화면(⑥ S2) / 잠긴 사람은 이 화면에 못 들어옴 · 복구는 DB 직접 조작 · 목록에 본인이 있을 수 있음. 런북 경로 등은 `messages` 로 바꾼다                                                                                                                                                                                                                                                                   |
| I9  | 미리보기 질의 `previewQueryOf`: 패널 닫힘 → `{}`(현행) · 만들기 · 수정에서 칸이 덜 참 → `null`(부르지 않음 · pending-input) · 칸이 다 참 → `{ op: 'create' \| 'update', ruleNo?, scopeType, scopeRefNo?, cidr }` · 삭제 → `{ op: 'delete', ruleNo }`. "칸이 다 참" = CIDR 이 `ipCidrSchema` 통과 + 전체가 아니면 대상 번호가 숫자. 🔴 `null` 과 `{}` 는 다르다 — 덜 찬 폼을 현행으로 떨어뜨리면 "아무도 안 잠김"이 보인다. 🔴 전체면 `scopeRefNo` 를 싣지 않는다                                                                                                                              |
| I10 | 감시는 질의의 문자열 키 하나다(여럿을 따로 감시하면 요청이 두 번 — hangang). 편집 질의는 300ms 디바운스, 현행 · 삭제는 바로. `canManage()` 가 거짓이면 질의와 상관없이 **forbidden** 이고 부르지 않는다                                                                                                                                                                                                                                                                                                                                                                                       |
| I11 | 상태 기계 — 질의 키가 바뀜: 순번 +1 → loading · result 비움(🔴 이전 결과를 남기지 않는다) · clientIp 는 둠. 질의가 null: 순번 +1 → pending-input(🔴 순번을 올려야 날아오던 응답이 덮지 못한다). 성공: ready. 403: forbidden. 404: stale + 목록 재조회(편집 중인 규칙이 사라졌으면 패널 닫음). 그 밖 · 400: failed(킷은 화면 · 서버 파서가 같아 400 은 계약 어긋남 — "입력 중"으로 감추지 않는다). 미리보기 실패는 처리됨(C7)                                                                                                                                                                  |
| I12 | 🔴 **관문(확인 · 재인증)은 미리보기가 끝난 뒤 연다.** 내부 `flushPreview()` 가 디바운스 중이면 바로 부르고, 진행 중이면 결과를 기다려 그때의 상태를 돌려준다. `useWriteFlow` 는 창 문구를 열 때 고정하므로, 기다렸다 열어야 문구가 그 입력의 최종 영향이다. 실패했으면 문구에 "영향을 확인하지 못했습니다"가 들어간다(hangang 은 창을 먼저 열고 문구가 바뀌었다)                                                                                                                                                                                                                              |
| I13 | 관문: `reauth: true` 면 쓰기 셋 모두 재인증 창 하나다. 삭제 문구에 "되돌릴 수 없습니다"를 넣는다(문구가 확인을 겸한다). `reauth: false` 면 확인 창이다 — 저장은 `reversible: true`, 삭제는 `false`. 🔴 관문 없이 나가는 IP 쓰기는 없다(`useRoleEditor` 의 저장은 관문 없음과 다르다 — IP 변경은 사람을 잠근다). 관문 문구 = 머리말 + 전체 허용 제거 경고(해당 시) + 영향 한 줄(ready 면 새로 잠김 수)                                                                                                                                                                                         |
| I14 | 저장 순서: ① 🔴 첫 줄 `canManage() && !busy` 가드(`:disabled` 는 마우스만 막는다) ② 칸 검증 실패면 칸 오류 · 멈춤(비밀번호 묻기 전) ③ `await flushPreview()` 스냅숏 — 그사이 패널이 닫히거나 바뀌었으면 멈춤 ④ 관문 ⑤ 🔴 요청이 나갔으면 성공이든 실패든 목록 재조회(재인증 실패로 창이 남은 경우 제외) ⑥ 성공: 패널 닫음 · 미리보기 현행 · `onDone` · 스냅숏이 ready 가 아니었으면 노란 알림 "누가 잠기는지 확인하지 못했습니다 — 「아무도 안 잠깁니다」가 아닙니다" ⑦ 🔴 만들기 성공 뒤 재조회가 반영되지 않아도 패널을 닫는다 — 채운 폼을 남기면 같은 규칙을 또 만든다(`useRoleEditor` R8) |
| I15 | 삭제 순서: 가드 → 열린 패널에 고친 값이 있으면 버릴지 묻기(삭제 미리보기가 같은 자리를 쓴다) → 미리보기 대상 `delete(rule)` · `await flushPreview()` → 관문 → 취소면 미리보기 현행 → 요청이 나갔으면 재조회 · 미리보기 현행 → 성공이면 `onDone`                                                                                                                                                                                                                                                                                                                                               |
| I16 | 수정 본문은 네 칸(`scopeType` · `scopeRefNo` · `cidr` · `description`)과 `revision` 을 늘 싣는다. 생략이 "그대로"로 읽히는 부분 갱신에 기대지 않아야 화면에 보이는 값이 그대로 저장된다. 설명 빈 값은 `null`. bigint 는 킷 API 클라이언트 코덱이 싣는다. 삭제 본문은 `{ revision }` 이고 어댑터가 `api.del(url, body)` 로 보낸다(🔴 두 번째 인자를 빠뜨리면 본문이 사라져 400 — hangang)                                                                                                                                                                                                      |
| I17 | 오류 갈래: 재인증 실패 → 창 안 · 유지(`useWriteFlow`). 400 검증 · 칸 넷이 덮음 → 칸 아래 · 처리됨(`fields`). 400 칸 밖 → 전역 토스트. 🔴 409 `ERR_COMMON_CONFLICT`(자기 잠금 · 전권자 잔존 — 한 코드가 두 뜻) → 서버 `message` 그대로 + `details.clientIp` 있으면 주소, 패널 위 빨간 알림, 처리됨 표시는 **어댑터 호출을 감싼 catch 의 동기 구간**에서(`useWriteFlow` 를 고치지 않는다 · 지연 `onError` 보다 먼저). 409 `ERR_COMMON_REVISION_CONFLICT` → I18. 404 · 403 · 5xx · 네트워크 → 전역 토스트 · 재조회 뒤 그 규칙이 없으면 패널 닫음                                                 |
| I18 | revision 충돌(`onConflict`): 목록 · 미리보기 재조회, **폼은 유지**, 편집 대상 행을 새 행으로 바꾼다(다음 저장은 새 revision — 사용자가 차이를 본 뒤 한 번 더 눌러야 덮는다). 노란 알림에 새로 불러온 값(범위 · CIDR)을 적는다. 새 목록에 그 규칙이 없으면 패널을 닫고 "이미 지워진 규칙입니다"                                                                                                                                                                                                                                                                                                |
| I19 | 편집 패널 칸: 범위 select(사용자 · 팀 · 전체 순 — 🔴 가까운 층부터, 그 순서가 평가 순서). 전체로 바꾸면 대상을 비운다(다시 팀으로 돌렸을 때 본 적 없는 번호가 남지 않게). CIDR 은 `ipCidrSchema`(앞뒤 공백 뗌 · 43자), 오류는 blur 와 저장 때 `IP_ACCESS_SCHEMA_MESSAGES.cidr`. 설명 200자. 저장 버튼은 `:disabled` 와 `:loading` 한 벌                                                                                                                                                                                                                                                       |
| I20 | 대상 칸(④ T1): 팀 — `loadTeams` 있음 · `canLoadTeams()` 참이면 패널을 열 때 불러(다시 열면 다시) `flattenTeamPaths` 로 "본사 › 고객지원 › 상담센터" select. 사용자 — `searchUsers` 있음 · `canSearchUsers()` 참이면 자동완성(C8, "이름 (아이디)"). 아니면 "팀 번호" · "사용자 번호" 칸(숫자만), 게터가 거짓이면 이유 문장(C9). 수정 때는 행의 `scopeName` · `scopeUserId` 로 지금 대상을 미리 채운다. 후보 실패는 칸 아래 문구(번호 칸으로 바꾸지 않는다)                                                                                                                                     |
| I21 | 패널을 바꾸거나 닫을 때 고친 값이 있으면 "고친 값 버리기" 확인 창(되돌릴 수 없음)으로 묻는다. 고친 값 = 연 순간의 폼과 지금 폼이 다름. 🔴 창은 `IpAccessManager` 안에 있다(3e D17 의 "초안 버리기"와 같음) — 킷 `useConfirm` 은 플러그인이 없으면 던지므로 기대지 않는다. 이 창은 쓰기 관문(`useWriteFlow`)과 따로 열린다                                                                                                                                                                                                                                                                     |
| I22 | 규칙 목록: 서버가 준 전량 한 표(서버 페이징 없음 · 쪽 넘김 숨김 · 머리 정렬 막음 · "정렬: 범위 → 번호(고정)"). 범위 셀은 "전체" / "팀 · 상담센터" / "사용자 · 김운영 (ops01)" + 아래 줄 `#번호`. 🔴 `scopeName` 이 null 이면 "팀 #9 — 대상 없음(아무에게도 걸리지 않음)" — 이름을 지어내지 않는다. 편집 중인 행에 "편집 중". 작업 열(수정 · 삭제 글자 버튼, 접근 이름은 규칙을 가리킴)은 `canManage()` 일 때만. 빈 목록은 `EmptyState` "IP 규칙이 하나도 없습니다 — 지금은 모든 접속이 거부됩니다" + [새 규칙](권한 있을 때)                                                                  |
| I23 | 성공 알림은 화면이 띄우지 않는다. `onDone({ action, rule })` 로 페이지에 넘긴다(3d · 3e 와 같음). 화면 안 알림(빨강 · 노랑)은 닫을 수 있고, 다음 쓰기 시작 · 패널 열기에서 내린다                                                                                                                                                                                                                                                                                                                                                                                                             |
| I24 | 경합: 목록 · 미리보기 · 팀 후보 · 사용자 검색이 각자 순번을 가진다. 재조회 중에 사용자가 다른 규칙을 열었으면 쓰기 뒤처리(패널 닫기 · 대상 바꾸기)를 하지 않는다(`useRoleEditor` §4-4-2 #3). 스코프 해제 때 디바운스 타이머를 지운다                                                                                                                                                                                                                                                                                                                                                          |

## 3. 정본과 흡수 목록

| 산출물             | 정본                                                                                             | 흡수할 것                                                                                                                                                                                                                                                                                                                                                                                    | 버릴 것                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit-log.ts`     | hangang `pages/settings/audit-logs-messages.ts`                                                  | `formatStatus` 글자 · `actionFilterItems` 의 prefix/exact 값 · `diffMeta` · `MASKED_VALUE` · 문구(읽기 전용 · 기간 힌트 · 묶음 힌트 · 빈 상태 둘 · 기간 역전 · 번호 형식)                                                                                                                                                                                                                    | `principalRefNo = 0` 익명(킷 행은 `actorUserNo` null), `AUDIT_ACTION_GROUPS` 고정 표(→ A5), `resolveAuditLogsMessage`(→ 전역 토스트), 100명 상한 안내(→ A1 검색)                                        |
| `local-date.ts`    | hangang `utils/local-time.ts` `isDateOnly` · `localDayStartIso` · `localNextDayStartIso`         | 형식 검증 뒤 변환 · 다음 날 0시                                                                                                                                                                                                                                                                                                                                                              | 시간대 인자(브라우저 로컬만)                                                                                                                                                                            |
| `useAuditLogs`     | hangang `audit-logs.vue` 흐름 + gise `useRouteQuerySync`(URL) + crm `useAuditActions`(묶음 머리) | 입력/적용 분리 · 같은 조건 재적용 reload · 검증 실패면 조회 안 함 · 권한 없으면 계정 목록 안 부름 · 펼침 키                                                                                                                                                                                                                                                                                  | 페이지 로컬 상태, 계정 100명 목록(→ 서버 검색), `principalMode: 'both'`                                                                                                                                 |
| `AuditLogViewer`   | hangang `audit-logs.vue` 템플릿                                                                  | 필터 카드 배치 · 힌트 · 경고 알림 · 정렬 라벨 · 글자 펼침 버튼 · 펼친 행 구성 · `EmptyState` 두 갈래                                                                                                                                                                                                                                                                                         | `ColumnPane` 루트(→ C6), 결과 글자만(→ 칩 + 글자, crm), 시각 `toLocaleString`(crm)                                                                                                                      |
| `ip-access.ts`     | hangang `pages/settings/ip-access-messages.ts`                                                   | 라벨 표(`Record` — 층이 늘면 컴파일이 막음) · `layerLabel(null)` "규칙 없음(기본 거부)" · 상태 라벨 · `actorIpLine` · `actorPassLine` · `previewSummaryLine` · `lockedItemLine` · `sessionLine` · `ruleSetChangedItemLine` · `nameWithSelf` · 미리보기 상태 문구 다섯 · `GLOBAL_ALLOW_*` · `removesGlobalAllow` · `previewScopeLine` · `ruleText` · 상시 문단 · `SAVED_WITHOUT_PREVIEW_NOTE` | CIDR 약한 검증(→ `ipCidrSchema`), `scopeRefError` 의 `z.coerce.bigint` 근거, 세션 종료 제안 문구 전부(→ ⑥ S2), `SESSIONS_SURVIVE_NOTE`(킷 서버는 매 요청 판정), 오류 표(→ I17), 런북 경로(→ `messages`) |
| `useIpAccessRules` | hangang `ip-access.vue` 흐름 + crm `ip_access_control.vue`(대상 후보 · 팀 경로 펴기)             | 질의 하나 감시 · `null` ≠ `{}` · 순번 · 404 stale · `actorIp` 유지 · 저장 전 스냅숏 · 실패해도 재조회 · 검증이 비밀번호보다 먼저 · 첫 줄 가드                                                                                                                                                                                                                                                | 창 먼저 열기(→ I12), 확인 다음 재인증(→ I13), 세션 종료 제안, 화면 slice 페이징, 번호 직접 입력만(→ T1), crm 범위별 목록 · 편의 입력 `10.0.0.*`                                                         |
| `IpAccessManager`  | hangang `ip-access.vue` 템플릿                                                                   | 알림 → 카드 → 편집 패널 → 목록 순 · 카드 줄 구성 · 편집 패널이 대화상자 아님 · 범위 select 순서 · 전체면 대상 칸 없음 · 대상 없는 규칙 표기                                                                                                                                                                                                                                                  | `VSnackbar`, 성공 알림(→ `onDone`), 화면 slice 페이징                                                                                                                                                   |

## 4. 공개 API

### 4-1. `useAuditLogs` (`composables/useAuditLogs.ts`)

```ts
export interface AuditActorOption {
  userNo: bigint
  userId: string
  userName: string
  /** 퇴사자면 항목에 " · 퇴사" */
  resigned?: boolean
}

/** prefix 는 끝 점 없이('org.role'). 보낼 때 'org.role.' 로 만든다(A4) */
export interface AuditActionGroup {
  prefix: string
  label: string
}

/** 서버 `filter` 모양 그대로 — `useServerTable` 의 `filters()` 가 적용값에서 만든다 */
export interface AuditLogFilter {
  actorUserNo?: bigint
  action?: string
  actionMatch?: 'prefix' | 'exact'
  targetType?: string
  targetRefNo?: bigint
  from?: string
  to?: string
}

/** 칸 값은 모두 문자열이다 — '' = 전체(A1) */
export interface AuditLogDraft {
  actorUserNo: string
  action: string
  targetType: string
  targetRefNo: string
  from: string
  to: string
}

export interface UseAuditLogsOptions<R extends AdminAuditLog = AdminAuditLog> {
  /** 템플릿: (params) => api.get<Paginated<AdminAuditLog>>('/audit-logs', { params }) */
  fetch: (
    params: ServerTableParams<AuditLogFilter>,
  ) => Promise<{ items: R[]; total: number | bigint }>
  /** 기본 coreAuditCatalog */
  catalog?: AuditCatalog
  actionGroups?: readonly AuditActionGroup[]
  fieldLabels?: Readonly<Record<string, string>>
  searchActors?: (keyword: string) => Promise<readonly AuditActorOption[]>
  /** 게터 — 부를 때마다 평가한다. 기본 () => true */
  canSearchActors?: () => boolean
  /** 기본 false(A6) */
  urlSync?: boolean
  itemsPerPage?: number
  messages?: Partial<AuditLogMessages>
  /** 기본 true */
  immediate?: boolean
}

export interface AuditLogs<R> {
  draft: Readonly<Ref<AuditLogDraft>>
  applied: Readonly<Ref<AuditLogDraft>>
  filterError: Readonly<Ref<string | null>>
  /** 검증 실패면 false */
  apply: () => boolean
  reset: () => void
  filterByActor: (row: R) => void
  reload: () => Promise<void>
  table: ServerTable<R>
  /** <AuditLogViewer v-bind="audit.viewer.value" /> */
  viewer: ComputedRef<AuditLogViewerBindings<R>>
}
```

- `urlSync: true` 는 vue-router 가 있어야 한다(`useServerTable` 의 `urlSync` 와 같은 조건).
- `setup` 안에서 부른다.

### 4-2. `AuditLogViewer` (`components/audit/AuditLogViewer.vue`, `generic="R extends AdminAuditLog"`)

`AuditLogViewerBindings<R>` 를 그대로 props · 리스너로 받는다. 모양(이름은 플랜에서 확정):

- 필터: `draft` · `onUpdate:draft` · `actorMode`(`'search' | 'number'`) · `actorHint` · `actorItems` · `actorSearching` · `actorSearchFailed` · `onSearchActors(keyword)` · `actionItems` · `targetItems` · `filterError` · `onApply` · `onReset`
- 표: `rows` · `itemsLength` · `page` · `itemsPerPage` · `onUpdate:page` · `onUpdate:itemsPerPage` · `loading` · `loadFailed` · `onRetry` · `filtered` · `expanded` · `onUpdate:expanded` · `onFilterByActor(row)`
- 표기: `catalog` · `fieldLabels` · `messages`

컴포넌트 자체 prop: `formatDate?(iso: string): string`(C5). 내부 부품 `AuditLogFilterBar` · `AuditLogTable` · `AuditLogDetail` 은 export 하지 않는다.

### 4-3. `useIpAccessRules` (`composables/useIpAccessRules.ts`)

```ts
export interface IpUserOption {
  userNo: bigint
  userId: string
  userName: string
}

/** 재인증일 때만 currentPassword 가 있다. 본문에 실을지는 어댑터가 정한다(useRoleEditor 와 같음) */
export interface IpWriteContext {
  currentPassword?: string
}

/** 칸 값은 문자열 — scopeRefNo '' = 없음 */
export interface IpRuleForm {
  scopeType: IpScopeType
  scopeRefNo: string
  cidr: string
  description: string
}

export type IpPreviewState =
  'loading' | 'ready' | 'pending-input' | 'forbidden' | 'stale' | 'failed'

export interface IpPreviewView {
  state: IpPreviewState
  op: 'create' | 'update' | 'delete' | null
  result: AdminIpPreview | null
  /** 한 번 받으면 뒤의 실패로 지우지 않는다(I2) */
  clientIp: string | null
}

export interface UseIpAccessRulesOptions<R extends AdminIpRule = AdminIpRule> {
  list: () => Promise<readonly R[]>
  preview: (query: AdminIpPreviewQuery) => Promise<AdminIpPreview>
  create: (body: AdminIpRuleCreate, ctx: IpWriteContext) => Promise<unknown>
  update: (rule: R, body: AdminIpRuleUpdate, ctx: IpWriteContext) => Promise<unknown>
  /** api.del(url, body) — 두 번째 인자가 본문이다(I16) */
  remove: (rule: R, body: AdminIpRuleRemove, ctx: IpWriteContext) => Promise<unknown>
  /** 게터 — ipAccess.manage. 거짓이면 미리보기 · 쓰기를 부르지 않는다 */
  canManage: () => boolean
  /** 기본 false(서버 기본과 같다). 서버 reauth 옵션과 맞춘다(I13) */
  reauth?: boolean
  loadTeams?: () => Promise<readonly AdminTeamNode[]>
  canLoadTeams?: () => boolean
  searchUsers?: (keyword: string) => Promise<readonly IpUserOption[]>
  canSearchUsers?: () => boolean
  isSelf?: (item: AdminIpPreviewItem) => boolean
  onDone?: (event: {
    action: 'create' | 'update' | 'remove'
    rule: R | null
  }) => void | Promise<void>
  messages?: Partial<IpAccessMessages>
  immediate?: boolean
}

export interface IpAccessRules<R> {
  rules: Readonly<Ref<readonly R[]>>
  loading: Readonly<Ref<boolean>>
  loadError: Readonly<Ref<unknown>>
  reload: () => Promise<void>
  /** null = 닫힘 · 'new' = 만들기 · R = 그 규칙 수정 */
  editing: Readonly<Ref<R | 'new' | null>>
  form: Readonly<Ref<IpRuleForm>>
  preview: Readonly<Ref<IpPreviewView>>
  /** 고친 값이 있으면 버릴지 묻는다(I21). 취소면 false */
  openCreate: () => Promise<boolean>
  openEdit: (rule: R) => Promise<boolean>
  closeEditor: () => Promise<boolean>
  save: () => Promise<boolean>
  remove: (rule: R) => Promise<boolean>
  submitting: Readonly<Ref<boolean>>
  /** <IpAccessManager v-bind="ip.manager.value" /> — 확인 · 재인증 창도 이 안에 있다 */
  manager: ComputedRef<IpAccessManagerBindings<R>>
}
```

- 플러그인에 기대지 않는다. 고친 값 버리기 창(I21) · 쓰기 관문 창 모두 `manager` 바인딩으로 `IpAccessManager` 안에 그린다.
- `canManage()` 를 호출 시점마다 평가한다 — 창이 열린 사이 권한이 회수되면 확인 순간에 다시 보고 보내지 않는다(3e D10 과 같은 이유).

### 4-4. `IpAccessManager` (`components/ip-access/IpAccessManager.vue`, `generic="R extends AdminIpRule"`)

`IpAccessManagerBindings<R>` 를 받는다. 모양(이름은 플랜에서 확정):

- 목록: `rules` · `loading` · `loadFailed` · `onRetry` · `canManage` · `editing`
- 패널: `form` · `onUpdate:form` · `fieldErrors` · `onCidrBlur` · `teamMode` · `teamItems` · `teamsLoading` · `teamsFailed` · `teamHint` · `userMode` · `userItems` · `usersSearching` · `usersFailed` · `userHint` · `onSearchUsers` · `onOpenCreate` · `onOpenEdit(rule)` · `onCancel` · `onSave` · `onRemove(rule)` · `submitting` · `busy`
- 카드: `preview` · `lockedItems` · `changedItems` · `isSelf(item)` · `globalAllowRemoval`
- 알림: `alerts`(`{ kind: 'error' | 'warning'; text }[]`) · `onDismissAlert(index)`
- 창: `confirmDialog` · `reauthDialog`(`useWriteFlow` 바인딩 그대로) · `discardDialog`(고친 값 버리기 — `ConfirmDialog` 바인딩 모양)
- 표기: `messages`

컴포넌트 자체 prop 은 없다(규칙 목록에 시각 열이 없다). 내부 부품 `IpRuleTable` · `IpRuleEditor` · `IpPreviewCard` · `IpTargetField` 는 export 하지 않는다.

### 4-5. 문구 타입

- `AuditLogMessages`: 읽기 전용 안내 · 기간 힌트 · 묶음 힌트 · 정렬 라벨 · 칸 이름 · 행위자 권한 없음 · 검색 실패 · "이 사람 기록만" · 빈 상태 둘 · 조회 실패 · 다시 시도 · 기간 역전 · 번호 형식 둘 · "계정 없음" · "계정 정보 없음" · 결과 글자 넷 · 내역 / 접기 · 펼친 행 제목들 · 묶음 항목 `(label, prefix) => string` · 가려진 항목 `(keys) => string`.
- `IpAccessMessages`: 범위 라벨 · 층 라벨 · 상태 라벨 · 현재 IP 둘 · 통과 줄 · 기준 줄 넷 · 요약 · 잠기는 사람 줄 · 규칙만 바뀌는 사람 줄 · 미리보기 상태 문구 다섯 · 전체 허용 제거 경고 · 상시 문단 넷 · 관문 제목 · 머리말 · "되돌릴 수 없습니다" · 저장했지만 미리보기 없음 · 자기 잠금 주소 덧붙임 · revision 충돌 · 지워진 규칙 · 고친 값 버리기 확인 · 빈 목록 · CIDR 힌트 · 대상 없음 · "편집 중" · 후보 권한 없음 둘 · 후보 실패 둘.
- 함수 꼴 항목은 인자로 숫자 · 이름을 받아 문장을 낸다. 기본 문장은 §3 의 hangang 문구를 킷 용어(사용자 · 팀 · 전체 · "관리자" 대신 "사용자")로 옮기고 §2 결정을 반영한 것이다. 문장 하나하나는 플랜이 확정한다.

### 4-6. `index.ts`

새 절 "── 감사 로그 ──" · "── IP 접근 제어 ──":

- 값: `useAuditLogs` · `AuditLogViewer` · `useIpAccessRules` · `IpAccessManager`
- 타입: `UseAuditLogsOptions` · `AuditLogs` · `AuditLogDraft` · `AuditLogFilter` · `AuditActorOption` · `AuditActionGroup` · `AuditLogMessages` · `AuditLogViewerBindings` · `UseIpAccessRulesOptions` · `IpAccessRules` · `IpRuleForm` · `IpPreviewState` · `IpPreviewView` · `IpUserOption` · `IpWriteContext` · `IpAccessMessages` · `IpAccessManagerBindings`

## 5. 의존성

- 새 의존 없음.
- admin-ui `peerDependencies` `@ssworks/admin-shared`: `workspace:^0` → `workspace:>=0.4.0 <1.0.0`(C4). 발행 때 `>=0.4.0 <1.0.0` 이 된다. `devDependencies` 의 `workspace:*` 는 그대로다.

## 6. 파일

| 파일                                                                                                            | PR  | 내용                         |
| --------------------------------------------------------------------------------------------------------------- | --- | ---------------------------- |
| `packages/admin-ui/src/utils/format-date-time.ts`                                                               | 3f  | 초 옵션(C5)                  |
| `packages/admin-ui/src/utils/local-date.ts` · `.test.ts`                                                        | 3f  | A7                           |
| `packages/admin-ui/src/components/audit/audit-log.ts` · `.test.ts`                                              | 3f  | 타입 · 순수 함수 · 기본 문구 |
| `packages/admin-ui/src/composables/useAuditLogs.ts` · `.render.test.ts`                                         | 3f  | §4-1                         |
| `packages/admin-ui/src/components/audit/AuditLogViewer.vue` · 부품 셋 · `audit-log-viewer.render.test.ts`       | 3f  | §4-2                         |
| `packages/admin-ui/src/components/ip-access/ip-access.ts` · `.test.ts`                                          | 3g  | 타입 · 순수 함수 · 기본 문구 |
| `packages/admin-ui/src/composables/useIpAccessRules.ts` · `.render.test.ts`                                     | 3g  | §4-3                         |
| `packages/admin-ui/src/components/ip-access/IpAccessManager.vue` · 부품 넷 · `ip-access-manager.render.test.ts` | 3g  | §4-4                         |
| `packages/admin-ui/src/index.ts`                                                                                | 둘  | §4-6                         |
| `packages/admin-ui/package.json` · `README.md`                                                                  | 둘  | §5 · §8                      |
| `.changeset/README.md`                                                                                          | 3f  | peer 표                      |
| `.changeset/admin-ui-audit.md` · `admin-ui-ip-access.md`                                                        | 각  | §8                           |
| `CLAUDE.md` · `docs/01-phase0.md` · `docs/HANDOFF.md`                                                           | 각  | §8                           |

## 7. 테스트 계약

킷 규약: DOM 이 필요하면 파일 머리 `// @vitest-environment happy-dom`, 오버레이를 여는 테스트는 `installVisualViewport()` 를 모듈 최상단에서, 테스트 전용 `data-testid` 없이 글자 · 접근 이름 · `name` 으로 찾는다.

- **`audit-log.ts`**(단위):
  - `auditResultOf` 경계 199 · 200 · 299 · 300 · 399 · 400 · 499 · 500
  - 행위자 세 갈래 · 대상(종류 없음 · 번호 없음 · 모르는 종류는 원문)
  - 묶음: 둘 이상일 때만 · 값 끝 점 · 프로젝트 묶음 더하기 · prefix 같으면 라벨 덮어쓰기 · 묶음 먼저 · 개별은 `ACTION_VALUES` 순서
  - `toActionFilter`: 끝 점 → prefix · 아니면 exact · `''` → 없음
  - `diffAuditMeta`: meta null · before/after 없음(rest 만) · 키 합집합 · 같은 값 제외 · (없음) · `***` 는 masked · rest · 배열은 객체로 치지 않음 · 문자열이 아닌 값은 JSON
  - `auditFilterProblem`: 번호 둘 형식 · 기간 역전 · 같은 날 정상 · 한쪽만 정상
  - 서버 필터 변환: bigint · 끝 점 갈래 · 날짜 경계 · 빈 칸 생략
- **`local-date.ts`**: 형식 검증(`2026-02-30` 거부 포함) · 로컬 0시 · 다음 날 0시(월말 · 연말). 시간대와 무관하게 `new Date(y, m - 1, d)` 기준으로 잰다.
- **`useAuditLogs`**(happy-dom, 어댑터는 직접 푸는 Promise):
  - 입력 중 조회 0번 · [적용]에 1번 · 같은 조건 재적용에 1번(A2) · [초기화]
  - 검증 실패면 조회 0번 · `filterError` · 입력값 유지
  - `filterByActor`: 행위자만 바뀜 · 다른 입력값은 적용값으로 · `actorUserNo` null 행은 무시
  - 행위자 세 모드 · 게터 거짓이면 어댑터 0번 · 디바운스 · 늦은 응답 버림 · 검색 실패 문구 · 이름표 세 출처
  - URL 복원(입력값 · 적용값 둘 다) · 틀린 키 버림 · 적용이 URL 에 씀(`useServerTable.url.test.ts` 의 라우터 방식)
  - 적용하면 펼침 비움 · 해제 뒤 응답 무시
  - 정렬이 요청에 실림
- **`AuditLogViewer`**(happy-dom, 바인딩을 손으로 + 흐름과 함께):
  - 셀 글자 · 결과 칩 글자와 `errorCode` · "이 사람 기록만" 접근 이름 · 계정 없음 행에는 버튼 없음
  - "내역"을 누르면 그 행만 펼침 · "접기"
  - 바뀐 항목 표 · `fieldLabels` · 가려진 항목 · 기타 기록 · 기록 없음 · 요청 줄 · User-Agent
  - 빈 상태 둘 · 조회 실패 알림과 [다시 시도] · 정렬 라벨 · 필터 경고
  - `formatDate`
- **`ip-access.ts`**(단위):
  - `previewQueryOf`: `null` / `{}` / op 셋 · 전체면 `scopeRefNo` 없음 · 틀린 CIDR · 숫자 아닌 대상 → `null`
  - 요약 갈래(0명 · 판정 불가 · 새로 잠김 · 규칙만 바뀜) · 세션 줄 세 갈래 · 본인 표시 · 층 라벨 null
  - `removesGlobalAllow`: 전체 허용 삭제 · 좁히는 수정 · `global` 범위의 좁은 CIDR 삭제는 경고 아님(㉠) · `::/0` 을 수정으로 좁힘은 경고(㉡) · 만들기는 아님
  - `flattenTeamPaths`: 깊이 · 순서 · 빈 트리
  - 범위 셀 표기 · 대상 없음 · 409 문구에 주소 덧붙임 · 주소 없으면 그대로
- **`useIpAccessRules`**(happy-dom, 가짜 타이머):
  - 상태 기계 표(I11) 전부 · `null` 이 순번을 올림 · 권한 없으면 미리보기 0번 · `clientIp` 유지 · 404 면 재조회와 패널 닫음
  - 디바운스: 편집은 300ms · 현행 · 삭제는 바로 · 질의 키가 같으면 다시 안 부름
  - 저장: 가드 · 칸 검증이 관문 전 · `flushPreview` 뒤 관문 · 관문 문구가 최종 영향 · reauth / 확인 갈래 · 수정 본문 네 칸 + revision · 실패해도 재조회 · 만들기 뒤 재조회 실패에도 닫음 · 미리보기 없이 저장되면 노란 알림
  - 409 `ERR_COMMON_CONFLICT`: 빨간 알림 · `handled` · 주소
  - revision 충돌: 폼 유지 · 대상 행 교체 · 노란 알림 · 다음 저장은 새 revision · 사라진 규칙이면 닫음
  - 삭제: 관문 하나 · 문구에 되돌릴 수 없음 · 전체 허용 경고 · 취소면 미리보기 현행
  - 고친 값이 있으면 묻기(취소 · 버림) · 범위를 전체로 바꾸면 대상 비움
  - 후보: 팀 경로 · 사용자 검색 · 게터 거짓이면 0번 · 실패 문구 · 수정 때 미리 채움
  - 재조회 중 다른 규칙을 열면 뒤처리 안 함 · 해제 때 타이머 정리
- **`IpAccessManager`**(happy-dom):
  - 카드 줄(현재 IP · 모름 · 통과 · 기준 · 요약 · 두 목록 · 본인 · 경고 · 상시 문단)
  - 미리보기 상태 문구 여섯
  - 패널 칸 · 전체면 대상 칸 없음 · 대상 칸 세 모드 · CIDR 오류 · 저장 `:disabled` · `:loading`
  - 목록 셀 · "편집 중" · 대상 없음 · 읽기 전용이면 작업 열과 [새 규칙] 없음 · 빈 목록
  - 알림 둘과 닫기 · 관문 창 문구

## 8. 릴리스 · 문서

- **changeset**(PR 마다 admin-ui minor):
  - 3f 첫 줄 — 소비자가 할 일: admin-shared 를 0.4.0 이상으로(0.5.0 을 쓰면 없음). 내용: `useAuditLogs` · `AuditLogViewer`.
  - 3g — 할 일 없음. 내용: `useIpAccessRules` · `IpAccessManager`.
- **admin-ui README**:
  - "## Peer 의존" 표의 admin-shared 범위(3f).
  - "## 감사 로그"(3f): Phase 2 서버 배선(어댑터 · 페이지 예시) · `searchActors` 를 `/users` keyword 로 잇는 예와 `canSearchActors`(users 읽기 권한) · 다른 화면에서 거는 URL 링크 예 · `actionGroups` · `fieldLabels`.
  - "## IP 접근 제어"(3g): 어댑터 다섯과 `api.del(url, body)` · `reauth` 를 서버 옵션과 맞출 것 · 후보 어댑터와 권한 · 복구 안내 문구 바꾸기 · 서버가 매 요청 IP 를 본다는 것(세션 끊기 제안이 없는 이유) · 알려진 한계 · 수동 확인 항목.
- **`.changeset/README.md`**: "0.x 동안의 peer 범위" 표에서 admin-ui 를 `workspace:>=0.4.0 <1.0.0` 으로, 하한 문단에 admin-ui 를 더한다(3f).
- **진행 문서**: `CLAUDE.md` 진행표 · `docs/01-phase0.md` §8 에 3f · 3g 줄을 더한다. `docs/HANDOFF.md`:
  - 103행 "감사 화면(admin-ui 에 없다 — 템플릿 B …)" 을 바로잡는다(3f).
  - 174행 "템플릿에 없는 화면" 을 닫힌 것으로 적는다(3g).
  - 템플릿 `preset/admin` 에 페이지 둘(`pages/settings/audit-logs.vue` · `api/audit.ts`, `pages/settings/ip-access.vue` · `api/ip-access.ts`)을 반영하는 일을 넘긴다.
- **플랜 Task 에서 먼저 확인할 위험**:
  - ① 제네릭 SFC 두 벌(`AuditLogViewer` · `IpAccessManager`)의 선언이 `vite-plugin-dts` 로 빌드되는가(3d `TeamUserList` · 3e `LegalDocumentEditor` 선례).
  - ② `DataTableBody` 를 거쳐 `VDataTableServer` 의 `expanded` · `item-value` · `#expanded-row` 가 닿는가(hangang 은 attrs 투과로 썼다).
  - ③ `VAutocomplete` 서버 검색(`no-filter` · `@update:search`)이 happy-dom 에서 재현되는가.
  - ④ 고친 값 버리기 창과 `useWriteFlow` 관문 창이 같은 화면에 있을 때 두 `ConfirmDialog` 가 겹치지 않는가(삭제가 버리기를 먼저 묻는 경로 — I15)(3g).
- PR 마다 `pnpm check` 와 `/smoke`. Windows 긴 경로 때문에 `/smoke` 는 짧은 `%TEMP%` 경로에서 돌린다.

## 9. 기대는 서버 계약 (이미 있음 — 고치지 않음)

| 요청                                    | 쓰는 화면 | 기대는 사실                                                                                                                                                                |
| --------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET admin/audit-logs`                  | 3f        | 서버 페이징 · `createAt` 정렬만 · 필터 일곱 · `actionMatch` prefix 는 `LIKE 'x%'` · 기간 반열림 · 순서 역전은 400 · 슬롯 `auditLogs.read` · 이 라우트 자체는 감사하지 않음 |
| `GET admin/users?filter[keyword]`       | 3f · 3g   | 어댑터 `searchActors` · `searchUsers` 의 예시 출처(슬롯 `users.read`) — 킷은 이 라우트를 모른다                                                                            |
| `GET admin/teams/tree`                  | 3g        | 어댑터 `loadTeams` 의 예시 출처(슬롯 `teams.read`)                                                                                                                         |
| `GET admin/ip-access`                   | 3g        | `{ items }` 전량 · 서버 고정 정렬(범위 → 번호) · `scopeName` · `scopeUserId` · 대상이 지워지면 null                                                                        |
| `GET admin/ip-access/preview`           | 3g        | 슬롯 `ipAccess.manage` · op 없음 = 현행 · 없는 `ruleNo` 는 404 · `clientIp` · `clientPasses`(저장 때 자기 잠금이 쓰는 바로 그 판정) · 항목 순서 = 위험도 순                |
| `POST · PATCH · DELETE admin/ip-access` | 3g        | 만들기 201 `{ item }` · 수정 `{ item }` · 삭제 `{}` · 수정 · 삭제 본문 `revision` · `reauth` 옵션이면 본문 `currentPassword` · 409 두 갈래 · 400 `scopeRefNo`              |

- 킷 서버는 **로그인 · 매 요청 · 토큰 갱신**에서 IP 를 본다. 막힌 주소의 요청은 다음 요청부터 403 이고 규칙을 풀면 같은 세션이 다시 된다(2f-1). ⑥ S2 의 근거다.
- 감사 meta 는 `attachAuditDiff` 의 `{ before, after }`(평평한 객체 · `fields` 키만) + `attachAuditMeta` 의 다른 키다. 비밀 키 값은 쓸 때 `***` 로 가린다. 64 KiB 를 넘으면 자리표시만 남는다. A14 는 이 구조에 기댄다.

## 10. 비범위 · 보류

- 감사 로그 내보내기(CSV) — 세 정본 모두 없고 서버 라우트도 없다.
- 서버의 행위자 전용 라우트(gise `/actors`) · 감사 보존 · 청소(템플릿 B).
- 프로젝트별 감사 한 줄 요약(crm `summarizeAuditMeta` · gise `describeAuditContext`) — 필요해지면 슬롯을 연다.
- 대상 셀의 "이 대상 기록만" 버튼 — 대상은 URL 링크(A6)로 들어온다.
- 저장 뒤 세션 끊기 제안(⑥ S2).
- IP 편의 입력(crm `10.0.0.*` → CIDR) · "내 IP 넣기".
- 부품 SFC 의 공개(① L1 — 나중에 필요하면).
- 템플릿 `preset/admin` 반영 — HANDOFF 로 넘긴다.

## 11. 리뷰 중점 (테스트가 못 잡는 것)

1. **카드 문구의 무게** — "새로 잠김"과 "규칙만 바뀜"이 같은 강도로 읽히지 않는지(hangang: 같은 강도면 멀쩡한 변경을 되돌린다).
2. **관문 문구가 미리보기 실패를 "0명"으로 적지 않는지** — 테스트로 고정한 경로 밖에서.
3. **좁은 폭 배치** — 필터 칸 일곱 · 편집 패널 칸 넷이 줄바꿈되는지. 수동 확인 항목.
4. **자동완성 체감** — 디바운스 300ms 와 검색 중 표시. 수동 확인 항목.
5. **본인 판정이 `userId` 인 것** — `AdminUserInfo` 에 `userNo` 가 없다. 아이디가 바뀌는 서비스면 `isSelf` 를 넘겨야 한다(README).
