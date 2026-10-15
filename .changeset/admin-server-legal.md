---
'@ssworks/admin-server': minor
'@ssworks/admin-shared': minor
---

**쓰는 쪽이 할 일:** 마이그레이션 폴더에 `0011_legal_documents` 스텁 한 줄을 더한다(`export { up, down } from '@ssworks/admin-server/migrations/0011_legal_documents'` — 모든 장 필수, 이미 돌린 DB 는 `kysely migrate` 한 번). 약관 모듈을 쓰면 `AdminServerModule` 옵션에 `legal: { kinds: ['TERMS', 'PRIVACY'] }`(쓰는 쪽 종류 카탈로그)와 `permissions` 의 슬롯 `'legal.read'` · `'legal.publish'` 를 잇고 `AdminLegalModule` 을 import 한다. 한글 1,000,000자 본문을 받으려면 `configureAdminApp(app, { jsonLimit: '4mb' })`.

admin-server 약관(Phase 2 PR 2e-2): `AdminLegalModule` — `/admin/legal-documents` 네 라우트(현재본 `{ item | null }` · 이력 최신순 전량(본문 없음) · 단건 · 발행 201 `{ legalDocNo, contentHash }`). 기준 판이 시행본이 아니면 409 `ERR_COMMON_REVISION_CONFLICT`, 시행본과 같은 본문이면 409 `ERR_COMMON_CONFLICT`. 해시는 서버가 sha256 으로 셈하고 표는 append-only 다. 발행은 `guard_locks` 행 `legalPublish` 로 직렬화된다. 종류 옵션이 없거나 형식 밖이면 기동에서 멈춘다. 아직 `private` 이라 npm 에 나가지 않는다.

admin-shared: 코어 감사 액션 `setting.legal.publish`("약관 발행")와 대상 `legalDocument`("약관"). 쓰는 쪽 감사 카탈로그(`defineAuditCatalog`)가 같은 값(`setting.legal.publish` · `legalDocument`)이나 키(`LEGAL_PUBLISH` · `LEGAL_DOCUMENT`)를 이미 정의했다면 겹침 검사로 던지므로 지운다.
