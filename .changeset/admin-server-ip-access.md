---
'@ssworks/admin-server': minor
'@ssworks/admin-shared': minor
---

**쓰는 쪽이 할 일:** 마이그레이션 폴더에 `0012_ip_access_rules` 스텁 한 줄을 더한다(`export { up, down } from '@ssworks/admin-server/migrations/0012_ip_access_rules'` — 🔴 모든 장 필수, global 허용 두 행이 시드된다). IP 접근 제어를 쓰면 `permissions` 에 슬롯 `'ipAccess.read'` · `'ipAccess.manage'` 를 잇고 `AdminIpAccessModule` 을 import 한다(역할 · 사용자 모듈을 쓰면 두 키도 `permissionCatalog` 안이어야 한다). 엣지 프록시가 `X-Real-IP` 를 덮어쓰면 코어 옵션 `clientIp: 'x-real-ip'`(아니면 `app.set('trust proxy', …)` 로 `req.ip` 를 맞춘다). 세션 · 감사의 IP 는 이제 정규화 값이다(`::ffff:127.0.0.1` → `127.0.0.1`). 사용자 수정의 `teamNo` 변경이 마지막 전권자에서 409 일 수 있고, IP 규칙이 가리키는 팀의 삭제는 409 `ERR_TEAM_HAS_IP_RULES` 다. refresh 가 막힌 주소에서 403 `ERR_IP_NOT_ALLOWED` 다. 쓰는 쪽 감사 카탈로그가 `setting.ipAccess.*` · `ipAccessRule`(또는 키 `IP_ACCESS_*` · `IP_ACCESS_RULE`)을 이미 정의했다면 겹침 검사가 던진다.

admin-server IP 접근 제어(Phase 2 PR 2f-1): `AdminIpAccessModule` — `/admin/ip-access` 다섯 라우트(목록 · 미리보기 · 만들기 201 `{ item }` · 수정 `{ item }` · 삭제 `{}`). 평가는 사용자 > 팀 > 전체 중 가장 가까운 층 하나 · 기본 거부 · IPv4 · IPv6, 로그인 · 매 요청 · refresh 가 막힌 주소에 403. 요청자 자신을 막는 변경은 409 `ERR_COMMON_CONFLICT` + `clientIp`, 마지막 도달 가능 전권자를 없애는 변경은 409. 전권자 잔존 셈은 IP 모듈이 있으면 적용 층이 global 인 사람만 센다. 코어 옵션 `clientIp`(`'req.ip'` 기본 · `'x-real-ip'`). 아직 `private` 이라 npm 에 나가지 않는다.

admin-shared: IP 파서 · 평가(`normalizeIp` · `isValidIp` · `parseCidr` · `isValidCidr` · `ipInCidr` · `applicableIpLayer` · `evaluateIpAccess` · `ipScopeProblem`), 규칙 · 미리보기 스키마(`ipCidrSchema` · `adminIpRule*Schema` · `adminIpPreview*Schema`), 코어 감사 액션 `setting.ipAccess.create` · `update` · `delete`("IP 규칙 추가 · 수정 · 삭제") · 대상 `ipAccessRule`("IP 규칙"), 오류 코드 `ERR_TEAM_HAS_IP_RULES`(409).
