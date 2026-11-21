# 검증 — IP 접근 제어 확장 범위 (2026-11-21)

스펙 `docs/superpowers/specs/2026-11-21-admin-kit-ip-extra-scopes-design.md` · 플랜 `docs/superpowers/plans/2026-11-21-admin-kit-ip-extra-scopes.md` · 브랜치 `feat/ip-extra-scopes`(스펙 커밋 `bc3e8ca` 뒤 구현 · 문서 커밋 20개, 끝 `2d572d3`).

## 1. 전체 검사

- `pnpm check`(lint → typecheck → test → build → check:dts) — **종료 코드 0**. 워크스페이스 196 파일 · 2591 테스트 통과
- 코드를 고친 커밋 없음(이 Task 는 기록만 더한다)

## 2. 실 MariaDB

- 11.4(33306) `pnpm test:db` — 57 파일 · 566 테스트 통과
- 12.3(33307) `ADMIN_TEST_DB_URL=mariadb://root:admin-kit-test@127.0.0.1:33307 pnpm test:db` — 57 파일 · 566 테스트 통과

## 3. 스모크

작업 폴더는 `$LOCALAPPDATA/Temp` 아래(`aksx` · `aksu2`) — 끝난 뒤 지웠다. pack 한 판은 아직 0.14.0(changeset 이 0.15.0 으로 올리는 것은 Version Packages PR 때)이라 설치한 `@ssworks/admin-shared` 0.14.0 이 `>=0.15.0 <1.0.0` peer 하한에 못 미쳐 `pnpm peers check` 가 이 한 건만 보고한다(예상 — 발행 판에서는 사라진다).

- 서버 tarball(`aksx`) — `admin-shared` · `admin-server` 를 `pnpm pack` → `"type": "module"` · `strict` · `skipLibCheck: false` · `module: NodeNext` · 데코레이터 메타데이터 · 의존은 저장소 락파일의 판(`@nestjs/*` 12.1.3 · kysely 0.29.6 · zod 4.6.7 · typescript 6.0.3 · `@types/express` 5.0.6). `src/check.ts` 에 스펙 §10-1 의 `ipAccess.extraScopes` 옵션(`interface Database extends AdminDatabase` · 훅 `lock(trx: Transaction<Database>, …)` · `names(db: Kysely<Database>, …)` 를 `AdminServerOptions['ipAccess']` 에 대입)과 `ShippingIpGuard`(`AdminIpExtraScopeService.allows` · `clientIpOf` · `BusinessError`)를 적었다. `npx tsc --noEmit` — **오류 0**(훅 `Transaction<Database>` 이변성 통과)
- 화면 `/smoke`(`aksu2`) — `admin-ui` · `admin-shared` pack → vue 3.5.44 · vuetify 4.2.6 · pinia 4.1.0 · vite 8.3.4 · vue-tsc 3.3.13 등 락파일 판 설치(`vue-demi` 빌드 스크립트는 `allowBuilds: false`). `App.vue` 에 `useIpAccessRules({ …, extraScopes: [{ type: 'shippingToken', label: '출고 토큰', wholeLabel: '모든 출고 USB' }], focus: { scopeType: 'shippingToken', scopeRefNo: 1n } })` · `openCreate({ scopeType: 'shippingToken', scopeRefNo: 1n, cidr: '203.0.113.7/32' })` · `IpExtraScopeOption`(검색 어댑터 `search` 포함) 타입 · `<IpAccessManager v-bind="….manager.value" />` 둘. `vue-tsc --noEmit` — **오류 0** · `vite build` — **통과**(청크 크기 경고만)
- 편차: `/smoke` 3번의 「`@ssworks/admin-ui` 의 모든 export 를 한 번씩 쓴다」 는 하지 않았다 — 이번 변경 범위(IP 화면)만 쓰는 최소 앱이다. 앞선 PR 들의 전체 export 스모크는 그 PR 에서 했고 이번에 바뀐 export 는 위 셋(`useIpAccessRules` · `IpAccessManager` · `IpExtraScopeOption`)이다

## 4. 요구 대조(요청 문서 R1 ~ R9)

| 요구 | 결과 | 근거(시험 · 파일) |
| --- | --- | --- |
| R1 확장 범위 등록(이름 규칙 · 기동 검사 · 없으면 그대로) | 함 | `admin-shared/src/ip-access.test.ts`(이름 규칙) · `admin-server/src/ip-access/options.test.ts` · `options.types.test.ts` · `ip-access.module.test.ts`(기동에서 멈춤) · 기존 IP 시험이 그대로 통과 |
| R2 두 층 판정(대상 → 범위 전체 → 거부 · 주소 null 거부 · 범위 전체 끄기 `wholeScope`) | 함 | `admin-shared evaluateScopedIpAccess`(`ip-access.test.ts`) · `extra-scope.service.db.test.ts` · `ip-access.extra.db.test.ts` |
| R3 관리자 판정과 양방향 분리 | 함 | `ip-access.separation.db.test.ts`(코어 global 시드 → 확장 · 확장 → 로그인 · 매 요청 · 잔존 · 자기 잠금 · 미리보기) · `queries.test.ts` · `scope-check.test.ts` |
| R4 판정 함수 · 규칙 읽기 공개 | 함 | admin-shared `evaluateScopedIpAccess` · 서버 `AdminIpExtraScopeService`(`rulesOf` · `allows` · `clientIpOf` · `countRulesOf`) — `extra-scope.service.db.test.ts`. 예시 `ipRulesOfScope` 는 주입 서비스로 바꿈(스펙 §10-5) |
| R5 기존 라우트로 쓰기(revision · reauth · 감사 · 대상 훅) | 함 | `ip-access.extra.http.db.test.ts`(라우트 계약) · `ip-access.extra.db.test.ts`(잠금 순서 · 갈래 재확인 409 · 훅 첫 문장 잠금 읽기) · `ip-access.body.test.ts`. 훅 `exists · lock · names` 는 `lock · names` 로 합침, 수정의 범위 종류 바꾸기는 막음(§10-5) |
| R6 화면(범위 선택 · 대상 검색 · 미리보기 · 다른 화면에서 만들기 · 한 범위 모드) | 함(a · b · c · R6-1) | `ip-scope-choices.test.ts` · `ip-access-parts.render.test.ts` · `ip-access-manager.render.test.ts` · `useIpAccessRules.extra.render.test.ts` · `useIpAccessRules.focus.render.test.ts`(`openCreate` prefill · `focus`) · `useIpPreview.test.ts`('unrelated'). 화면 스모크 §3. 확장 규칙 미리보기는 「관리자 접속과 무관」 으로 보인다(§5-4) |
| R7 범위별 권한 | **하지 않음(사용자 결정 2026-11-21)** | 확장 규칙도 코어 슬롯 `ipAccess.read` · `ipAccess.manage`(전권 전용)가 다룬다 — 스펙 §10-2 · §10-5 |
| R8 대상이 사라졌을 때(이름 null · 판정 · 규칙 수) | 함 | 목록 `scopeName: null` · 화면 「대상 없음」 문구(`ip-access-parts.render.test.ts`) · `countRulesOf`(`extra-scope.service.db.test.ts`). 연쇄 검사는 쓰는 쪽 몫 |
| R9 기록(README · changeset minor · 시험 층) | 함 | `packages/admin-server/README.md` · `packages/admin-ui/README.md` · `.changeset/ip-extra-scopes.md`(minor · 세 패키지 0.15.0) · peer 하한 `>=0.15.0 <1.0.0` · CLAUDE.md 불변식 · HANDOFF. 시험: 단위 · DB 없는 HTTP · 실 MariaDB 11.4 · 12.3(§2) · admin-ui 렌더(§1) |

## 5. 넘긴 것

- 확장 규칙의 쓰는 쪽 영향(어느 토큰이 막히나) 미리보기 — 없음(스펙 §10-5)
- 출고 담당자 권한(R7) — 하지 않음, IP 규칙 권한자에게 요청하는 흐름
- 토큰 삭제 연쇄 검사(409) — 쓰는 쪽 몫(`countRulesOf` 제공)
- 실브라우저 · 실서버 화면 확인은 하지 않았다(타입 · 빌드 스모크까지) — 소비자(출고 관리 서비스)의 실전 검증에서 본다
- push · PR · 병합 · 발행은 사람이 한다

## 6. 최종 리뷰 반영

브랜치 전체 리뷰(`ea9bc5c` 뒤)가 찾은 것과 고친 커밋. 스펙 §11 ⑦ ~ ⑩ 이 같은 내용이다.

| #   | 찾은 것                                                                                                                                             | 고침                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `countRulesOf(…, db?: Kysely<AdminDatabase>)` 가 쓰는 쪽 `Transaction<Database>` 를 형변환 없이 받지 못한다 — §10-1 의 「쓰는 쪽 트랜잭션으로 센다」 가 타입에서 막힌다 | `8577385` — `db: Kysely<AdminDatabase> \| Transaction<AdminDatabase>`. `options.types.test.ts` 에 typecheck 시험(`Transaction<Database>` · `Kysely<Database>`) |
| 2   | 한 범위 모드가 카드를 그리지 않는데도 서버 미리보기(활성 사용자 · 세션 전수 스캔)를 마운트 · 편집 닫기마다 부른다                                     | `bb4e5a5` — 처음 부르기 끔(`immediate: false`) · 닫힌 상태의 대상도 `'unrelated'`. 시험: 마운트 · 열고 닫기 · 저장 · 삭제 · `reload` · 다시 시도에서 호출 0. 이 시험은 편집을 먼저 연 뒤라 아래 6 을 잡지 못했다 |
| 3   | 한 범위 모드의 `openEdit` 가 범위 밖 규칙도 연다 — 고정 대상(`pinFocus`)이 그 규칙의 대상을 조용히 덮어써 저장된다                                    | `eae3188` — 범위 밖 규칙이면 `false`. 시험 동반                                                                                         |
| 4   | 옵션에서 지운 범위의 행을 고치면 비밀번호를 물은 뒤에야 400 이다(트랜잭션 안 `assertRuleScope`)                                                       | `4876bae` — 재인증 앞 400 `issues[scopeType]`(`unknownScopeType`) · 삭제는 그대로. 실 DB 시험 동반(재인증 호출 0)                        |
| 5   | 문서가 최종 코드와 어긋난다 — 스펙 §10 소비자 인계(훅 요구 둘 · `countRulesOf` 트랜잭션 · `openCreate` 의 `false` 경우 · 새 타입 · 바인딩 · R8 수정 동작 · `names()` 노출 · 400 문구 둘), changeset 의 넓힌 타입 · 필수 문구 키, README 정렬 설명 | `88a0767` — 스펙 상태 · §4 ~ §5 · §10 · §11(구현 중 정정) · changeset · 두 README · 이 기록 |
| 6   | (5 를 고치며 찾음) 2 뒤에도 한 범위 모드의 처음 미리보기 대상이 `{ op: null }` 이다 — 편집 · 삭제를 열기 전의 `reload()` · 목록 오류의 다시 시도(`onRetry`)가 현행 미리보기를 한 번씩 부른다(임시 시험으로 확인 — 두 경우 모두 호출 1번) | `958e4bf` — setup 에서 `syncTarget()` 한 번(한 범위 모드면 처음부터 `'unrelated'` · 아니면 처음 값과 같아 바뀌지 않는다). 시험: 마운트 직후 `reload` · 다시 시도에서 호출 0 · 상태 `'unrelated'`(고치기 전 실패 — 호출 2번). 그 뒤 문서 커밋이 스펙 §5-3 · §10-1 · §10-5 · §11 ⑧ · admin-ui README · changeset · 이 기록의 단서를 지웠다 |

다시 돌린 결과(2026-11-21, 네 고침 커밋 뒤 — 문서 커밋은 코드를 바꾸지 않는다):

- `pnpm check`(lint → typecheck → test → build → check:dts) — **종료 코드 0**. 워크스페이스 196 파일 · 2594 테스트 통과(§1 의 2591 + 고침 시험 셋)
- 11.4(33306 · 서버 `11.4.13-MariaDB`) `pnpm test:db` — 57 파일 · 567 테스트 통과(§2 의 566 + `4876bae` 시험 하나)
- 12.3(33307 · 서버 `12.3.3-MariaDB`) `ADMIN_TEST_DB_URL=mariadb://root:admin-kit-test@127.0.0.1:33307 pnpm test:db` — 57 파일 · 567 테스트 통과
- 스모크(§3)는 다시 돌리지 않았다 — 고침 넷은 공개 타입을 넓히거나(`countRulesOf`) 내부 동작만 바꿨고, `countRulesOf` 의 쓰는 쪽 타입은 typecheck 시험이 잰다

`958e4bf` 뒤 다시 돌린 결과(2026-11-22 — admin-ui 만 바뀌어 실 MariaDB 시험은 다시 돌리지 않았다):

- `pnpm check`(lint → typecheck → test → build → check:dts) — **종료 코드 0**. 워크스페이스 196 파일 · 2595 테스트 통과(위 2594 + `958e4bf` 시험 하나)
- `pnpm format:check` · `pnpm lint` — 통과(문서 커밋 뒤)
